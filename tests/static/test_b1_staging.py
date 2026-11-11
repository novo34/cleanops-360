"""b1-staging.py against a DISPOSABLE PostgreSQL (CLEANOPS_B1_TEST_PG_PORT, default 54329). Skipped if absent."""
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
