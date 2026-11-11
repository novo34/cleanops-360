#!/usr/bin/env python3
"""Single operator entry point for the B1 staging environment (decision U-6/U-6.1).

Subcommands: inventory (read-only) | install | enable | seed | route | smoke | rollback.
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
import subprocess
import sys
import tempfile
import urllib.error
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
    if args.pg_container:
        r = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", "ps", "--format", "{{.Names}}|{{.Image}}|{{.Status}}"],
                           capture_output=True, timeout=30)
        if r.returncode == 0:
            out.kv("CONTAINERS", ";".join(l for l in r.stdout.decode().splitlines() if re.search(r"cleanops|traefik|b1", l, re.I)))
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
          X-B1-Context: ""
    b1-staging-auth:
      forwardAuth:
        address: "{forward_auth_address}"
        trustForwardHeader: false
        authResponseHeaders: [X-B1-Context]
        tls:
          ca: "{tls_ca}"
          cert: "{tls_cert}"
          key: "{tls_key}"
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
    if not base.startswith("https://") or any(p in base for p in PROTECTED):
        raise Fail("BASE_URL_NOT_ALLOWED")
    ok = True
    # Negative checks only: no credentials, forged assertion must never be honoured.
    anon = _get(base + "/")
    out.kv("ANONYMOUS_ROOT_STATUS", anon)
    forged = _get(base + "/", {"X-B1-Context": "forged"})
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
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("inventory")
    i = sub.add_parser("install")
    i.add_argument("--approval-reference")
    i.add_argument("--database-url-file")
    sub.add_parser("retire")
    sub.add_parser("enable")
    sub.add_parser("seed")
    r = sub.add_parser("route")
    for n in ("backend-url", "forward-auth-address", "allow-ips", "tls-ca", "tls-cert", "tls-key"):
        r.add_argument("--" + n)
    s = sub.add_parser("smoke")
    s.add_argument("--base-url")
    b = sub.add_parser("rollback")
    b.add_argument("stage", choices=["route", "retire", "enable", "seed", "install"])
    return p


COMMANDS = {"inventory": cmd_inventory, "install": cmd_install, "enable": cmd_enable, "seed": cmd_seed,
            "route": cmd_route, "retire": cmd_retire, "smoke": cmd_smoke, "rollback": cmd_rollback}


def main(argv=None):
    args = parser().parse_args(argv)
    if args.command != "inventory" and args.database == "postgres" and args.command in ("install", "enable", "seed", "rollback"):
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
        out.finish(False, type(e).__name__)
        return 1


if __name__ == "__main__":
    sys.exit(main())
