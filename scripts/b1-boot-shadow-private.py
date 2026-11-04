#!/usr/bin/env python3
"""Boot the already-staged B1 shadow privately (no public Traefik route).

Bind a REAL immutable technical evidence reference; do not claim AUTH-GATE-05
approval. On failure restore the original private manifest and stop shadow.
The original web, proxy, databases, PKI and credentials are untouched.
"""
import hashlib
import ipaddress
import json
import os
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

WEB = "cleanops360-f4fxmd-web-1"
SHADOW = "cleanops360-b1-shadow-cc51574a"
SHADOW_IMAGE = "sha256:1db5df548b85f451f5eeec41959671aa1b983bffa687dae722c94571d5c20016"
WEB_IMAGE = "sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290"
STATE_DIR = Path("/root/b1-shadow-stage")
STATE = STATE_DIR / "stage.json"
RECEIPT = STATE_DIR / "private-boot.json"
BACKUP = STATE_DIR / "manifest-before-boot.json"
MANIFEST = Path("/run/cleanops-b1-private/installation.json")
EVIDENCE = ("github:novo34/cleanops-360@"
            "2521ac090280b15be08ed5bd781c16314e8509eb:"
            "docs/implementation/b1/operational-acceptance/"
            "B1-SHADOW-CUTOVER-EVIDENCE-20261104.md")


def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)


def run(args, timeout=25):
    proc = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    return proc


def inspect(name):
    proc = run(["docker", "container", "inspect", name])
    require(proc.returncode == 0, "Docker no encuentra el contenedor esperado")
    return json.loads(proc.stdout)[0]


def file_meta(path, mode, uid, gid):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode)
            and info.st_nlink == 1
            and (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode))
            == (uid, gid, mode), "Metadatos de archivo privado no coinciden")
    return info


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_exclusive(path, data, mode):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    try:
        os.fchown(fd, 0, 0)
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
    except Exception:
        path.unlink(missing_ok=True)
        raise


