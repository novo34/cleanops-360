#!/usr/bin/env python3
"""CI only: new staging image, real mTLS, sealed readiness and named-volume persistence."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    run = "cleanops-staging-smoke-" + uuid.uuid4().hex
    image = run + ":synthetic"
    volumes, cid, checks = [], None, []
    env = dict(os.environ)
    for k in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
        env.pop(k, None)

    def command(args, data=None, check=True):
        r = subprocess.run(args, input=data, capture_output=True, text=True, env=env, timeout=240)
        if check and r.returncode:
            raise RuntimeError("STAGING_IMAGE_PROCESS_FAILED")
        return r

    def docker(*args, **kw):
        return command(["docker", "--host=unix:///var/run/docker.sock", *args], **kw)

    def load(name, path):
        spec = importlib.util.spec_from_file_location(name, ROOT / path)
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        return m

    def record(name):
        checks.append({"name": name, "status": "PASS"})

    status = "FAIL"
    try:
        # No application image rebuild, SQL, production data or Hostinger access.
        docker("build", "--platform", "linux/amd64", "-f", "deploy/staging/openbao/Dockerfile", "-t", image, ".")
        record("pinned-native-binary-image-build")
        with tempfile.TemporaryDirectory(prefix=run) as d:
            directory = Path(d)
            helper = load("existing_native_certificates", "scripts/test-b1-openbao-isolated.py")
            helper.certificates(directory)
            tls = directory / "tls"; tls.mkdir()
            for source, target in [("ca.pem", "workload-ca.pem"), ("server.pem", "server-chain.pem"),
                                   ("server-key.pem", "server-key.pem"), ("client.pem", "health-client.pem"),
                                   ("client-key.pem", "health-client-key.pem")]:
                shutil.copyfile(directory / source, tls / target)
            template = json.loads((ROOT / "docs/implementation/b1/operational-acceptance/openbao/server.template.json").read_text()
                                  .replace("@API_DNS@", "localhost").replace("@PRIVATE_IPV4@", "127.0.0.1")
                                  .replace("@NODE_ID@", "synthetic-image-smoke")
                                  .replace("@TOKEN_TTL@", "60").replace("@TOKEN_MAX_TTL@", "300"))
            config = directory / "server.json"; config.write_text(json.dumps(template))
            # Runner retains ownership; group1000 grants the non-root image read-only synthetic TLS access.
            for p in [directory, tls, config, *tls.iterdir()]:
                command(["sudo", "chgrp", "1000", str(p)])
                p.chmod(0o750 if p.is_dir() else 0o640)
            for suffix in ["raft", "audit"]:
                volume = run + "-" + suffix
                docker("volume", "create", "--label", "cleanops.staging-smoke=" + run, volume)
                volumes.append(volume)
            cid = docker("run", "-d", "--name", run, "--label", "cleanops.staging-smoke=" + run,
                         "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
                         "--memory=512m", "--cpus=0.5", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=32m",
                         "-e", "OPENBAO_HEALTH_ORIGIN=https://localhost:8200",
                         "--mount", "type=bind,src=" + str(config) + ",dst=/etc/openbao/server.json,readonly",
                         "--mount", "type=bind,src=" + str(tls) + ",dst=/run/openbao-tls,readonly",
                         "-v", volumes[0] + ":/var/lib/openbao", "-v", volumes[1] + ":/var/log/openbao", image).stdout.strip()
            transport = """const fs=require('node:fs'),https=require('node:https');const i=JSON.parse(fs.readFileSync(0,'utf8'));const o={ca:fs.readFileSync('/run/openbao-tls/workload-ca.pem'),rejectUnauthorized:true,method:i.method||'GET',headers:{'Content-Type':'application/json'}};if(i.client!==false){o.cert=fs.readFileSync('/run/openbao-tls/health-client.pem');o.key=fs.readFileSync('/run/openbao-tls/health-client-key.pem')}if(i.token)o.headers['X-Vault-Token']=i.token;const r=https.request('https://localhost:8200/v1/'+i.path,o,s=>{let b='';s.on('data',x=>b+=x);s.on('end',()=>{try{process.stdout.write(JSON.stringify({status:s.statusCode,body:JSON.parse(b)}))}catch{process.exitCode=1}})});r.on('error',()=>{process.stdout.write(JSON.stringify({status:0}));process.exitCode=0});r.setTimeout(3000,()=>r.destroy());r.end(i.body?JSON.stringify(i.body):undefined);"""

            def api(path, method="GET", body=None, token=None, client=True):
                r = docker("exec", "-i", cid, "node", "-e", transport, data=json.dumps(dict(path=path, method=method, body=body, token=token, client=client)))
                return json.loads(r.stdout)

            def ready():
                for _ in range(60):
                    if api("sys/health")["status"] == 200: return
                    time.sleep(0.5)
                raise RuntimeError("UNSEALED_LEADER_NOT_READY")

            for _ in range(60):
                try:
                    if api("sys/health")["status"] == 501: break
                except (ValueError, RuntimeError):
                    pass
                time.sleep(0.5)
            else: raise RuntimeError("NATIVE_STAGING_NOT_READY")
            assert api("sys/health", client=False)["status"] == 0
            record("mtls-required-no-public-listener")
            assert docker("exec", cid, "node", "/opt/cleanops/staging-bao-health.mjs", check=False).returncode != 0
            record("health-rejects-uninitialized")
            # Test-only single-harness shares; not an approved human or production quorum.
            initialization = api("sys/init", "PUT", {"secret_shares": 1, "secret_threshold": 1})["body"]
            share, token = initialization["keys_base64"][0], initialization["root_token"]
            api("sys/unseal", "PUT", {"key": share})
            ready()
            assert api("sys/health")["status"] == 200
            docker("exec", cid, "node", "/opt/cleanops/staging-bao-health.mjs")
            record("health-rejects-uninitialized-and-accepts-unsealed")
            assert api("sys/auth", token=token)["status"] == 200
            audit = docker("exec", cid, "node", "-e", "process.stdout.write(require('node:fs').readFileSync('/var/log/openbao/audit.json'))").stdout
            assert audit.strip() and token not in audit and share not in audit
            record("persistent-audit-redacts-test-credentials")
            docker("restart", cid)
            for _ in range(60):
                try:
                    response = api("sys/health")
                    if response["status"] == 503 and response["body"].get("initialized") is True: break
                except (ValueError, RuntimeError):
                    pass
                time.sleep(0.5)
            else: raise RuntimeError("PERSISTENCE_NOT_PROVEN")
            api("sys/unseal", "PUT", {"key": share})
            ready()
            docker("exec", cid, "node", "/opt/cleanops/staging-bao-health.mjs")
            assert api("sys/auth", token=token)["status"] == 200
            record("raft-survives-restart-requires-original-test-share")
            status = "PASS"
    finally:
        if cid:
            meta = json.loads(docker("inspect", cid).stdout)[0]
            if meta["Config"]["Labels"].get("cleanops.staging-smoke") == run:
                docker("rm", "-f", cid)
            else: raise RuntimeError("CLEANUP_OWNERSHIP_MISMATCH")
        for volume in volumes:
            meta = json.loads(docker("volume", "inspect", volume).stdout)[0]
            if meta["Labels"].get("cleanops.staging-smoke") != run: raise RuntimeError("VOLUME_OWNERSHIP_MISMATCH")
            docker("volume", "rm", volume)
        report = {"scope": "STAGING_SYNTHETIC_IMAGE_SMOKE", "result": status, "checks": checks,
                  "cleanup": "PASS", "productionCustody": False, "hostingerAccessed": False}
        destination = ROOT / "artifacts/staging-synthetic"; destination.mkdir(parents=True, exist_ok=True)
        (destination / "image-smoke.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception: raise SystemExit("STAGING_IMAGE_SMOKE_FAILED_REDACTED")
