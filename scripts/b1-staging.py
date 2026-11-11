#!/usr/bin/env python3
"""Single operator entry point for the B1 staging environment (decision U-6/U-6.1).

Subcommands: inventory | diagnose | diagnose-package | first-actor-info (read-only) | install | enable | seed | route | smoke |
retire | stop-legacy | package-origin | render-integration | approve-integration | rollback.
Stdlib only. Wraps the OFFICIAL artifacts (scripts/migrate-postgres.mjs, SQL14/0002/0003); it never
edits manifests, Compose, Traefik or SQL by hand and never prints secrets (URLs, passwords, cookies, keys).

Output is KEY=VALUE lines ending with RESULT=PASS|FAIL. Exit codes: 0 PASS, 1 FAIL,
3 STOP-AND-DESIGN (a guard says the premise is wrong: do not retry, do not write another script).

PostgreSQL access: --pg-container NAME (docker exec, default for the VPS) or, without it, the local
`psql` binary using the standard PG* environment variables (used by the tests).
"""
import argparse
import hashlib
import ipaddress
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL14_SHA = "965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa"
SQL14 = ROOT / "docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql"
HOST = "b1.cleanops.nuvurent.com"
ROUTE_FILE = "b1-staging.yml"
PINNED = {"b1_sql14": "docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql",
          "0002_first_actor": "db/migrations/0002_first_actor.review.sql",
          "0003_ingress_persistence": "db/migrations/0003_ingress_persistence.review.sql"}
RETIRE_PINS = {  # exact files seen by inventory on 2026-11-11 (U-4: cookie router, /b1-static canary, guarded router)
    "cleanops-b1-device-ui-v2.yaml": "9a29b3942a8a7eb582125dccebae1c5ce3dc6bc74ec267b264bf5a65ea27a979",
    "cleanops-b1-guarded.yaml": "329a12f860d06bffe52825b2dc681db589ee6111d74a35ff36c0505466c487ee"}
EXPECTED_MIGRATIONS = ("0002_first_actor", "0003_ingress_persistence")
PROTECTED = {"cleanops.nuvurent.com", "82.25.102.171"}
PROTECTED_IPS = ("82.25.102.171",)


class Fail(Exception):
    code = 1


class Stop(Fail):
    """STOP-AND-DESIGN: the premise is wrong; never retry with another script."""
    code = 3


class Out:
    def __init__(self, step):
        self.step, self.lines = step, []

    def kv(self, key, value):
        value = re.sub(r"[\r\n]+", " ", str(value))
        self.lines.append(f"{key}={value}")
        print(f"{key}={value}", flush=True)

    def finish(self, ok, reason=None):
        if reason:
            self.kv("REASON", reason)
        self.kv("RESULT", "PASS" if ok else "FAIL")


# ---------------------------------------------------------------- PostgreSQL

class Pg:
    def __init__(self, container=None, user="cleanops_bootstrap", database="postgres", read_only=False):
        self.container, self.user, self.database, self.read_only = container, user, database, read_only

    def run(self, sql, database=None, stdin=None):
        db = database or self.database
        opts = "-c default_transaction_read_only=on" if self.read_only else ""
        base = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", "-U", self.user, "-d", db]
        env = dict(os.environ)
        if self.container:
            cmd = ["docker", "--host=unix:///var/run/docker.sock", "exec", "-i", "-e", f"PGOPTIONS={opts}",
                   self.container, *base]
            for k in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
                env.pop(k, None)
        else:
            cmd = base
            if opts:
                env["PGOPTIONS"] = opts
        args = cmd + (["-f", "-"] if stdin is not None else ["-c", sql])
        r = subprocess.run(args, input=stdin, capture_output=True, env=env, timeout=180)
        if r.returncode:
            # stderr may carry object names but never secrets; still report only SQLSTATE-level info.
            m = re.search(rb"ERROR:\s+([0-9A-Z]{5})", r.stderr or b"")
            raise Fail("PG_OPERATION_FAILED" + (f":{m.group(1).decode()}" if m else ""))
        return r.stdout.decode().strip()


def pg_from(args, database=None, read_only=False):
    return Pg(args.pg_container, args.pg_user, database or args.database, read_only)


def sql14_hash_ok():
    return hashlib.sha256(SQL14.read_bytes()).hexdigest() == SQL14_SHA


def canonical_record():
    return json.loads((ROOT / "deploy/staging/RESOURCE_RECORD.json").read_text())["STAGING_SYNTHETIC"]


def script_sha():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def db_exists(pg, name):
    return pg.run(f"SELECT count(*) FROM pg_database WHERE datname='{name}'", "postgres") == "1"


def foreign_roles(pg):
    out = pg.run("SELECT rolname FROM pg_roles WHERE rolname LIKE 'cleanops\\_%' AND rolname<>'cleanops_bootstrap' ORDER BY 1", "postgres")
    return [r for r in out.splitlines() if r]


def first_actor_state(pg):
    if pg.run("SELECT to_regclass('identity_provision.first_actor') IS NOT NULL") != "t":
        return "absent"
    return pg.run("SELECT coalesce((SELECT state FROM identity_provision.first_actor WHERE singleton),'no-row')")


