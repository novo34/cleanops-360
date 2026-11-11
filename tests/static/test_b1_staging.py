"""b1-staging.py against a DISPOSABLE PostgreSQL (CLEANOPS_B1_TEST_PG_PORT, default 54329). Skipped if absent."""
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/b1-staging.py"
PORT = os.environ.get("CLEANOPS_B1_TEST_PG_PORT", "54329")
ENV = {**os.environ, "PGHOST": "127.0.0.1", "PGPORT": PORT}
DB = "cleanops_staging"


def psql(sql, user="postgres", db="postgres"):
    r = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", db, "-c", sql],
                       capture_output=True, env=ENV, timeout=60)
    assert r.returncode == 0, r.stderr.decode()
    return r.stdout.decode().strip()


def available():
    return shutil.which("psql") and subprocess.run(["psql", "-U", "postgres", "-d", "postgres", "-Atc", "select 1"],
                                                   capture_output=True, env=ENV).returncode == 0


pytestmark = pytest.mark.skipif(not available(), reason="disposable PostgreSQL not available")


def run(*args):
    r = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, env=ENV, timeout=300, cwd=ROOT)
    out = dict(l.split("=", 1) for l in r.stdout.decode().splitlines() if "=" in l)
    return r.returncode, out


def wipe():
    psql(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)")
    for role in psql("SELECT rolname FROM pg_roles WHERE rolname LIKE 'cleanops\\_%'").splitlines():
        psql(f'DROP ROLE IF EXISTS "{role}"')


@pytest.fixture()
def cluster():
    wipe()
    psql("CREATE ROLE cleanops_bootstrap SUPERUSER LOGIN")
    psql(f"CREATE DATABASE {DB} OWNER cleanops_bootstrap")
    yield
    wipe()


def test_inventory_is_read_only_and_reports(cluster):
    code, out = run("--database", DB, "inventory")
    assert code == 0 and out["RESULT"] == "PASS"
    assert out["SQL14_ARTIFACT_SHA256_OK"] == "true" and out["TARGET_EXISTS"] == "true"
    assert out["CLEANOPS_ROLES"] == "cleanops_bootstrap"
    assert out["FOREIGN_ROLES_BLOCK_FRESH_INSTALL"] == "false"
    before = psql("SELECT count(*) FROM pg_roles")
    run("--database", DB, "inventory")
    assert psql("SELECT count(*) FROM pg_roles") == before


def test_install_refuses_foreign_roles_as_stop_and_design(cluster, tmp_path):
    psql("CREATE ROLE cleanops_stray")
    url = tmp_path / "url"
    url.write_text(f"postgres://cleanops_bootstrap@127.0.0.1:{PORT}/{DB}")
    code, out = run("--database", DB, "install", "--approval-reference", "test", "--database-url-file", str(url))
    assert code == 3 and out["STOP_AND_DESIGN"] == "true" and "FOREIGN_CLEANOPS_ROLES" in out["REASON"]
    assert psql("SELECT count(*) FROM pg_namespace WHERE nspname='identity_private'", db=DB) == "0"


def test_inventory_reports_journal_matches_after_install(cluster, tmp_path):
    url = tmp_path / "url"
    url.write_text(f"postgres://cleanops_bootstrap@127.0.0.1:{PORT}/{DB}")
    code, _ = run("--database", DB, "install", "--approval-reference", "t", "--database-url-file", str(url))
    assert code == 0
    code, out = run("--database", DB, "inventory")
    assert out["JOURNAL_0002_first_actor_MATCHES_REPO"] == "true" and out["JOURNAL_b1_sql14_MATCHES_REPO"] == "true"
    assert out["JOURNAL_0003_ingress_persistence_MATCHES_REPO"] == "true"


def test_install_rejects_other_database_name(cluster, tmp_path):
    code, out = run("--database", "cleanops_b1_staging", "install", "--approval-reference", "t",
                    "--database-url-file", str(tmp_path / "u"))
    assert code == 3 and "NOT_SUPPORTED_BY_OFFICIAL_INSTALLER" in out["REASON"]


