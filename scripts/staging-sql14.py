#!/usr/bin/env python3
"""Verify exact SQL14; optional future authorized installation in owned EMPTY PG16."""
import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql"
SHA = "965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa"


def install(record, apply=False, runner=None):
    raw = SQL.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SHA:
        raise ValueError("SQL14_HASH_MISMATCH")
    if not apply:
        return "VERIFIED_ONLY_NOT_INSTALLED"
    s = record["STAGING_SYNTHETIC"]
    if (s["syntheticOnly"] is not True or any(s.get(k) is not False for k in
            ["realPersonalData", "productionDatabaseCopies", "externalCommunications"])
        or s["branch"] != "staging"
        or s.get("deploymentAuthorized") is not True or not s.get("deploymentApprovalReference")
        or s.get("sql14FreshInstallAuthorized") is not True):
        raise ValueError("EXACT_FRESH_INSTALL_AUTHORIZATION_REQUIRED")
    if runner is None:
        environment = dict(os.environ)
        for key in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
            environment.pop(key, None)

        def runner(args, data=None):
            result = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", *args],
                                    input=data, capture_output=True, env=environment, timeout=120)
            if result.returncode:
                raise ValueError("REDACTED_OWNED_PG_OPERATION_FAILED")
            return result.stdout.decode().strip()
    base = ["compose", "-p", "cleanops360-staging", "-f", str(ROOT / "deploy/staging/compose.yaml")]
    cid = runner([*base, "ps", "-q", "postgres"])
    if not cid or len(cid.splitlines()) != 1:
        raise ValueError("ONE_OWNED_POSTGRES_REQUIRED")
    metadata = json.loads(runner(["inspect", cid]))[0]
    labels = metadata["Config"].get("Labels", {})
    if (labels.get("com.docker.compose.project") != "cleanops360-staging"
        or labels.get("com.docker.compose.service") != "postgres"
        or metadata["HostConfig"].get("PortBindings")):
        raise ValueError("POSTGRES_OWNERSHIP_OR_PORTS_MISMATCH")
    psql = [*base, "exec", "-T", "postgres", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate",
            "-U", "cleanops_bootstrap", "-d", "cleanops_staging"]
    version = runner([*psql, "-c", "SHOW server_version_num;"])
    if not version.isdigit() or not 160000 <= int(version) < 170000:
        raise ValueError("PG16_REQUIRED")
    # Artifact creates roles/schemas itself. Never mutate an already installed cluster.
    fresh = runner([*psql, "-c",
                    "SELECT (NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname LIKE 'cleanops_%' AND rolname <> 'cleanops_bootstrap'))::int;"])
    if fresh != "1":
        raise ValueError("EMPTY_CLUSTER_REQUIRED")
    runner(psql, raw)
    return "EXACT_SQL14_INSTALLED_NO_FIXTURES_OR_RUNTIME_ACTIVATION"


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--record", type=Path, default=ROOT / "deploy/staging/RESOURCE_RECORD.json")
    p.add_argument("--apply", action="store_true")
    a = p.parse_args()
    try:
        print(install(json.loads(a.record.read_text()), a.apply))
    except (ValueError, KeyError, OSError, subprocess.SubprocessError):
        raise SystemExit("SQL14_OPERATION_REJECTED")