def inspect_private_package(out, private_dir, mtls_dir):
    """Non-secret facts only: listener binding/port/paths/issuer, pin match, key-source NAMES. Never key material."""
    f = Path(private_dir) / "installation.json"
    if not f.is_file():
        out.kv("PRIVATE_PACKAGE", "installation.json-absent")
        return
    m = json.loads(f.read_text())
    ing = m.get("ingress") or {}
    out.kv("PRIVATE_PACKAGE_VERSION", m.get("version"))
    out.kv("PACKAGE_ORIGIN", m.get("origin"))  # also the assertion audience: must be https://b1.cleanops.nuvurent.com
    out.kv("PACKAGE_INTERNAL_ORIGINS", json.dumps(m.get("internalOrigins")))
    for k in ("binding", "port", "issuer", "contextLifetimeMs", "drainTimeoutMs"):
        out.kv(f"INGRESS_{k.upper()}", ing.get(k))
    out.kv("INGRESS_ALLOWED_PATHS", ",".join(ing.get("allowedPaths") or []))
    out.kv("INGRESS_SOURCE_NAMES", ",".join(sorted((ing.get("sources") or {}))))
    out.kv("PSEUDONYM_KEY_SOURCE_DECLARED", str("pseudonymKey" in (ing.get("sources") or {})).lower())
    # Emulate lib/b1/private-file.ts metadata checks (declared vs actual); metadata only, never contents.
    problems, checked = [], 0

    def check(v, trail):
        nonlocal checked
        if isinstance(v, dict):
            if {"path", "uid", "gid", "mode", "maxBytes"} <= set(v):
                checked += 1
                rel = str(v["path"])[len(PACKAGE_MOUNT):] if str(v["path"]).startswith(PACKAGE_MOUNT) else None
                f = Path(private_dir) / rel if rel else None
                if f is None or not f.exists():
                    problems.append(f"{trail}:missing-or-outside-mount")
                else:
                    st = f.lstat()
                    bad = [n for n, ok in (("uid", st.st_uid == v["uid"]), ("gid", st.st_gid == v["gid"]),
                           ("mode", (st.st_mode & 0o7777) == v["mode"]), ("nlink", st.st_nlink == 1),
                           ("size", 1 <= st.st_size <= v["maxBytes"]), ("regular", f.is_file() and not f.is_symlink())) if not ok]
                    if bad:
                        problems.append(f"{trail}:{'+'.join(bad)}")
            for k, x in v.items():
                check(x, f"{trail}.{k}" if trail else k)
    check(m, "")
    out.kv("PRIVATE_FILE_SOURCES_CHECKED", checked)
    out.kv("PRIVATE_FILE_SOURCE_PROBLEMS", ";".join(problems) or "none")
    sink = m.get("sink") or {}
    out.kv("SINK_DECLARED", f"uid={sink.get('uid')},gid={sink.get('gid')},path={sink.get('path')},dirUid={sink.get('directoryUid')},dirGid={sink.get('directoryGid')},mode={oct(sink.get('mode') or 0)},dirMode={oct(sink.get('directoryMode') or 0)}")
    integ = m.get("integration") or {}
    src = (integ.get("source") or {}).get("path", "")
    if str(src).startswith(PACKAGE_MOUNT) and (Path(private_dir) / str(src)[len(PACKAGE_MOUNT):]).is_file():
        out.kv("INTEGRATION_SHA256_MATCHES", str(hashlib.sha256((Path(private_dir) / str(src)[len(PACKAGE_MOUNT):]).read_bytes()).hexdigest() == integ.get("sha256")).lower())
    if str(src).startswith(PACKAGE_MOUNT) and (Path(private_dir) / str(src)[len(PACKAGE_MOUNT):]).is_file():
        text = (Path(private_dir) / str(src)[len(PACKAGE_MOUNT):]).read_text(errors="replace")
        imports = [l.strip()[:200] for l in text.splitlines() if l.lstrip().startswith("import ")]
        out.kv("INTEGRATION_IMPORTS", " | ".join(re.sub(r"\{[^}]*\}", "{..}", i) for i in imports))  # module specifiers only
        aud = re.search(r'"audience"\s*:\s*"(https://[A-Za-z0-9.-]+)"', text)
        out.kv("INTEGRATION_AUDIENCE", aud.group(1) if aud else "not-found")
    d = Path(private_dir).stat()
    out.kv("PACKAGE_DIR", f"uid={d.st_uid},gid={d.st_gid},mode={oct(d.st_mode & 0o7777)}")
    pin = ing.get("proxyCertificateSha256")
    crt = Path(mtls_dir) / "traefik-client.crt" if mtls_dir else None
    if pin and crt and crt.is_file():
        der = ssl.PEM_cert_to_DER_cert(crt.read_text())
        out.kv("PROXY_CERT_PIN_MATCHES_TRAEFIK_CLIENT_CRT", str(hashlib.sha256(der).hexdigest() == re.sub(r"[^0-9a-f]", "", str(pin).lower())).lower())
    else:
        out.kv("PROXY_CERT_PIN_MATCHES_TRAEFIK_CLIENT_CRT", "unknown")
    out.kv("PROXY_CERT_PIN", pin)  # a public pin, not a secret
    for name in ("ingress-server.crt",):  # listener certificate: public SANs Traefik must be able to verify
        cf = Path(private_dir) / name
        if cf.is_file():
            try:
                d = ssl._ssl._test_decode_cert(str(cf))
                out.kv("INGRESS_SERVER_CERT_SANS", ",".join(v for _, v in d.get("subjectAltName", ())))
                out.kv("INGRESS_SERVER_CERT_SUBJECT", str(d.get("subject")))
            except Exception:
                out.kv("INGRESS_SERVER_CERT_SANS", "unreadable")
    if mtls_dir and Path(mtls_dir).is_dir():
        for c in sorted(Path(mtls_dir).glob("*.crt")):
            try:
                out.kv(f"MTLS_{c.name}_DER_SHA256", hashlib.sha256(ssl.PEM_cert_to_DER_cert(c.read_text())).hexdigest())
            except ValueError:
                out.kv(f"MTLS_{c.name}_DER_SHA256", "unparseable-or-chain")


def traefik_static_names(out, path):
    """Entrypoint and cert-resolver NAMES only from traefik.yml."""
    f = Path(path)
    if not f.is_file():
        out.kv("TRAEFIK_STATIC", "absent")
        return
    names, section = {"entryPoints": [], "certificatesResolvers": []}, None
    for line in f.read_text().splitlines():
        if re.match(r"^\S", line):
            section = line.split(":")[0] if line.split(":")[0] in names else None
        elif section and (mm := re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)):
            names[section].append(mm.group(1))
    out.kv("TRAEFIK_ENTRYPOINTS", ",".join(names["entryPoints"]))
    out.kv("TRAEFIK_CERT_RESOLVERS", ",".join(names["certificatesResolvers"]))


# ---------------------------------------------------------------- inventory