def test_install_then_enable_requires_seed(cluster, tmp_path):
    url = tmp_path / "url"
    url.write_text(f"postgres://cleanops_bootstrap@127.0.0.1:{PORT}/{DB}")
    code, out = run("--database", DB, "install", "--approval-reference", "test-ref", "--database-url-file", str(url))
    if code != 0:
        pytest.skip(f"official installer needs a committed checkout: {out.get('REASON')}")
    assert out["SQL14_INSTALLED"] == "true" and "0002" in out["MIGRATIONS_APPLIED"] and "0003" in out["MIGRATIONS_APPLIED"]
    assert psql("SELECT to_regclass('identity_private.ingress_claims') IS NOT NULL", db=DB) == "t"
    code, out = run("--database", DB, "enable")
    assert code == 3 and "SEED_MUST_PRECEDE_ENABLE" in out["REASON"]
    code, out = run("--database", DB, "seed")
    assert code == 0 and out["FIRST_ACTOR_STATE"] != "COMMITTED"
    code, out = run("--database", DB, "inventory")
    assert out["MIGRATION_JOURNAL"] == "present" and out["DEPLOYMENT_ENABLED"] in ("false", "no-row")


def _module():
    spec = importlib.util.spec_from_file_location("b1_staging", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


GOOD = dict(host="b1.cleanops.nuvurent.com", backend_url="http://cleanops-web:3000",
            forward_auth_address="https://b1-forward-auth:8443/verify", allow_ips="203.0.113.7/32",
            tls_ca="/certs/ca.pem", tls_cert="/certs/c.pem", tls_key="/certs/k.pem")


def test_route_renders_single_router_with_allowlist():
    yaml = pytest.importorskip("yaml")
    doc = yaml.safe_load(_module().render_route(**GOOD))
    assert list(doc["http"]["routers"]) == ["b1-staging"]
    assert doc["http"]["routers"]["b1-staging"]["rule"] == "Host(`b1.cleanops.nuvurent.com`)"
    assert doc["http"]["middlewares"]["b1-staging-allowlist"]["ipAllowList"]["sourceRange"] == ["203.0.113.7/32"]
    fa = doc["http"]["middlewares"]["b1-staging-auth"]["forwardAuth"]
    assert fa["trustForwardHeader"] is False and fa["tls"]["ca"] == "/certs/ca.pem"
    assert doc["http"]["middlewares"]["b1-staging-strip"]["headers"]["customRequestHeaders"]["X-B1-Context"] == ""


@pytest.mark.parametrize("bad", ["0.0.0.0/0", "10.0.0.0/0", "", "82.25.102.171", "a.b.c.d", "1.2.3.4/33", "::/0", "2a02::/16", "203.0.113.0/8"])
def test_route_rejects_wildcard_or_protected_ips(bad):
    m = _module()
    with pytest.raises(m.Fail):
        m.render_route(**{**GOOD, "allow_ips": bad})


def test_route_rejects_other_host_and_writes_atomically(tmp_path):
    m = _module()
    with pytest.raises(m.Fail):
        m.render_route(**{**GOOD, "host": "cleanops.nuvurent.com"})
    code, out = run("--traefik-dir", str(tmp_path), "route", "--backend-url", GOOD["backend_url"],
                    "--forward-auth-address", GOOD["forward_auth_address"], "--allow-ips", GOOD["allow_ips"],
                    "--tls-ca", GOOD["tls_ca"], "--tls-cert", GOOD["tls_cert"], "--tls-key", GOOD["tls_key"])
    assert code == 0 and (tmp_path / "b1-staging.yml").is_file()
    code, out = run("--traefik-dir", str(tmp_path), "rollback", "route")
    assert code == 0 and not (tmp_path / "b1-staging.yml").exists()


def test_route_accepts_ipv6_single_host():
    yaml = pytest.importorskip("yaml")
    doc = yaml.safe_load(_module().render_route(**{**GOOD, "allow_ips": "2001:db8::1/128"}))
    assert doc["http"]["middlewares"]["b1-staging-allowlist"]["ipAllowList"]["sourceRange"] == ["2001:db8::1/128"]


def test_retire_moves_only_pinned_files_and_rollback_restores(tmp_path):
    m = _module()
    d, b = tmp_path / "dyn", tmp_path / "bak"
    d.mkdir()
    (d / "keep.yml").write_text("keep")
    # Files whose hash does not match the inventory pin must be refused (STOP-AND-DESIGN).
    (d / "cleanops-b1-guarded.yaml").write_text("changed")
    code, out = run("--traefik-dir", str(d), "--backup-dir", str(b), "retire")
    assert code == 3 and (d / "cleanops-b1-guarded.yaml").exists()
    # Absent pinned files: no-op PASS; unrelated files untouched.
    (d / "cleanops-b1-guarded.yaml").unlink()
    code, out = run("--traefik-dir", str(d), "--backup-dir", str(b), "retire")
    assert code == 0 and (d / "keep.yml").exists()
    # Backup dir inside the Traefik dir is refused.
    code, out = run("--traefik-dir", str(d), "--backup-dir", str(d / "bak"), "retire")
    assert code == 1


def test_retire_with_matching_pins(tmp_path, monkeypatch):
    m = _module()
    import hashlib
    d, b = tmp_path / "dyn", tmp_path / "bak"
    d.mkdir()
    content = b"x: 1\n"
    name = "cleanops-b1-guarded.yaml"
    (d / name).write_bytes(content)
    monkeypatch.setitem(m.RETIRE_PINS, name, hashlib.sha256(content).hexdigest())
    args = m.parser().parse_args(["--traefik-dir", str(d), "--backup-dir", str(b), "retire"])
    out = m.Out("retire")
    m.cmd_retire(args, out)
    assert not (d / name).exists() and (b / name).read_bytes() == content
    args = m.parser().parse_args(["--traefik-dir", str(d), "--backup-dir", str(b), "rollback", "retire"])
    m.cmd_rollback(args, m.Out("rollback"))
    assert (d / name).read_bytes() == content


def test_inventory_private_package_and_traefik_names(tmp_path):
    import hashlib, ssl, subprocess as sp
    key, crt = tmp_path / "k", tmp_path / "dyn/cleanops-b1-mtls/traefik-client.crt"
    crt.parent.mkdir(parents=True)
    sp.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", str(key),
            "-out", str(crt), "-subj", "/CN=t", "-days", "1"], check=True, capture_output=True)
    pin = hashlib.sha256(ssl.PEM_cert_to_DER_cert(crt.read_text())).hexdigest()
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    (pkg / "installation.json").write_text(json.dumps({"version": 2, "ingress": {"binding": "0.0.0.0", "port": 8443,
        "allowedPaths": ["/forward-auth"], "issuer": "x", "proxyCertificateSha256": pin,
        "sources": {"signingKey": {"path": "/secret/never-printed"}, "pseudonymKey": {"path": "/secret/never-printed"}}}}))
    ts = tmp_path / "traefik.yml"
    ts.write_text("entryPoints:\n  web:\n    address: :80\n  websecure:\n    address: :443\ncertificatesResolvers:\n  letsencrypt:\n    acme:\n      email: a@b\n")
    m = _module()
    out = m.Out("t")
    m.inspect_private_package(out, str(pkg), str(crt.parent))
    m.traefik_static_names(out, str(ts))
    text = "\n".join(out.lines)
    assert "INGRESS_PORT=8443" in text and "PROXY_CERT_PIN_MATCHES_TRAEFIK_CLIENT_CRT=true" in text
    assert "PSEUDONYM_KEY_SOURCE_DECLARED=true" in text and "never-printed" not in text
    assert "TRAEFIK_ENTRYPOINTS=web,websecure" in text and "TRAEFIK_CERT_RESOLVERS=letsencrypt" in text and "a@b" not in text


