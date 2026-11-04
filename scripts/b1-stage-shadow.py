#!/usr/bin/env python3
"""Stage the existing B1 image as a STOPPED, reversible shadow container.

No ports, no public routers, no SQL, no OpenBao writes, no web replacement.
Only for the already documented cleanops360-f4fxmd staging installation.
"""
import argparse
import hashlib
import ipaddress
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

WEB = "cleanops360-f4fxmd-web-1"
SHADOW = "cleanops360-b1-shadow-cc51574a"
IMAGE = "cleanops360-b1-candidate:cc51574a"
IMAGE_ID = "sha256:1db5df548b85f451f5eeec41959671aa1b983bffa687dae722c94571d5c20016"
OLD_IMAGE = "sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290"
PRIVATE = Path("/run/cleanops-b1-private")
MANIFEST = PRIVATE / "installation.json"
VOLUME = "cleanops360-f4fxmd_identity_agent_sink"
STATE = Path("/root/b1-shadow-stage/stage.json")


def run(*args, json_result=False):
    p = subprocess.run(args, capture_output=True, text=True, timeout=45, check=False)
    if p.returncode:
        raise RuntimeError("No se pudo ejecutar: " + " ".join(args[:2]) + " (detalle privado omitido)")
    return json.loads(p.stdout) if json_result else p.stdout.strip()


def inspect(kind, target):
    return run("docker", kind, "inspect", target, json_result=True)[0]


def protected(path, typ, mode, uid, gid):
    s = path.lstat()
    if (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) != (uid, gid, mode):
        raise RuntimeError("Metadatos privados no coinciden: " + path.name)
    if typ == "directory" and not stat.S_ISDIR(s.st_mode):
        raise RuntimeError("Directorio esperado: " + path.name)
    if typ == "file" and (not stat.S_ISREG(s.st_mode) or s.st_nlink != 1):
        raise RuntimeError("Archivo regular de enlace único esperado: " + path.name)


def plan():
    if os.geteuid() != 0:
        raise RuntimeError("Requiere root")
    if STATE.exists():
        raise RuntimeError("Ya hay una preparación; no duplicar")
    protected(PRIVATE, "directory", 0o750, 0, 999)
    protected(MANIFEST, "file", 0o440, 0, 999)
    m = json.loads(MANIFEST.read_text())
    if m.get("version") != 2 or m.get("postgres", {}).get("environment") != "staging":
        raise RuntimeError("Manifiesto de entorno inesperado")
    if m.get("origin", "").rstrip("/") != "https://cleanops.nuvurent.com":
        raise RuntimeError("Origen inesperado")
    img = inspect("image", IMAGE)
    if img.get("Id") != IMAGE_ID or img.get("Config", {}).get("User") not in ("999:999", "999"):
        raise RuntimeError("Imagen candidata diferente del digest/usuario aceptado")
    web = inspect("container", WEB)
    if web.get("State", {}).get("Status") != "running" or web.get("Image") != OLD_IMAGE:
        raise RuntimeError("Web original cambió, no preparar sobre estado desconocido")
    netmap = web.get("NetworkSettings", {}).get("Networks") or {}
    if "dokploy-network" not in netmap:
        raise RuntimeError("Web no está en red Traefik conocida")
    binding = m.get("ingress", {}).get("binding")
    if not isinstance(binding, str) or "/" not in binding:
        raise RuntimeError("Se esperaba binding B1 CIDR")
    cidr = ipaddress.ip_network(binding, strict=True)
    matching = [n for n, v in netmap.items() if v.get("IPAddress") and
                ipaddress.ip_address(v["IPAddress"]) in cidr]
    if matching != ["dokploy-network"]:
        raise RuntimeError("La IP de B1 no resuelve solo en dokploy-network")
    available = run("docker", "network", "ls", "--format", "{{.Name}}").splitlines()
    bao = [n for n in available if n == "identity_bao" or n.endswith("_identity_bao")]
    if len(bao) != 1:
        raise RuntimeError("Red identidad Bao no unívoca")
    if inspect("volume", VOLUME).get("Name") != VOLUME:
        raise RuntimeError("Volumen Agent existente no encontrado")
    current_env = dict(s.split("=", 1) for s in web.get("Config", {}).get("Env", [])
                       if "=" in s)
    env = {"NODE_ENV": "production", "NEXT_TELEMETRY_DISABLED": "1"}
    for k in ("CLEANOPS_AUTH_ORIGIN", "CLEANOPS_AUTH_INTERNAL_ORIGINS"):
        if k in current_env:
            env[k] = current_env[k]
    if env.get("CLEANOPS_AUTH_ORIGIN", "https://cleanops.nuvurent.com").rstrip("/") != "https://cleanops.nuvurent.com":
        raise RuntimeError("Origen de web incompatible")
    return sorted(set(netmap) | {bao[0]}), env