def cmd_inventory(args, out):
    out.kv("SCRIPT_SHA256", script_sha())
    out.kv("SQL14_ARTIFACT_SHA256_OK", str(sql14_hash_ok()).lower())
    if not sql14_hash_ok():
        raise Stop("SQL14_HASH_MISMATCH")
    pg = pg_from(args, "postgres", read_only=True)
    out.kv("PG_SERVER_VERSION_NUM", pg.run("SHOW server_version_num"))
    dbs = pg.run("SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1").splitlines()
    out.kv("DATABASES", ",".join(dbs))
    roles = pg.run("SELECT rolname FROM pg_roles WHERE rolname LIKE 'cleanops\\_%' ORDER BY 1").splitlines()
    out.kv("CLEANOPS_ROLES", ",".join(roles) or "none")
    target = args.database if args.database != "postgres" else canonical_record()["databaseName"]
    out.kv("TARGET_DATABASE", target)
    out.kv("TARGET_EXISTS", str(target in dbs).lower())
    if target in dbs:
        t = pg_from(args, target, read_only=True)
        out.kv("SCHEMAS", t.run("SELECT string_agg(nspname,',' ORDER BY nspname) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema')") or "none")
        reg = t.run("SELECT to_regclass('public._migrations') IS NOT NULL")
        out.kv("MIGRATION_JOURNAL", "present" if reg == "t" else "absent")
        if reg == "t":
            out.kv("MIGRATIONS", t.run("SELECT string_agg(id,',' ORDER BY id) FROM public._migrations") or "none")
            for mid, path in PINNED.items():
                row = t.run(f"SELECT checksum||'|'||source_commit FROM public._migrations WHERE id='{mid}'")
                if row:
                    checksum, commit = row.split("|", 1)
                    out.kv(f"JOURNAL_{mid}_MATCHES_REPO", str(checksum == hashlib.sha256((ROOT / path).read_bytes()).hexdigest()).lower())
                    out.kv(f"JOURNAL_{mid}_SOURCE_COMMIT", commit)
        cfg = t.run("SELECT CASE WHEN to_regclass('identity_private.configuration') IS NULL THEN 'absent' ELSE 'present' END")
        out.kv("CONFIGURATION_TABLE", cfg)
        if cfg == "present":
            out.kv("DEPLOYMENT_ENABLED", t.run("SELECT coalesce((SELECT deployment_enabled::text FROM identity_private.configuration WHERE singleton),'no-row')"))
        out.kv("FIRST_ACTOR_STATE", first_actor_state(t))
    out.kv("FOREIGN_ROLES_BLOCK_FRESH_INSTALL", str(bool([r for r in roles if r != "cleanops_bootstrap"])).lower())
    if args.traefik_dir:
        d = Path(args.traefik_dir)
        names = sorted(p.name for p in d.iterdir()) if d.is_dir() else []
        out.kv("TRAEFIK_DYNAMIC_FILES", ",".join(names) or "none")
        out.kv("B1_ROUTE_PRESENT", str(ROUTE_FILE in names).lower())
        for n in names:
            if n.startswith("cleanops-b1") and (d / n).is_file():
                out.kv(f"TRAEFIK_{n}_SHA256", hashlib.sha256((d / n).read_bytes()).hexdigest())
                text = (d / n).read_text(errors="replace")
                out.kv(f"TRAEFIK_{n}_ROUTER_RULES", ";".join(re.findall(r"rule:\s*(.+)", text))[:300])
    if args.traefik_dir:
        m = Path(args.traefik_dir) / "cleanops-b1-mtls"
        if m.is_dir():  # names, sizes and modes only; never contents
            out.kv("MTLS_DIR_ENTRIES", ";".join(f"{p.name}:{'d' if p.is_dir() else p.stat().st_size}:{oct(p.stat().st_mode & 0o777)}" for p in sorted(m.iterdir())))
    if args.private_dir:
        inspect_private_package(out, args.private_dir, str(Path(args.traefik_dir) / "cleanops-b1-mtls") if args.traefik_dir else None)
    if args.traefik_static:
        traefik_static_names(out, args.traefik_static)
    if args.pg_container:
        r = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", "ps", "--format", "{{.Names}}|{{.Image}}|{{.Status}}"],
                           capture_output=True, timeout=30)
        if r.returncode == 0:
            out.kv("CONTAINERS", ";".join(l for l in r.stdout.decode().splitlines() if re.search(r"cleanops|traefik|b1", l, re.I)))
        names = [l.split("|")[0] for l in r.stdout.decode().splitlines() if re.search(r"traefik|b1-shadow|f4fxmd-web|cleanops360-b1-web", l)]
        for n in names:
            i = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", "inspect", n], capture_output=True, timeout=30)
            if i.returncode:
                continue
            c = json.loads(i.stdout)[0]
            key = re.sub(r"[^A-Za-z0-9]+", "_", n)[:40]
            # Structure only: mount targets, network names, env VAR NAMES, ports. Never env values, labels' values or contents.
            out.kv(f"INSPECT_{key}_MOUNTS", ";".join(f"{m.get('Type')}:{m.get('Destination')}:{'ro' if not m.get('RW') else 'rw'}:{m.get('Name') or m.get('Source')}" for m in c.get("Mounts", [])))
            out.kv(f"INSPECT_{key}_NETWORKS", ",".join(c["NetworkSettings"]["Networks"]))
            out.kv(f"INSPECT_{key}_ALIASES", ";".join(f"{n}:{'/'.join(v.get('Aliases') or [])}" for n, v in c["NetworkSettings"]["Networks"].items()))
            out.kv(f"INSPECT_{key}_ENV_NAMES", ",".join(sorted(e.split("=", 1)[0] for e in c["Config"].get("Env", []))))
            out.kv(f"INSPECT_{key}_EXPOSED", ",".join(sorted((c["Config"].get("ExposedPorts") or {}))))
            for net in c["NetworkSettings"]["Networks"]:
                ni = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", "network", "inspect", net], capture_output=True, timeout=30)
                if ni.returncode == 0:
                    subnets = [x.get("Subnet") for x in (json.loads(ni.stdout)[0].get("IPAM", {}).get("Config") or [])]
                    out.kv(f"NETWORK_{re.sub(r'[^A-Za-z0-9]+', '_', net)[:40]}_SUBNETS", ",".join(filter(None, subnets)))
            out.kv(f"INSPECT_{key}_USER_IMAGE", f"{c['Config'].get('User') or 'default'}|{c['Config'].get('Image')}")
    out.finish(True)


# ---------------------------------------------------------------- install