def test_b1_web_service_compose_has_no_public_surface():
    yaml = pytest.importorskip("yaml")
    doc = yaml.safe_load((ROOT / "deploy/staging/compose.b1-web-service.yaml").read_text())
    svc = doc["services"]["b1-web"]
    assert "ports" not in svc and svc["labels"] == {"traefik.enable": "false"}
    assert svc["environment"]["CLEANOPS_AUTH_ORIGIN"] == "https://b1.cleanops.nuvurent.com"
    assert svc["read_only"] is True and svc["cap_drop"] == ["ALL"] and svc["user"] == "999:999"
    assert all(n["external"] for n in doc["networks"].values()) and doc["volumes"]["identity_agent_sink"]["external"]
    assert all(m.get("read_only") for m in svc["volumes"])
    assert svc["networks"]["dokploy"]["aliases"] == ["cleanops-b1-ingress"]


def test_derive_package_changes_only_origin(tmp_path):
    m = _module()
    src, dst = tmp_path / "src", tmp_path / "dst"
    src.mkdir()
    manifest = {"version": 2, "origin": "https://cleanops.nuvurent.com", "internalOrigins": ["http://127.0.0.1:3000"], "x": {"y": 1}}
    manifest["sources"] = {"key": {"path": "/run/cleanops-b1-private/k.key"}}
    (src / "installation.json").write_text(json.dumps(manifest))
    (src / "stale.json.before-1").write_text("old")
    (src / "k.key").write_bytes(b"secret")
    os.chmod(src / "k.key", 0o440)
    m.derive_package(src, dst)
    new = json.loads((dst / "installation.json").read_text())
    assert new.pop("origin") == "https://b1.cleanops.nuvurent.com"
    manifest.pop("origin")
    assert new == manifest and (dst / "k.key").read_bytes() == b"secret"
    assert sorted(p.name for p in dst.iterdir()) == ["installation.json", "k.key"]  # stale backups not copied
    assert (dst / "k.key").stat().st_mode & 0o777 == 0o440
    with pytest.raises(m.Fail):
        m.derive_package(src, dst)  # target exists
    (src / "installation.json").write_text(json.dumps({**manifest, "origin": "https://other"}))
    with pytest.raises(m.Stop):
        m.derive_package(src, tmp_path / "dst2")
    assert not (tmp_path / "dst2").exists()
    (src / "installation.json").write_text(json.dumps({**manifest, "origin": "https://cleanops.nuvurent.com"}))
    with pytest.raises(m.Stop):
        m.derive_package(src, tmp_path / "dst3", validate=lambda d: False)
    assert not (tmp_path / "dst3").exists()


