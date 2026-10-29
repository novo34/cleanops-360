#!/usr/bin/env python3
"""Staging packaging invariants; no VPS, SQL or real secret access."""
import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
compose = (root / "deploy/staging/compose.yaml").read_text()
dockerfile = root / "deploy/staging/Dockerfile"
assert dockerfile.is_file(), "Missing Dockerfile"
assert (root / "package-lock.json").is_file(), "Missing lockfile"
assert (root / ".dockerignore").is_file(), "Missing root dockerignore"
assert "context: ../.." in compose
assert "dockerfile: deploy/staging/Dockerfile" in compose
assert "POSTGRES_PASSWORD_FILE: /run/secrets/postgres_bootstrap_password" in compose
assert "CLEANOPS_PG_PASSWORD_FILE:?" in compose
assert "CLEANOPS_AUTH_ORIGIN:?" in compose
assert "internal: true" in compose
assert "read_only: true" in compose
assert "cap_drop:" in compose and "no-new-privileges:true" in compose
assert "healthcheck:" in compose and "mem_limit:" in compose
assert "ports:" not in compose, "Host port publication is forbidden"
assert "privileged:" not in compose
assert "docker.sock" not in compose
for field in ["CLEANOPS_COMPOSE_PROJECT", "CLEANOPS_PRIVATE_NETWORK", "CLEANOPS_PG_VOLUME", "CLEANOPS_PG_IMAGE", "CLEANOPS_PG_DATABASE", "CLEANOPS_PG_BOOTSTRAP_USER"]:
    assert field + ":?" in compose
assert "redis:" not in compose, "No Redis worker exists yet"
assert "openbao:" not in compose, "Operational custody unapproved"
print("STAGING-STATIC: PASS (packaging only; no deployment)")