def cmd_install(args, out):
    if not sql14_hash_ok():
        raise Stop("SQL14_HASH_MISMATCH")
    canonical = canonical_record()
    if args.database != canonical["databaseName"]:
        raise Stop(f"TARGET_DATABASE_NOT_SUPPORTED_BY_OFFICIAL_INSTALLER:{args.database}")
    if not args.approval_reference or not args.database_url_file:
        raise Fail("APPROVAL_REFERENCE_AND_DATABASE_URL_FILE_REQUIRED")
    url_file = Path(args.database_url_file)
    if (not url_file.is_absolute() or url_file.is_symlink() or not url_file.is_file()
            or url_file.resolve().is_relative_to(ROOT.resolve())):
        raise Fail("DATABASE_URL_FILE_MUST_BE_ABSOLUTE_PRIVATE_OUTSIDE_CHECKOUT")
    admin = pg_from(args, "postgres")
    if int(admin.run("SHOW server_version_num")) // 10000 != 16:
        raise Stop("PG16_REQUIRED")
    if not db_exists(admin, args.database):
        raise Stop("TARGET_DATABASE_MUST_EXIST_EMPTY")
    roles = foreign_roles(admin)
    if roles:
        # Cluster-global roles (U-2 premise): SQL14 creates them itself and refuses an existing set.
        raise Stop("EMPTY_CLUSTER_REQUIRED_FOREIGN_CLEANOPS_ROLES_PRESENT")
    record = {"STAGING_SYNTHETIC": {**canonical, "syntheticOnly": True, "realPersonalData": False,
              "productionDatabaseCopies": False, "externalCommunications": False, "branch": "staging",
              "deploymentAuthorized": True, "sql14FreshInstallAuthorized": True,
              "deploymentApprovalReference": args.approval_reference}}
    batch = subprocess.run(["node", str(ROOT / "scripts/migrate-postgres.mjs"), "--emit-sql14-batch"],
                           input=json.dumps(record).encode(), capture_output=True, timeout=60)
    if batch.returncode or not batch.stdout.endswith(SQL14.read_bytes()):
        raise Fail("BASELINE_BATCH_PREPARATION_FAILED")
    pg_from(args, args.database).run("", args.database, stdin=batch.stdout)
    out.kv("SQL14_INSTALLED", "true")
    env = dict(os.environ)
    env["DATABASE_URL"] = url_file.read_text().strip()  # never printed
    env["MIGRATION_APPROVAL_REFERENCE"] = args.approval_reference
    r = subprocess.run(["node", str(ROOT / "scripts/b1-apply-incremental.mjs")],
                       capture_output=True, env=env, cwd=ROOT, timeout=180)
    if r.returncode:
        raise Fail("MIGRATION_RUNNER_FAILED:" + (r.stderr.decode().strip().splitlines() or ["?"])[-1][:80])
    applied = json.loads(r.stdout.decode().strip().splitlines()[-1]).get("applied", [])
    out.kv("MIGRATIONS_APPLIED", ",".join(applied))
    if not all(any(a.startswith(e.split("_")[0]) for a in applied) for e in EXPECTED_MIGRATIONS):
        raise Fail("EXPECTED_MIGRATIONS_NOT_APPLIED")
    out.finish(True)


# ---------------------------------------------------------------- enable / seed

def _target(args, read_only=False):
    return pg_from(args, args.database, read_only)


def cmd_enable(args, out):
    pg = _target(args)
    state = first_actor_state(pg)
    out.kv("FIRST_ACTOR_STATE", state)
    if state != "COMMITTED":
        # Real order is install -> seed (first actor) -> enable; enabling earlier is a wrong premise.
        raise Stop("FIRST_ACTOR_NOT_COMMITTED_SEED_MUST_PRECEDE_ENABLE")
    pg.run("UPDATE identity_private.configuration SET deployment_enabled=true WHERE singleton AND NOT deployment_enabled")
    if pg.run("SELECT deployment_enabled::text FROM identity_private.configuration WHERE singleton") != "true":
        raise Fail("ENABLE_NOT_EFFECTIVE")
    out.kv("DEPLOYMENT_ENABLED", "true")
    out.finish(True)


def cmd_seed(args, out):
    """The first-actor ceremony is owner-interactive (password/TOTP); this only reports readiness."""
    pg = _target(args, read_only=True)
    out.kv("FIRST_ACTOR_STATE", first_actor_state(pg))
    out.kv("OPERATOR", "scripts/b1-private-operator.mjs first-actor.prepare|confirm|commit|status|abort (owner runs it; secrets never via chat)")
    out.kv("SEED_LIMIT", "one first actor only (one tenant, one user); further identities need a separate design")
    out.finish(True)


def cmd_first_actor_info(args, out):
    """Read-only: WHO the single seeded identity is (public request fields only; never material or receipt)."""
    pg = _target(args, read_only=True)
    state = first_actor_state(pg)
    out.kv("FIRST_ACTOR_STATE", state)
    if state in ("absent", "no-row"):
        out.finish(True)
        return
    row = pg.run("SELECT jsonb_build_object('email',manifest->>'email','tenantName',manifest->>'tenantName',"
                 "'displayName',manifest->>'displayName')::text FROM identity_provision.first_actor WHERE singleton")
    info = json.loads(row)
    for key, name in (("FIRST_ACTOR_EMAIL", "email"), ("FIRST_ACTOR_TENANT_NAME", "tenantName"), ("FIRST_ACTOR_DISPLAY_NAME", "displayName")):
        out.kv(key, re.sub(r"[^\w .@+'-]", "?", str(info.get(name) or "not-recorded"))[:254])
    out.finish(True)


# ---------------------------------------------------------------- route


def _valid_allow(entry):
    """Single host or narrow network only (IPv4 >= /24, IPv6 >= /64); never wildcard or protected hosts."""
    try:
        net = ipaddress.ip_network(entry, strict=True)
    except ValueError:
        return False
    if net.is_unspecified or net.prefixlen < (24 if net.version == 4 else 64):
        return False
    return not any(ipaddress.ip_address(p) in net for p in PROTECTED_IPS)


# Must equal assertionHeader in lib/b1/ingress-assertion.ts: the ONLY header copied from the ForwardAuth answer.
ASSERTION_HEADER = "X-Cleanops-B1-Assertion"
# Exactly the headers covered by requestBinding() plus the forwarding metadata Traefik rebuilds (single hop).
AUTH_REQUEST_HEADERS = ("Host, Authorization, Cookie, Origin, Content-Type, Content-Encoding, X-CSRF-Token, Idempotency-Key, "
                        "Sec-Fetch-Site, X-Forwarded-Method, X-Forwarded-Proto, X-Forwarded-Host, X-Forwarded-Uri, X-Forwarded-For")


def current_route_parameters(text):
    """Parameters of the route file this script wrote earlier, to re-render it without retyping any value."""
    if not text.startswith("# Managed by scripts/b1-staging.py (route)."):
        raise Stop("CURRENT_ROUTE_NOT_MANAGED_BY_THIS_SCRIPT")
    one = {"backend_url": r'^\s+- url: "([^"]+)"$', "forward_auth_address": r'^\s+address: "([^"]+)"$',
           "tls_ca": r'^\s+ca: "([^"]+)"$', "tls_cert": r'^\s+cert: "([^"]+)"$', "tls_key": r'^\s+key: "([^"]+)"$'}
    found = {k: re.findall(v, text, re.M) for k, v in one.items()}
    ips = re.findall(r'^\s+- "([0-9A-Fa-f:./]+)"$', text, re.M)
    if not ips or any(len(v) != 1 for v in found.values()):
        raise Stop("CURRENT_ROUTE_NOT_PARSEABLE")
    return {**{k: v[0] for k, v in found.items()}, "allow_ips": ",".join(ips)}