def test_pin_comparison_accepts_colon_uppercase(tmp_path):
    import hashlib, ssl, subprocess as sp
    crt = tmp_path / "m/traefik-client.crt"
    crt.parent.mkdir()
    sp.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", str(tmp_path / "k"),
            "-out", str(crt), "-subj", "/CN=t", "-days", "1"], check=True, capture_output=True)
    h = hashlib.sha256(ssl.PEM_cert_to_DER_cert(crt.read_text())).hexdigest().upper()
    pin = ":".join(h[i:i + 2] for i in range(0, 64, 2))
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    (pkg / "installation.json").write_text(json.dumps({"ingress": {"proxyCertificateSha256": pin}}))
    m = _module()
    out = m.Out("t")
    m.inspect_private_package(out, str(pkg), str(crt.parent))
    assert "PROXY_CERT_PIN_MATCHES_TRAEFIK_CLIENT_CRT=true" in out.lines


def test_package_origin_without_node_skips_validation_and_reports_paths(tmp_path, monkeypatch):
    m = _module()
    src, dst = tmp_path / "src", tmp_path / "dst"
    src.mkdir()
    (src / "installation.json").write_text(json.dumps({"origin": "https://cleanops.nuvurent.com"}))
    monkeypatch.setattr(m.shutil, "which", lambda name: None)
    args = m.parser().parse_args(["--private-dir", str(src), "--target-dir", str(dst), "package-origin"])
    out = m.Out("t")
    m.cmd_package_origin(args, out)
    assert "OFFLINE_VALIDATION=skipped-no-node-on-host" in out.lines and (dst / "installation.json").exists()
    # A missing source file is reported with its path, not a bare exception name.
    code, o = run("--private-dir", str(tmp_path / "nope"), "--target-dir", str(tmp_path / "d2"), "package-origin")
    assert code == 1 and "nope" in o["REASON"] or o["REASON"].startswith("SOURCE_MUST")