def replace_manifest(data):
    tmp = MANIFEST.parent / (".installation-b1-boot-" + str(os.getpid()))
    fd = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        os.fchown(fd, 0, 999)
        with os.fdopen(fd, "wb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(tmp, 0o440)
        os.replace(tmp, MANIFEST)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def probe(shadow, port, host):
    # All probes execute inside shadow. They never pass secrets or call public routers.
    js = (
        "const net=require('node:net'),http=require('node:http');"
        "const ip=" + json.dumps(host) + ",port=" + str(port) + ";"
        "const s=net.connect({host:ip,port,timeout:2000});"
        "s.once('connect',()=>{s.destroy();"
        "const q=http.get('http://127.0.0.1:3000/login',r=>{"
        "r.resume();process.exit(r.statusCode>=200&&r.statusCode<500?0:4)});"
        "q.setTimeout(2000,()=>q.destroy());q.on('error',()=>process.exit(5))"
        "});"
        "s.on('error',()=>process.exit(6));s.on('timeout',()=>process.exit(7));"
    )
    return run(["docker", "exec", shadow, "node", "-e", js], timeout=9).returncode == 0


def boot():
    require(os.geteuid() == 0, "Se requiere root")
    require(not RECEIPT.exists() and not BACKUP.exists(),
            "Ya existe custodia previa del arranque; no repetir")
    sm = STATE_DIR.lstat()
    require(stat.S_ISDIR(sm.st_mode) and sm.st_uid == 0
            and stat.S_IMODE(sm.st_mode) == 0o700,
            "Directorio root-only de preparación no coincide")
    file_meta(STATE, 0o600, 0, 0)
    file_meta(MANIFEST, 0o440, 0, 999)
    state = json.loads(STATE.read_text())
    require(state.get("state") == "CREATED_NOT_STARTED"
            and state.get("container") == SHADOW
            and state.get("routesModified") is False,
            "Recibo de shadow no coincide")
    old = MANIFEST.read_bytes()
    require(sha(old) == state.get("manifestSha256"),
            "Manifest cambió desde la preparación, no sobrescribir")
    manifest = json.loads(old)
    require(manifest.get("version") == 2
            and manifest.get("postgres", {}).get("environment") == "staging"
            and manifest.get("origin") == "https://cleanops.nuvurent.com"
            and manifest.get("ingress", {}).get("evidenceReference") in ("", None),
            "Manifest tiene estado distinto al pendiente documentado")
    require(manifest["ingress"].get("tlsAuthorizationReference"),
            "TLS no tiene referencia auténtica")
    p = manifest["ingress"].get("port")
    require(type(p) is int and 1 <= p <= 65535, "Puerto B1 inválido")
    cidr = ipaddress.ip_network(manifest["ingress"]["binding"], strict=True)
    web, shadow = inspect(WEB), inspect(SHADOW)
    require(web["State"]["Status"] == "running" and web["Image"] == WEB_IMAGE,
            "La web original no coincide, se detiene sin cambios")
    require(shadow["State"]["Status"] == "created"
            and shadow["Image"] == SHADOW_IMAGE
            and shadow["Id"] == state.get("containerId"),
            "Shadow no es el candidato original detenido")
    n = shadow.get("NetworkSettings", {}).get("Networks", {}).get("dokploy-network", {})
    ip = n.get("IPAddress")
    require(ip and ipaddress.ip_address(ip) in cidr
            and "cleanops-b1-ingress" in (n.get("Aliases") or []),
            "La red del shadow no coincide con su binding y alias")
    require(len(EVIDENCE) <= 256 and EVIDENCE.startswith("github:"),
            "Referencia técnica fuera de contrato")
    manifest["ingress"]["evidenceReference"] = EVIDENCE
    new = (json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    require(len(new) < 65536, "Manifest supera tamaño permitido")

    changed = False
    running = False
    try:
        write_exclusive(BACKUP, old, 0o600)
        replace_manifest(new)
        changed = True
        require(file_meta(MANIFEST, 0o440, 0, 999).st_size == len(new),
                "Manifest actualizado con metadatos incorrectos")
        started = run(["docker", "start", SHADOW], timeout=25)
        require(started.returncode == 0, "No se pudo iniciar shadow")
        running = True
        ready = False
        for _ in range(18):
            candidate = inspect(SHADOW)
            if candidate["State"]["Status"] != "running":
                break
            if probe(SHADOW, p, ip):
                ready = True
                break
            time.sleep(1)
        require(ready, "Listener privado B1 o Next no alcanzan readiness")
        # The shadow has no public router. Confirmation is private only.
        info = {
            "timeUtc": datetime.now(timezone.utc).isoformat(),
            "sourceManifestSha256": sha(old), "bootManifestSha256": sha(new),
            "technicalEvidenceReference": EVIDENCE,
            "shadowId": shadow["Id"], "privatePort": p,
            "ingressSocket": "PASS", "nextHttp": "PASS",
            "publicForwardAuth": "INACTIVE",
            "authGate05": "OPEN"
        }
        write_exclusive(RECEIPT, (json.dumps(info, sort_keys=True)+"\n").encode(), 0o600)
        print("B1_SHADOW=ARRANCADO_PRIVADO")
        print("B1_INGRESS_SOCKET=PASS")
        print("B1_NEXT_HTTP=PASS")
        print("REFERENCIA_EVIDENCIA=TECNICA_REAL_NO_APROBACION")
        print("FORWARDAUTH=NO_ACTIVADO")
        print("WEB_ANTERIOR=INTACTA")
        print("AUTH_GATE_05=OPEN")
    except Exception:
        if running:
            run(["docker", "stop", "-t", "40", SHADOW], timeout=55)
        if changed and sha(MANIFEST.read_bytes()) == sha(new):
            replace_manifest(old)
        # Keep the original root-only manifest backup if rollback is ambiguous.
        if not changed or sha(MANIFEST.read_bytes()) == sha(old):
            BACKUP.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    try:
        boot()
    except Exception as exc:
        print("B1_BOOT_STOP=" + str(exc), file=sys.stderr)
        sys.exit(1)