def render_route(host, backend_url, forward_auth_address, allow_ips, tls_ca, tls_cert, tls_key):
    if host != HOST:
        raise Fail("HOST_NOT_ALLOWED")
    ips = [i.strip() for i in allow_ips.split(",") if i.strip()]
    if not ips or not all(_valid_allow(i) for i in ips):
        raise Fail("ALLOW_IPS_INVALID_OR_WILDCARD")
    for value in (backend_url, forward_auth_address):
        if not re.match(r"^https?://[A-Za-z0-9._-]+(:\d+)?(/[A-Za-z0-9._/-]*)?$", value):
            raise Fail("URL_INVALID")
    for p in (tls_ca, tls_cert, tls_key):
        if not re.match(r"^/[A-Za-z0-9._/-]+$", p):
            raise Fail("TLS_PATH_INVALID")
    ips_yaml = "\n".join(f"          - \"{i}\"" for i in ips)
    return f"""# Managed by scripts/b1-staging.py (route). Do not edit by hand.
http:
  routers:
    b1-staging:
      rule: Host(`{host}`)
      entryPoints: [websecure]
      service: b1-staging
      middlewares: [b1-staging-allowlist, b1-staging-strip, b1-staging-auth]
      tls:
        certResolver: letsencrypt
  middlewares:
    b1-staging-allowlist:
      ipAllowList:
        sourceRange:
{ips_yaml}
    b1-staging-strip:
      headers:
        customRequestHeaders:
          {ASSERTION_HEADER}: ""
    b1-staging-auth:
      forwardAuth:
        address: "{forward_auth_address}"
        trustForwardHeader: false
        preserveRequestMethod: true
        forwardBody: true
        maxBodySize: 65536
        authRequestHeaders: [{AUTH_REQUEST_HEADERS}]
        authResponseHeaders: [{ASSERTION_HEADER}]
        tls:
          ca: "{tls_ca}"
          cert: "{tls_cert}"
          key: "{tls_key}"
          insecureSkipVerify: false
  services:
    b1-staging:
      loadBalancer:
        servers:
          - url: "{backend_url}"
"""


def _atomic_write(path, text):
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".b1-route-")
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def cmd_route(args, out):
    if not args.traefik_dir:
        raise Fail("TRAEFIK_DIR_REQUIRED")
    if args.reuse_current:  # same backend, address, allowlist and TLS paths; only the template changes
        current = Path(args.traefik_dir) / ROUTE_FILE
        if not current.is_file() or current.is_symlink():
            raise Stop("NO_CURRENT_ROUTE_TO_REUSE")
        for key, value in current_route_parameters(current.read_text()).items():
            if getattr(args, key):
                raise Fail(f"FLAG_NOT_ALLOWED_WITH_REUSE_CURRENT:{key}")
            setattr(args, key, value)
        out.kv("ROUTE_PARAMETERS", "reused-from-current-file")
        out.kv("ROUTE_PREVIOUS_SHA256", hashlib.sha256(current.read_bytes()).hexdigest())
    for need in ("backend_url", "forward_auth_address", "allow_ips", "tls_ca", "tls_cert", "tls_key"):
        if not getattr(args, need):
            raise Fail(f"MISSING_FLAG:{need}")
    text = render_route(HOST, args.backend_url, args.forward_auth_address, args.allow_ips,
                        args.tls_ca, args.tls_cert, args.tls_key)
    d = Path(args.traefik_dir)
    if not d.is_dir():
        raise Fail("TRAEFIK_DIR_MISSING")
    target = d / ROUTE_FILE
    if target.exists() and target.read_text() != text:
        (d.parent / f".{ROUTE_FILE}.prev").write_text(target.read_text())
    _atomic_write(target, text)
    out.kv("ROUTE_FILE", ROUTE_FILE)
    out.kv("ROUTE_SHA256", hashlib.sha256(text.encode()).hexdigest())
    out.kv("ROUTE_ALLOW_ENTRIES", len([i for i in args.allow_ips.split(",") if i.strip()]))
    out.kv("ROUTE_ASSERTION_HEADER", ASSERTION_HEADER)
    out.finish(True)


def cmd_retire(args, out):
    """Move ONLY the two pinned legacy router files out of the Traefik dynamic dir into a backup dir."""
    if not args.traefik_dir or not args.backup_dir:
        raise Fail("TRAEFIK_DIR_AND_BACKUP_DIR_REQUIRED")
    d, b = Path(args.traefik_dir).resolve(), Path(args.backup_dir)
    if not b.is_absolute() or b.resolve() == d or d in b.resolve().parents:
        raise Fail("BACKUP_DIR_MUST_BE_ABSOLUTE_AND_OUTSIDE_TRAEFIK_DIR")
    present = {n: d / n for n in RETIRE_PINS if (d / n).exists()}
    for n, f in present.items():
        if f.is_symlink() or hashlib.sha256(f.read_bytes()).hexdigest() != RETIRE_PINS[n]:
            raise Stop(f"LEGACY_ROUTER_FILE_CHANGED_SINCE_INVENTORY:{n}")
    b.mkdir(parents=True, exist_ok=True)
    for n, f in present.items():
        shutil.copy2(f, b / n)
        if hashlib.sha256((b / n).read_bytes()).hexdigest() != RETIRE_PINS[n]:
            raise Fail("BACKUP_VERIFY_FAILED")
        f.unlink()
        out.kv(f"RETIRED_{n}", "true")
    out.kv("ALREADY_ABSENT", ",".join(n for n in RETIRE_PINS if n not in present) or "none")
    out.finish(True)


PACKAGE_MOUNT = "/run/cleanops-b1-private/"
OLD_ORIGIN, NEW_ORIGIN = "https://cleanops.nuvurent.com", "https://b1.cleanops.nuvurent.com"