def test_rollback_package_origin_only_removes_derived_package(tmp_path):
    d = tmp_path / "d"
    d.mkdir()
    (d / "installation.json").write_text(json.dumps({"origin": "https://cleanops.nuvurent.com"}))
    code, out = run("--target-dir", str(d), "rollback", "package-origin")
    assert code == 3 and d.exists()  # the ORIGINAL package must never be removable this way
    (d / "installation.json").write_text(json.dumps({"origin": "https://b1.cleanops.nuvurent.com"}))
    code, out = run("--target-dir", str(d), "rollback", "package-origin")
    assert code == 0 and not d.exists()


def test_inventory_reports_listener_cert_sans(tmp_path):
    import subprocess as sp
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    (pkg / "installation.json").write_text(json.dumps({"ingress": {}}))
    sp.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", str(tmp_path / "k"),
            "-out", str(pkg / "ingress-server.crt"), "-subj", "/CN=svc", "-days", "1", "-addext", "subjectAltName=DNS:svc-a,DNS:svc-b"],
           check=True, capture_output=True)
    m = _module()
    out = m.Out("t")
    m.inspect_private_package(out, str(pkg), None)
    assert "INGRESS_SERVER_CERT_SANS=svc-a,svc-b" in out.lines


def test_stop_legacy_verifies_images_and_stops_only_those(monkeypatch):
    m = _module()
    calls = []
    state = {n: {"Config": {"Image": i}, "State": {"Running": True}} for n, i in m.LEGACY_CONTAINERS.items()}

    def fake(*a):
        calls.append(a)
        if a[0] == "inspect":
            if a[1] not in state:
                raise m.Fail("x")
            return json.dumps([state[a[1]]])
        return ""
    monkeypatch.setattr(m, "docker", fake)
    args = m.parser().parse_args(["stop-legacy"])
    m.cmd_stop_legacy(args, m.Out("t"))
    assert sorted(c[-1] for c in calls if c[0] == "stop") == sorted(m.LEGACY_CONTAINERS)
    calls.clear()
    state["cleanops360-b1-shadow-cc51574a"]["Config"]["Image"] = "other:1"
    with pytest.raises(m.Stop):
        m.cmd_stop_legacy(args, m.Out("t"))
    assert not [c for c in calls if c[0] == "stop"]
    calls.clear()
    m.cmd_rollback(m.parser().parse_args(["rollback", "stop-legacy"]), m.Out("t"))
    assert sorted(c[-1] for c in calls if c[0] == "start") == sorted(m.LEGACY_CONTAINERS)


def test_smoke_accepts_b1_host_and_rejects_protected_hosts(monkeypatch):
    m = _module()
    monkeypatch.setattr(m, "_get", lambda url, headers=None, timeout=10: 403)
    out = m.Out("t")
    m.cmd_smoke(m.parser().parse_args(["smoke"]), out)  # default https://b1.cleanops.nuvurent.com
    assert "RESULT=PASS" in out.lines and "ANONYMOUS_ROOT_STATUS=403" in out.lines
    for bad in ("https://cleanops.nuvurent.com", "https://82.25.102.171", "http://b1.cleanops.nuvurent.com"):
        with pytest.raises(m.Fail):
            m.cmd_smoke(m.parser().parse_args(["smoke", "--base-url", bad]), m.Out("t"))


