#!/usr/bin/env python3
"""Future authorized synthetic backup only; no remote host selection or broad cleanup."""
import argparse
import json
import os
import stat
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def backup(record, token_file, key_file, output):
    s = record["STAGING_SYNTHETIC"]
    if (s["syntheticOnly"] is not True or any(s.get(k) is not False for k in
            ["realPersonalData", "productionDatabaseCopies", "externalCommunications"])
        or s.get("deploymentAuthorized") is not True
        or s.get("backupAuthorized") is not True or not s.get("deploymentApprovalReference")):
        raise ValueError("SYNTHETIC_BACKUP_AUTHORIZATION_REQUIRED")
    directory = s["backup"].get("destinationDirectory")
    if not directory or not Path(directory).is_absolute() or output.resolve().parent != Path(directory).resolve():
        raise ValueError("DEDICATED_STAGING_BACKUP_DIRECTORY_REQUIRED")
    if output.exists() or token_file.is_symlink() or not token_file.is_file():
        raise ValueError("PRIVATE_FILE_OR_OUTPUT_REQUIRED")
    if stat.S_IMODE(token_file.stat().st_mode) & 0o077:
        raise ValueError("PRIVATE_TOKEN_PERMISSIONS_REQUIRED")
    env = dict(os.environ)
    for k in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
        env.pop(k, None)

    def docker(args, data=None):
        r = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", *args],
                           input=data, capture_output=True, env=env, timeout=120)
        if r.returncode:
            raise ValueError("REDACTED_BACKUP_DEPENDENCY_FAILURE")
        return r.stdout

    base = ["compose", "-p", "cleanops360-staging", "-f", str(ROOT / "deploy/staging/compose.yaml"),
            "-f", str(ROOT / "deploy/staging/compose.openbao.yaml"), "--profile", "synthetic-custody"]
    for service in ["postgres", "openbao"]:
        cid = docker([*base, "ps", "-q", service]).decode().strip()
        if not cid or len(cid.splitlines()) != 1:
            raise ValueError("OWNED_RUNNING_SERVICE_REQUIRED")
        meta = json.loads(docker(["inspect", cid]))[0]
        labels = meta["Config"]["Labels"]
        if (labels.get("com.docker.compose.project") != "cleanops360-staging"
            or labels.get("com.docker.compose.service") != service or meta["HostConfig"].get("PortBindings")):
            raise ValueError("OWNERSHIP_REQUIRED")
    token = token_file.read_bytes().strip()
    if not token or len(token) > 1024:
        raise ValueError("TOKEN_FORMAT")
    # Token comes from stdin, never shell arguments, command traces or provider errors.
    script = "const fs=require('node:fs'),https=require('node:https');const t=fs.readFileSync(0,'utf8').trim();const r=https.get('https://openbao:8200/v1/sys/storage/raft/snapshot',{ca:fs.readFileSync('/run/openbao-tls/workload-ca.pem'),cert:fs.readFileSync('/run/openbao-tls/health-client.pem'),key:fs.readFileSync('/run/openbao-tls/health-client-key.pem'),headers:{'X-Vault-Token':t},rejectUnauthorized:true},s=>{if(s.statusCode!==200){s.resume();process.exitCode=1}else{s.pipe(process.stdout)}});r.on('error',()=>{process.exitCode=1});r.setTimeout(60000,()=>r.destroy());"
    with tempfile.TemporaryDirectory(prefix="cleanops-staging-backup-") as directory:
        tmp = Path(directory)
        (tmp / "pg.dump").write_bytes(docker([*base, "exec", "-T", "postgres", "pg_dump", "-U", "cleanops_bootstrap", "-d", "cleanops_staging", "-Fc"]))
        (tmp / "roles.sql").write_bytes(docker([*base, "exec", "-T", "postgres", "pg_dumpall", "-U", "cleanops_bootstrap", "--roles-only", "--no-role-passwords"]))
        (tmp / "raft.snap").write_bytes(docker([*base, "exec", "-T", "openbao", "node", "-e", script], token))
        (tmp / "scope.json").write_text(json.dumps({"scope": "STAGING_SYNTHETIC",
            "coherentProductionCheckpoint": False, "productionRpoRtoAccepted": False,
            "restoredSessionsMustStayQuarantined": True, "sql14": "965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa"}))
        bundle = tmp / "bundle.tar"
        with tarfile.open(bundle, "w") as archive:
            for name in ["pg.dump", "roles.sql", "raft.snap", "scope.json"]:
                archive.add(tmp / name, arcname=name)
        r = subprocess.run(["node", str(ROOT / "scripts/staging-archive.mjs"), "encrypt",
                            str(bundle), str(output), str(key_file), "STAGING_SYNTHETIC"],
                           capture_output=True, timeout=120)
        if r.returncode:
            raise ValueError("ARCHIVE_ENCRYPTION_FAILED")
    return "SYNTHETIC_BACKUP_ENCRYPTED_NOT_PRODUCTION_RECOVERY_ACCEPTANCE"


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--record", type=Path, required=True)
    p.add_argument("--snapshot-token-file", type=Path, required=True)
    p.add_argument("--key-file", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    try:
        print(backup(json.loads(a.record.read_text()), a.snapshot_token_file, a.key_file, a.out))
    except (ValueError, KeyError, OSError, subprocess.SubprocessError):
        raise SystemExit("SYNTHETIC_BACKUP_REJECTED")