def derive_package(src, dst, validate=None):
    """New private package = exact copy of the reviewed one (owner/mode kept) with ONLY `origin` changed."""
    src, dst = Path(src), Path(dst)
    if not src.is_dir() or not src.is_absolute() or not dst.is_absolute() or dst.exists():
        raise Fail("SOURCE_MUST_EXIST_TARGET_MUST_NOT")
    if dst == src or src in dst.parents or dst in src.parents:
        raise Fail("TARGET_MUST_BE_SEPARATE_DIRECTORY")
    manifest = json.loads((src / "installation.json").read_text())
    if manifest.get("origin") != OLD_ORIGIN:
        raise Stop("SOURCE_ORIGIN_NOT_AS_INVENTORIED")
    dst.mkdir(mode=0o700, parents=True)
    try:
        st = src.stat()
        # Copy ONLY what the manifest references (no stale backups/pending files from the old package).
        wanted = {"installation.json"}

        def walk(v):
            if isinstance(v, str) and v.startswith(PACKAGE_MOUNT):
                wanted.add(v[len(PACKAGE_MOUNT):].split("/")[0])
            elif isinstance(v, dict):
                for x in v.values():
                    walk(x)
            elif isinstance(v, list):
                for x in v:
                    walk(x)
        walk(manifest)
        missing = sorted(n for n in wanted if not (src / n).is_file() or (src / n).is_symlink())
        if missing:
            raise Stop("REFERENCED_FILE_MISSING_OR_NOT_REGULAR:" + ",".join(missing))
        for f in sorted(src / n for n in wanted):
            data = f.read_bytes()
            if f.name == "installation.json":
                manifest["origin"] = NEW_ORIGIN
                data = (json.dumps(manifest, indent=2) + "\n").encode()
            t = dst / f.name
            fd = os.open(t, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as h:
                h.write(data)
            fs = f.stat()
            os.chown(t, fs.st_uid, fs.st_gid)
            os.chmod(t, fs.st_mode & 0o7777)
        os.chown(dst, st.st_uid, st.st_gid)
        os.chmod(dst, st.st_mode & 0o7777)
        if validate and not validate(dst):
            raise Stop("OFFLINE_VALIDATION_FAILED")
    except Exception:
        shutil.rmtree(dst, ignore_errors=True)
        raise


def cmd_package_origin(args, out):
    if not args.private_dir or not args.target_dir:
        raise Fail("PRIVATE_DIR_AND_TARGET_DIR_REQUIRED")

    def validate(d):  # the repo's own offline validators; prints nothing sensitive
        if not shutil.which("node"):
            # No host Node: the new service validates the package at startup and fails closed (no public effect).
            out.kv("OFFLINE_VALIDATION", "skipped-no-node-on-host")
            return True
        r = subprocess.run(["node", "--experimental-strip-types", str(ROOT / "scripts/complete-b1-installation.mjs"), str(d)],
                           capture_output=True, cwd=ROOT, timeout=60)
        out.kv("OFFLINE_VALIDATION_EXIT", r.returncode)
        return r.returncode == 0
    derive_package(args.private_dir, args.target_dir, validate)
    out.kv("NEW_PACKAGE_ORIGIN", NEW_ORIGIN)
    out.kv("NEW_MANIFEST_SHA256", hashlib.sha256((Path(args.target_dir) / "installation.json").read_bytes()).hexdigest())
    out.finish(True)


# ---------------------------------------------------------------- private integration module

RENDER_SCRIPT = "scripts/render-b1-integration.mjs"
_CONFIG_LINE = re.compile(r"^const configuration = (\{.*\});$", re.M)
_REFERENCE_BAD = re.compile(r"[\x00-\x1f\x7f-\x9f​-‏ -‮⁠-⁤﻿]")


def _integration_package(private_dir):
    """The DERIVED b1-host package only (never the original one): (dir, manifest, module path, backup dir)."""
    if not private_dir or not Path(private_dir).is_absolute():
        raise Fail("PRIVATE_DIR_REQUIRED")
    d = Path(private_dir)
    try:
        manifest = json.loads((d / "installation.json").read_text())
    except (OSError, ValueError):
        raise Stop("PRIVATE_PACKAGE_MANIFEST_UNREADABLE")
    if manifest.get("origin") != NEW_ORIGIN:
        raise Stop("NOT_A_DERIVED_B1_HOST_PACKAGE")
    src = str(((manifest.get("integration") or {}).get("source") or {}).get("path", ""))
    name = src[len(PACKAGE_MOUNT):]
    if not src.startswith(PACKAGE_MOUNT) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", name):
        raise Stop("INTEGRATION_SOURCE_NOT_IN_PACKAGE")
    return d, manifest, d / name, Path(str(d).rstrip("/") + ".integration-backup")


def _write_like(target, data, st):
    """Replace `target` atomically with a single-link file carrying the owner/mode of `st`."""
    tmp = target.with_name(target.name + ".b1-staging-tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as h:
            h.write(data)
            h.flush()
            os.fsync(h.fileno())
        os.chown(tmp, st.st_uid, st.st_gid)
        os.chmod(tmp, st.st_mode & 0o7777)
        os.replace(tmp, target)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def _restore_integration(d, module, backup):
    for f in (module, d / "installation.json"):
        b = backup / f.name
        if b.is_file():
            _write_like(f, b.read_bytes(), b.stat())
    shutil.rmtree(backup)


def cmd_render_integration(args, out):
    """Re-render integration.mjs of the DERIVED package with the branch renderer, inside an ephemeral offline
    container of the DEPLOYED image. Reuses the email report/approval already embedded in the current module
    (never printed). Does NOT touch installation.json: the owner approves the printed digest (approve-integration)."""
    d, manifest, module, backup = _integration_package(args.private_dir)
    if backup.exists():
        raise Stop("INTEGRATION_BACKUP_EXISTS_ROLLBACK_OR_APPROVE_FIRST")
    if not module.is_file() or module.is_symlink() or (d / "installation.json").is_symlink():
        raise Stop("INTEGRATION_MODULE_MISSING_OR_NOT_REGULAR")
    old = module.read_bytes()
    found = _CONFIG_LINE.search(old.decode("utf-8", errors="replace"))
    try:
        config = json.loads(found.group(1)) if found else None
    except ValueError:
        config = None
    if not isinstance(config, dict) or not isinstance(config.get("report"), dict) or not isinstance(config.get("approval"), dict):
        raise Stop("EMBEDDED_EMAIL_REPORT_OR_APPROVAL_NOT_FOUND")
    image = json.loads(docker("inspect", "cleanops360-b1-web"))[0]["Config"]["Image"]
    mst, gid = module.stat(), (d / "installation.json").stat().st_gid
    dst = d.stat()
    if dst.st_uid != os.getuid() or dst.st_mode & 0o300 != 0o300:
        raise Stop("PACKAGE_DIR_NOT_OWNER_WRITABLE")
    # The renderer derives the public half from the signing key. Root has no capabilities in the container,
    # so add the read-only bypass ONLY when plain owner/group bits would not let uid 0 / the sink gid read it.
    caps = []
    key = str((((manifest.get("ingress") or {}).get("sources") or {}).get("signingKey") or {}).get("path", ""))
    if key.startswith(PACKAGE_MOUNT) and (d / key[len(PACKAGE_MOUNT):]).is_file():
        ks = (d / key[len(PACKAGE_MOUNT):]).stat()
        if not ((ks.st_uid == 0 and ks.st_mode & 0o400) or (ks.st_gid == gid and ks.st_mode & 0o040)):
            caps = ["--cap-add", "DAC_READ_SEARCH"]
    out.kv("RENDER_EXTRA_CAPABILITIES", caps[1] if caps else "none")
    out.kv("OLD_INTEGRATION_SHA256", hashlib.sha256(old).hexdigest())
    backup.mkdir(mode=0o700)
    inputs = Path(tempfile.mkdtemp(prefix="b1-render-inputs-"))
    try:
        for f in (module, d / "installation.json"):
            _write_like(backup / f.name, f.read_bytes(), f.stat())
        for name in ("report", "approval"):
            fd = os.open(inputs / f"{name}.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
            with os.fdopen(fd, "w") as h:
                json.dump(config[name], h)
        os.chmod(inputs, 0o700)
        module.unlink()  # the renderer creates the module with O_EXCL and never overwrites
        # Root is required by the renderer (module is root:<sink gid> 0440); no network.
        result = docker("run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", *caps,
                        "--security-opt", "no-new-privileges:true", "--user", f"0:{gid}", "-w", "/app",
                        "-v", f"{d}:/run/cleanops-b1-private",
                        "-v", f"{inputs}:/run/b1-render-inputs:ro",
                        "-v", f"{ROOT / RENDER_SCRIPT}:/app/{RENDER_SCRIPT}:ro", image, "node", RENDER_SCRIPT,
                        "/run/cleanops-b1-private", "/run/b1-render-inputs/report.json", "/run/b1-render-inputs/approval.json",
                        str(os.getuid()), str(os.getgid()), "0400")
        rendered = json.loads(result[result.index("{"):])
        new = module.read_bytes()
        text = new.decode("utf-8", errors="replace")
        st = module.stat()
        if (hashlib.sha256(new).hexdigest() != rendered.get("sha256") or module.is_symlink() or st.st_nlink != 1 or
                (st.st_uid, st.st_gid, st.st_mode & 0o7777) != (mst.st_uid, mst.st_gid, mst.st_mode & 0o7777) or
                f'"audience":"{NEW_ORIGIN}"' not in text or "createIngressVerifier" not in text):
            raise Fail("RENDERED_MODULE_NOT_AS_EXPECTED")
    except Exception:
        _restore_integration(d, module, backup)
        raise
    finally:
        shutil.rmtree(inputs, ignore_errors=True)
    out.kv("NEW_INTEGRATION_SHA256", rendered["sha256"])
    out.kv("NEW_INTEGRATION_BYTES", len(new))
    out.kv("NEW_INTEGRATION_AUDIENCE", NEW_ORIGIN)
    out.kv("BACKUP_DIR", backup)
    out.kv("MANIFEST_UPDATED", "false")  # fail-closed until the owner approves this exact digest
    out.kv("NEXT", "approve-integration --sha256 <digest above> --approval-reference <owner reference>")
    out.finish(True)


def cmd_approve_integration(args, out):
    """Record the OWNER's approval of the rendered module: sets integration.sha256/approval in the derived manifest."""
    d, manifest, module, backup = _integration_package(args.private_dir)
    reference = args.approval_reference or ""
    if not reference.strip() or len(reference) > 512 or _REFERENCE_BAD.search(reference):
        raise Fail("APPROVAL_REFERENCE_REQUIRED")
    if not re.fullmatch(r"[0-9a-f]{64}", args.sha256 or ""):
        raise Fail("SHA256_REQUIRED")
    if not backup.is_dir():
        raise Stop("NO_RENDERED_MODULE_PENDING_APPROVAL")
    if not module.is_file() or module.is_symlink() or hashlib.sha256(module.read_bytes()).hexdigest() != args.sha256:
        raise Stop("MODULE_DIGEST_DIFFERS_FROM_APPROVED_DIGEST")
    target = d / "installation.json"
    manifest["integration"]["sha256"], manifest["integration"]["approval"] = args.sha256, reference
    _write_like(target, (json.dumps(manifest, indent=2) + "\n").encode(), target.stat())
    out.kv("INTEGRATION_SHA256", args.sha256)
    out.kv("NEW_MANIFEST_SHA256", hashlib.sha256(target.read_bytes()).hexdigest())
    out.kv("BACKUP_DIR", backup)
    out.finish(True)


LEGACY_CONTAINERS = {  # exact names/images inventoried 2026-11-11; no traffic since `retire`
    "cleanops360-b1-shadow-cc51574a": "cleanops360-b1-candidate:cc51574a",
    "cleanops360-b1-assets-shadow-296d4ef2": "cleanops360-b1-assets-candidate:296d4ef2"}


def docker(*args):
    r = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", *args], capture_output=True, timeout=120)
    if r.returncode:
        raise Fail("DOCKER_OPERATION_FAILED:" + args[0])
    return r.stdout.decode().strip()


def cmd_stop_legacy(args, out):
    """Stop (not remove) ONLY the two legacy shadow containers, after verifying their exact image."""
    for name, image in LEGACY_CONTAINERS.items():
        try:
            current = json.loads(docker("inspect", name))[0]
        except Fail:
            out.kv(f"{name}", "absent")
            continue
        if current["Config"]["Image"] != image:
            raise Stop(f"LEGACY_CONTAINER_IMAGE_CHANGED:{name}")
        if current["State"]["Running"]:
            docker("stop", "--time", "30", name)
        out.kv(f"STOPPED_{name}", "true")
    out.finish(True)


_SECRETISH = re.compile(r"[A-Za-z0-9+/_=-]{32,}|eyJ[A-Za-z0-9._-]+|(?i:cookie|authorization|set-cookie)[^,;]*")


def sanitize_log_line(line):
    """Drop anything token/cookie-like; keep the line short."""
    return _SECRETISH.sub("<redacted>", line)[:300]


def cmd_diagnose(args, out):
    """Read-only: filtered, sanitized log lines about the b1 route and the b1 web service."""
    pat = re.compile(r"b1|forward|cleanops-b1-ingress|x509|tls|certificate|handshake|refused|timeout|error|B1_", re.I)
    for container, tail, only in (("dokploy-traefik", 400, pat), ("cleanops360-b1-web", 60, None)):
        try:
            raw = docker("logs", "--tail", str(tail), container)
        except Fail:
            out.kv(f"LOGS_{container}", "unavailable")
            continue
        lines = [sanitize_log_line(l) for l in raw.splitlines() if only is None or only.search(l)]
        for i, l in enumerate(lines[-25:]):
            out.kv(f"LOG_{container}_{i:02d}", l)
    out.finish(True)


def cmd_diagnose_package(args, out):
    """Run the step-by-step installation loader in an ephemeral, offline, read-only container of the DEPLOYED image."""
    if not args.private_dir or not Path(args.private_dir).is_absolute():
        raise Fail("PRIVATE_DIR_REQUIRED")
    image = json.loads(docker("inspect", "cleanops360-b1-web"))[0]["Config"]["Image"]
    diag = ROOT / "scripts/diagnose-b1-installation.mjs"
    result = docker("run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                    "--user", "999:999", "-w", "/app", "-v", f"{args.private_dir}:/run/cleanops-b1-private:ro",
                    "-v", f"{diag}:/app/scripts/diagnose-b1-installation.mjs:ro", image, "node", "scripts/diagnose-b1-installation.mjs")
    for i, line in enumerate(result.splitlines()):
        out.kv(f"{i:02d}", sanitize_log_line(line))
    out.finish("STEP_FAIL" not in result)


# ---------------------------------------------------------------- smoke

def _get(url, headers=None, timeout=10):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def cmd_smoke(args, out):
    base = args.base_url or f"https://{HOST}"
    host = urllib.parse.urlsplit(base).hostname
    if not base.startswith("https://") or host in PROTECTED:  # exact host: b1.cleanops... is NOT cleanops...
        raise Fail("BASE_URL_NOT_ALLOWED")
    ok = True
    # Negative checks only: no credentials, forged assertion must never be honoured.
    anon = _get(base + "/")
    out.kv("ANONYMOUS_ROOT_STATUS", anon)
    forged = _get(base + "/", {ASSERTION_HEADER: "forged", "X-B1-Context": "forged"})
    out.kv("FORGED_ASSERTION_STATUS", forged)
    ok = anon < 500 and forged < 500 and forged == anon
    out.finish(ok, None if ok else "FORGED_HEADER_CHANGES_BEHAVIOUR_OR_5XX")


# ---------------------------------------------------------------- rollback

def cmd_rollback(args, out):
    stage = args.stage
    if stage == "route":
        if not args.traefik_dir:
            raise Fail("TRAEFIK_DIR_REQUIRED")
        t = Path(args.traefik_dir) / ROUTE_FILE
        if t.exists():
            t.unlink()
        out.kv("ROUTE_REMOVED", "true")
    elif stage == "retire":
        if not args.traefik_dir or not args.backup_dir:
            raise Fail("TRAEFIK_DIR_AND_BACKUP_DIR_REQUIRED")
        for n in RETIRE_PINS:
            src, dst = Path(args.backup_dir) / n, Path(args.traefik_dir) / n
            if src.is_file() and not dst.exists():
                shutil.copy2(src, dst)
                out.kv(f"RESTORED_{n}", "true")
    elif stage == "stop-legacy":
        for name in LEGACY_CONTAINERS:
            docker("start", name)
            out.kv(f"STARTED_{name}", "true")
    elif stage == "package-origin":
        t = Path(args.target_dir or "")
        try:
            ok = t.is_absolute() and json.loads((t / "installation.json").read_text()).get("origin") == NEW_ORIGIN
        except (OSError, ValueError):
            ok = False
        if not ok:
            raise Stop("TARGET_IS_NOT_A_DERIVED_B1_HOST_PACKAGE")
        shutil.rmtree(t)
        out.kv("DERIVED_PACKAGE_REMOVED", "true")
    elif stage == "render-integration":
        d, _, module, backup = _integration_package(args.private_dir)
        if not backup.is_dir() or not (backup / module.name).is_file() or not (backup / "installation.json").is_file():
            raise Stop("NO_INTEGRATION_BACKUP")
        _restore_integration(d, module, backup)
        out.kv("INTEGRATION_RESTORED_SHA256", hashlib.sha256(module.read_bytes()).hexdigest())
    elif stage == "enable":
        pg = _target(args)
        pg.run("UPDATE identity_private.configuration SET deployment_enabled=false WHERE singleton")
        out.kv("DEPLOYMENT_ENABLED", pg.run("SELECT deployment_enabled::text FROM identity_private.configuration WHERE singleton"))
    elif stage in ("seed", "install"):
        raise Stop(f"ROLLBACK_{stage.upper()}_REQUIRES_BACKUP_RESTORE_OR_DEDICATED_INSTANCE_DESIGN")
    out.finish(True)


# ---------------------------------------------------------------- main

def parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pg-container")
    p.add_argument("--pg-user", default="cleanops_bootstrap")
    p.add_argument("--database", default="postgres")
    p.add_argument("--traefik-dir")
    p.add_argument("--backup-dir")
    p.add_argument("--private-dir")
    p.add_argument("--target-dir")
    p.add_argument("--traefik-static")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("inventory")
    i = sub.add_parser("install")
    i.add_argument("--approval-reference")
    i.add_argument("--database-url-file")
    sub.add_parser("retire")
    sub.add_parser("package-origin")
    sub.add_parser("diagnose-package")
    sub.add_parser("render-integration")
    a = sub.add_parser("approve-integration")
    a.add_argument("--sha256")
    a.add_argument("--approval-reference")
    sub.add_parser("diagnose")
    sub.add_parser("stop-legacy")
    sub.add_parser("enable")
    sub.add_parser("seed")
    sub.add_parser("first-actor-info")
    r = sub.add_parser("route")
    for n in ("backend-url", "forward-auth-address", "allow-ips", "tls-ca", "tls-cert", "tls-key"):
        r.add_argument("--" + n)
    r.add_argument("--reuse-current", action="store_true")
    s = sub.add_parser("smoke")
    s.add_argument("--base-url")
    b = sub.add_parser("rollback")
    b.add_argument("stage", choices=["route", "retire", "package-origin", "render-integration", "stop-legacy", "enable", "seed", "install"])
    return p


COMMANDS = {"inventory": cmd_inventory, "install": cmd_install, "enable": cmd_enable, "seed": cmd_seed, "first-actor-info": cmd_first_actor_info,
            "route": cmd_route, "retire": cmd_retire, "diagnose-package": cmd_diagnose_package,
            "render-integration": cmd_render_integration, "approve-integration": cmd_approve_integration, "diagnose": cmd_diagnose, "stop-legacy": cmd_stop_legacy, "package-origin": cmd_package_origin, "smoke": cmd_smoke, "rollback": cmd_rollback}


def main(argv=None):
    args = parser().parse_args(argv)
    if args.command != "inventory" and args.database == "postgres" and args.command in ("install", "enable", "seed", "first-actor-info", "rollback"):
        if not (args.command == "rollback" and args.stage == "route"):
            args.database = canonical_record()["databaseName"]
    out = Out(args.command)
    out.kv("STEP", args.command)
    try:
        COMMANDS[args.command](args, out)
        return 0
    except Stop as e:
        out.kv("STOP_AND_DESIGN", "true")
        out.finish(False, str(e))
        return 3
    except Fail as e:
        out.finish(False, str(e))
        return 1
    except (OSError, subprocess.SubprocessError, ValueError, KeyError) as e:
        detail = type(e).__name__
        if isinstance(e, OSError) and e.filename:  # the path only, never contents
            detail += ":" + str(e.filename)
        out.finish(False, detail)
        return 1


if __name__ == "__main__":
    sys.exit(main())