def test_diagnose_filters_and_redacts(monkeypatch):
    m = _module()
    secret = "A" * 40
    logs = {"dokploy-traefik": f"ok line\nerror calling https://cleanops-b1-ingress:8443/forward-auth: x509: bad token={secret}\nCookie: session=abc",
            "cleanops360-b1-web": f"B1 start failed code=B1_X {secret}"}
    monkeypatch.setattr(m, "docker", lambda *a: logs[a[-1]])
    out = m.Out("t")
    m.cmd_diagnose(m.parser().parse_args(["diagnose"]), out)
    text = "\n".join(out.lines)
    assert "x509" in text and "B1_X" in text and secret not in text and "session=abc" not in text and "ok line" not in text


def test_inventory_flags_private_file_metadata_problems(tmp_path):
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    good, bad = pkg / "good.key", pkg / "bad.key"
    good.write_bytes(b"x")
    bad.write_bytes(b"x")
    os.chmod(good, 0o440)
    os.chmod(bad, 0o600)
    uid, gid = good.stat().st_uid, good.stat().st_gid
    src = lambda n, mode: {"path": f"/run/cleanops-b1-private/{n}", "uid": uid, "gid": gid, "mode": mode, "maxBytes": 10}
    (pkg / "installation.json").write_text(json.dumps({"ingress": {"sources": {"a": src("good.key", 0o440), "b": src("bad.key", 0o440), "c": src("gone.key", 0o440)}}}))
    m = _module()
    out = m.Out("t")
    m.inspect_private_package(out, str(pkg), None)
    text = "\n".join(out.lines)
    assert "PRIVATE_FILE_SOURCES_CHECKED=3" in text
    assert "ingress.sources.b:mode" in text and "ingress.sources.c:missing-or-outside-mount" in text and "sources.a:" not in text


def test_inventory_reports_integration_imports_and_audience(tmp_path):
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    (pkg / "integration.mjs").write_text('import { a } from "file:///app/lib/b1/old-verifier.ts";\nconst c = {"audience":"https://x.example","secretish":"zzz"};\n')
    (pkg / "installation.json").write_text(json.dumps({"integration": {"source": {"path": "/run/cleanops-b1-private/integration.mjs"}, "sha256": "0"}}))
    m = _module()
    out = m.Out("t")
    m.inspect_private_package(out, str(pkg), None)
    text = "\n".join(out.lines)
    assert "old-verifier.ts" in text and "INTEGRATION_AUDIENCE=https://x.example" in text and "zzz" not in text


def test_diagnose_package_runs_offline_readonly_container(monkeypatch, tmp_path):
    m = _module()
    seen = []

    def fake(*a):
        seen.append(a)
        if a[0] == "inspect":
            return json.dumps([{"Config": {"Image": "img:1"}}])
        return "IDENTITY uid=999 gid=999\nSTEP_OK manifest-read\nSTEP_FAIL integration INTEGRATION_EXPORTS"
    monkeypatch.setattr(m, "docker", fake)
    out = m.Out("t")
    with pytest.raises(m.Fail):
        m.cmd_diagnose_package(m.parser().parse_args(["diagnose-package"]), out)
    m.cmd_diagnose_package(m.parser().parse_args(["--private-dir", str(tmp_path), "diagnose-package"]), out)
    run = [c for c in seen if c[0] == "run"][0]
    assert "--network" in run and "none" in run and "--read-only" in run and "--cap-drop" in run
    assert any(a.endswith(":/run/cleanops-b1-private:ro") for a in run) and "RESULT=FAIL" in out.lines


