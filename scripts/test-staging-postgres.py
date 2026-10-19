#!/usr/bin/env python3
"""CI: real non-root PG16 packaging and exact SQL installer, isolated synthetic only."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    owner = "cleanops-staging-pg-" + uuid.uuid4().hex
    container = None
    checks = []
    env = dict(os.environ)
    for k in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
        env.pop(k, None)

    def docker(*args, data=None, check=True):
        r = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", *args], input=data,
                           capture_output=True, env=env, timeout=120)
        if check and r.returncode:
            raise RuntimeError("STAGING_PG_PROCESS_FAILED")
        return r

    def load():
        spec = importlib.util.spec_from_file_location("actual_sql_installer", ROOT / "scripts/staging-sql14.py")
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        return m

    status = "FAIL"
    try:
        docker("volume", "create", "--label", "cleanops.staging-pg=" + owner, owner)
        with tempfile.TemporaryDirectory(prefix=owner) as d:
            password = Path(d) / "synthetic-password"
            password.write_text(uuid.uuid4().hex)
            subprocess.run(["sudo", "chgrp", "999", d, str(password)], check=True, capture_output=True)
            Path(d).chmod(0o750); password.chmod(0o640)
            args = ["run", "-d", "--network=none", "--cap-drop=ALL", "--security-opt=no-new-privileges",
                    "--label", "cleanops.staging-pg=" + owner,
                    "--label", "com.docker.compose.project=cleanops360-staging",
                    "--label", "com.docker.compose.service=postgres",
                    "-e", "POSTGRES_DB=cleanops_staging", "-e", "POSTGRES_USER=cleanops_bootstrap",
                    "-e", "POSTGRES_PASSWORD_FILE=/run/secrets/password",
                    "--mount", "type=bind,src=" + str(password) + ",dst=/run/secrets/password,readonly",
                    "-v", owner + ":/var/lib/postgresql/data"]
            # Reproduce the old root+drop-ALL incompatibility before testing the fixed recipe.
            container = docker(*args, "postgres:16-bookworm").stdout.decode().strip()
            for _ in range(30):
                meta = json.loads(docker("inspect", container).stdout)[0]
                if not meta["State"]["Running"]: break
                time.sleep(0.25)
            assert not meta["State"]["Running"], "ROOT_DROP_ALL_FAILURE_NOT_REPRODUCED"
            checks.append({"name": "old-root-drop-all-startup-failure-reproduced", "status": "PASS"})
            docker("rm", "-f", container); container = None
            container = docker(*args, "--user=postgres", "postgres:16-bookworm").stdout.decode().strip()
            for _ in range(100):
                if not docker("exec", container, "pg_isready", "-U", "cleanops_bootstrap", "-d", "cleanops_staging", check=False).returncode: break
                time.sleep(0.25)
            else: raise RuntimeError("NONROOT_PG16_NOT_READY")
            checks.append({"name": "fixed-nonroot-pg16-starts-with-drop-all", "status": "PASS"})
            m = load()

            def runner(arguments, data=None):
                if arguments[0] == "inspect": return docker(*arguments).stdout.decode()
                if "ps" in arguments: return container
                command = arguments[arguments.index("psql"):]
                return docker("exec", "-i", container, *command, data=data).stdout.decode().strip()

            record = json.loads((ROOT / "deploy/staging/RESOURCE_RECORD.json").read_text())
            record["STAGING_SYNTHETIC"].update(deploymentAuthorized=True,
                deploymentApprovalReference="CI_SYNTHETIC_ONLY_NO_HOSTINGER", sql14FreshInstallAuthorized=True)
            assert m.install(record, True, runner).startswith("EXACT_SQL14_INSTALLED")
            checks.append({"name": "exact-sql14-verified-installer-fresh-real-pg16", "status": "PASS"})
            try: m.install(record, True, runner)
            except ValueError: pass
            else: raise RuntimeError("REINSTALL_NOT_DENIED")
            checks.append({"name": "existing-installed-state-rejected-no-overwrite", "status": "PASS"})
            status = "PASS"
    finally:
        if container:
            meta = json.loads(docker("inspect", container).stdout)[0]
            if meta["Config"]["Labels"].get("cleanops.staging-pg") != owner: raise RuntimeError("CLEANUP_OWNER_MISMATCH")
            docker("rm", "-f", container)
        meta = json.loads(docker("volume", "inspect", owner).stdout)[0]
        if meta["Labels"].get("cleanops.staging-pg") != owner: raise RuntimeError("CLEANUP_VOLUME_MISMATCH")
        docker("volume", "rm", owner)
        report = {"scope": "STAGING_SYNTHETIC_PG_PACKAGING", "result": status, "checks": checks, "cleanup": "PASS",
                  "runtime": "closedBackend", "hostingerAccessed": False}
        path = ROOT / "artifacts/staging-synthetic"; path.mkdir(parents=True, exist_ok=True)
        (path / "postgres-smoke.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception: raise SystemExit("STAGING_PG_SMOKE_FAILED_REDACTED")