def stage():
    networks, env = plan()
    present = subprocess.run(["docker", "container", "inspect", SHADOW],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    if present.returncode == 0:
        raise RuntimeError("Contenedor B1 ya presente, no duplicar")
    args = ["docker", "create", "--name", SHADOW, "--network", "none",
            "--restart", "no", "--init", "--read-only", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges:true", "--pids-limit", "128",
            "--memory", "768m", "--cpus", "0.65",
            "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m",
            "--mount", f"type=bind,src={PRIVATE},dst=/run/cleanops-b1-private,readonly",
            "--mount", f"type=volume,src={VOLUME},dst=/run/cleanops-agent,readonly,volume-nocopy"]
    for k, v in sorted(env.items()):
        args += ["--env", k + "=" + v]
    args.append(IMAGE)
    created = False
    try:
        run(*args)
        created = True
        for n in networks:
            extra = ["--alias", "cleanops-b1-ingress"] if n == "dokploy-network" else []
            run("docker", "network", "connect", *extra, n, SHADOW)
        container = inspect("container", SHADOW)
        if container["State"]["Status"] != "created" or container["Image"] != IMAGE_ID:
            raise RuntimeError("Contenedor preparado en estado inesperado")
        STATE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        protected(STATE.parent, "directory", 0o700, 0, 0)
        snapshot = {"container": SHADOW, "containerId": container["Id"],
                    "imageId": IMAGE_ID, "networks": networks,
                    "manifestSha256": hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
                    "state": "CREATED_NOT_STARTED", "routesModified": False}
        fd = os.open(STATE, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as out:
            json.dump(snapshot, out, sort_keys=True)
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
        print("B1_SOMBRA=PREPARADA_SIN_ARRANCAR")
        print("WEB_ACTUAL=INTACTA")
        print("TRAEFIK=INTACTO")
        print("SQL_OPENBAO=INTACTOS")
    except Exception:
        if created:
            subprocess.run(["docker", "rm", SHADOW], capture_output=True, text=True, check=False)
        raise


def rollback_stage():
    if os.geteuid() != 0:
        raise RuntimeError("Requiere root")
    if not STATE.exists():
        print("B1_SOMBRA=AUSENTE")
        return
    record = json.loads(STATE.read_text())
    if record.get("container") != SHADOW or record.get("state") != "CREATED_NOT_STARTED" or record.get("routesModified") is not False:
        raise RuntimeError("Estado de rollback desconocido")
    actual = inspect("container", SHADOW)
    if actual.get("Id") != record.get("containerId") or actual.get("State", {}).get("Status") != "created":
        raise RuntimeError("Contenedor no es la preparación detenida original")
    run("docker", "rm", SHADOW)
    STATE.unlink()
    print("B1_SOMBRA=REVERTIDA")
    print("WEB_ACTUAL=INTACTA")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["stage", "rollback-stage"])
    args = parser.parse_args()
    try:
        if args.action == "stage":
            stage()
        else:
            rollback_stage()
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as exc:
        print("B1_STOP=" + str(exc), file=sys.stderr)
        sys.exit(1)