OLD_MODULE = ('import { createDurableCandidateVerifier } from "file:///app/lib/b1/ingress-assertion.ts";\n'
              'const configuration = {"report":{"policyVersion":"p1","rows":0},"approval":{"reference":"owner-ref"},'
              '"verifier":{"audience":"https://cleanops.nuvurent.com"}};\nexport {};\n')
NEW_MODULE = ('import { createIngressVerifier } from "file:///app/lib/b1/ingress-assertion.ts";\n'
              'const configuration = {"report":{},"approval":{},"verifier":{"audience":"https://b1.cleanops.nuvurent.com"}};\n')
NEW_DIGEST = hashlib.sha256(NEW_MODULE.encode()).hexdigest()


def _derived_package(parent, origin="https://b1.cleanops.nuvurent.com"):
    pkg = parent / "pkg"
    pkg.mkdir(parents=True)
    (pkg / "integration.mjs").write_text(OLD_MODULE)
    os.chmod(pkg / "integration.mjs", 0o440)
    (pkg / "installation.json").write_text(json.dumps({"origin": origin, "other": {"kept": 1}, "integration": {
        "source": {"path": "/run/cleanops-b1-private/integration.mjs"}, "sha256": "0" * 64, "approval": "old-ref"}}))
    os.chmod(pkg / "installation.json", 0o440)
    return pkg


def _fake_renderer(m, pkg, seen, fail=False):
    def fake(*a):
        seen.append(a)
        if a[0] == "inspect":
            return json.dumps([{"Config": {"Image": "img:1"}}])
        assert not (pkg / "integration.mjs").exists()  # the renderer never overwrites
        inputs = Path([x for x in a if x.endswith(":/run/b1-render-inputs:ro")][0].rsplit(":", 2)[0])
        assert json.loads((inputs / "report.json").read_text()) == {"policyVersion": "p1", "rows": 0}
        assert json.loads((inputs / "approval.json").read_text()) == {"reference": "owner-ref"}
        seen.append(("inputs", inputs))
        if fail:
            raise m.Fail("DOCKER_OPERATION_FAILED:run")
        (pkg / "integration.mjs").write_text(NEW_MODULE)
        os.chmod(pkg / "integration.mjs", 0o440)
        return json.dumps({"path": "x", "sha256": NEW_DIGEST, "manifestMatches": False})
    return fake


def _render(m, pkg):
    out = m.Out("t")
    m.cmd_render_integration(m.parser().parse_args(["--private-dir", str(pkg), "render-integration"]), out)
    return "\n".join(out.lines)


def test_render_integration_rerenders_offline_and_leaves_manifest_for_owner_approval(monkeypatch, tmp_path):
    m = _module()
    pkg, seen = _derived_package(tmp_path), []
    manifest_before = (pkg / "installation.json").read_bytes()
    monkeypatch.setattr(m, "docker", _fake_renderer(m, pkg, seen))
    text = _render(m, pkg)
    assert f"NEW_INTEGRATION_SHA256={NEW_DIGEST}" in text and "MANIFEST_UPDATED=false" in text and "RESULT=PASS" in text
    assert "owner-ref" not in text and "policyVersion" not in text  # embedded report/approval never printed
    assert (pkg / "installation.json").read_bytes() == manifest_before
    assert (pkg / "integration.mjs").read_text() == NEW_MODULE
    backup = Path(str(pkg) + ".integration-backup")
    assert (backup / "integration.mjs").read_text() == OLD_MODULE
    assert (backup / "installation.json").read_bytes() == manifest_before
    run_args = [c for c in seen if c[0] == "run"][0]
    assert "--network" in run_args and "none" in run_args and "--read-only" in run_args and "--cap-drop" in run_args
    assert f"{pkg}:/run/cleanops-b1-private" in run_args and "--privileged" not in run_args and "--cap-add" not in run_args
    assert not [c for c in seen if c[0] == "inputs"][0][1].exists()  # temporary inputs removed
    with pytest.raises(m.Stop):  # a second render needs rollback or approval first
        _render(m, pkg)


def test_render_integration_failure_restores_module_and_refuses_original_package(monkeypatch, tmp_path):
    m = _module()
    pkg, seen = _derived_package(tmp_path), []
    monkeypatch.setattr(m, "docker", _fake_renderer(m, pkg, seen, fail=True))
    with pytest.raises(m.Fail):
        _render(m, pkg)
    assert (pkg / "integration.mjs").read_text() == OLD_MODULE
    assert (pkg / "integration.mjs").stat().st_mode & 0o777 == 0o440
    assert not Path(str(pkg) + ".integration-backup").exists()
    assert not [c for c in seen if c[0] == "inputs"][0][1].exists()
    original = _derived_package(tmp_path / "o", origin="https://cleanops.nuvurent.com")
    with pytest.raises(m.Stop):
        _render(m, original)
    assert (original / "integration.mjs").read_text() == OLD_MODULE


def test_approve_integration_requires_exact_digest_and_owner_reference_then_rollback_restores(monkeypatch, tmp_path):
    m = _module()
    pkg, seen = _derived_package(tmp_path), []
    manifest_before = (pkg / "installation.json").read_bytes()
    approve = ("--private-dir", str(pkg), "approve-integration", "--sha256")
    code, out = run(*approve, NEW_DIGEST, "--approval-reference", "ref")
    assert code == 3 and "NO_RENDERED_MODULE_PENDING_APPROVAL" in out["REASON"]
    monkeypatch.setattr(m, "docker", _fake_renderer(m, pkg, seen))
    _render(m, pkg)
    code, out = run(*approve, NEW_DIGEST)
    assert code == 1 and "APPROVAL_REFERENCE_REQUIRED" in out["REASON"]
    code, out = run(*approve, "a" * 64, "--approval-reference", "ref")
    assert code == 3 and (pkg / "installation.json").read_bytes() == manifest_before
    code, out = run(*approve, NEW_DIGEST, "--approval-reference", "PO 2026-11-11")
    assert code == 0 and out["RESULT"] == "PASS"
    new = json.loads((pkg / "installation.json").read_text())
    assert new["integration"] == {"source": {"path": "/run/cleanops-b1-private/integration.mjs"},
                                  "sha256": NEW_DIGEST, "approval": "PO 2026-11-11"}
    assert new["other"] == {"kept": 1} and (pkg / "installation.json").stat().st_mode & 0o777 == 0o440
    assert (pkg / "installation.json").stat().st_nlink == 1
    code, out = run("--private-dir", str(pkg), "rollback", "render-integration")
    assert code == 0 and (pkg / "integration.mjs").read_text() == OLD_MODULE
    assert (pkg / "installation.json").read_bytes() == manifest_before
    assert not Path(str(pkg) + ".integration-backup").exists()
    code, out = run("--private-dir", str(pkg), "rollback", "render-integration")
    assert code == 3


def test_first_actor_info_prints_only_public_request_fields(monkeypatch):
    m = _module()
    seen = []

    class FakePg:
        def run(self, sql, database=None, stdin=None):
            seen.append(sql)
            if "to_regclass" in sql:
                return "t"
            if "coalesce((SELECT state" in sql:
                return "COMMITTED"
            return json.dumps({"email": "owner@example.test", "tenantName": "Acme", "displayName": None})
    monkeypatch.setattr(m, "pg_from", lambda args, database=None, read_only=False: FakePg() if read_only else None)
    out = m.Out("t")
    m.cmd_first_actor_info(m.parser().parse_args(["--database", DB, "first-actor-info"]), out)
    text = " ".join(out.lines)
    assert "FIRST_ACTOR_EMAIL=owner@example.test" in text and "FIRST_ACTOR_TENANT_NAME=Acme" in text
    assert "FIRST_ACTOR_DISPLAY_NAME=not-recorded" in text and "RESULT=PASS" in text
    assert not any("material" in s or "receipt" in s for s in seen)
