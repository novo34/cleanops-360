#!/usr/bin/env python3
"""One-shot B1 dynamic Traefik cutover. Never touches the legacy web router.

Explicit staging operator action only, after Secure/HttpOnly cookie delivery.
All state-changing operations are limited to the prepared shadow restart
policy and one *new* dynamic YAML file in Traefik's existing bind mount.
"""
import hashlib
import json
import os
import stat
import subprocess
import sys
import time
from pathlib import Path

SHADOW = "cleanops360-b1-shadow-cc51574a"
SOURCE = Path("/root/b1-shadow-stage/b1-forwardauth.pending")
STATE = Path("/root/b1-shadow-stage/stage.json")
BOOT = Path("/root/b1-shadow-stage/private-boot.json")
RECEIPT = Path("/run/cleanops-b1-operator/result.json")
MANIFEST = Path("/run/cleanops-b1-private/installation.json")
MOUNT = "/etc/dokploy/traefik/dynamic"
ROUTER_FILE = "cleanops-b1-guarded.yaml"
EXPECTED_IMAGE = "sha256:1db5df548b85f451f5eeec41959671aa1b983bffa687dae722c94571d5c20016"


def check(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def call(argv, timeout=25):
    return subprocess.run(argv, capture_output=True, text=True, timeout=timeout)


def docker(name):
    value = call(["docker", "container", "inspect", name])
    check(value.returncode == 0, "Docker no encuentra " + name)
    return json.loads(value.stdout)[0]


def regular(path, mode=None):
    s = path.lstat()
    check(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_uid == 0,
          "Archivo protegido inesperado")
    if mode is not None:
        check(stat.S_IMODE(s.st_mode) == mode, "Permisos inesperados del archivo")
    return s


def probe(path):
    result = call(["curl", "--noproxy", "*", "--silent", "--show-error", "--max-time", "8",
                   "--resolve", "cleanops.nuvurent.com:443:127.0.0.1",
                   "-o", "/dev/null", "-w", "%{http_code}",
                   "https://cleanops.nuvurent.com" + path], timeout=11)
    return result.stdout.strip() if result.returncode == 0 else "000"


def router_enabled():
    res = call(["docker", "exec", "dokploy-traefik", "wget", "-qO-",
                "http://127.0.0.1:8080/api/http/routers"], timeout=12)
    if res.returncode != 0:
        return False
    try:
        routers = json.loads(res.stdout)
        return any(r.get("name") == "cleanops360-b1-guarded@file"
                   and r.get("status") == "enabled"
                   and "cleanops-b1-shadow" in r.get("service", "")
                   for r in routers)
    except (ValueError, TypeError, AttributeError):
        return False


def run():
    check(os.geteuid() == 0, "Se requiere root")
    regular(SOURCE, 0o600)
    regular(STATE, 0o600)
    regular(BOOT, 0o600)
    regular(RECEIPT, 0o600)
    regular(MANIFEST, 0o440)
    stage = json.loads(STATE.read_text())
    boot = json.loads(BOOT.read_text())
    receipt = json.loads(RECEIPT.read_text())
    manifest = json.loads(MANIFEST.read_text())
    check(receipt.get("state") == "ENROLLED" and
          receipt.get("cookieName") == "__Host-cleanops_b1_ingress_device" and
          receipt.get("cookieAttributes") == "Secure; HttpOnly; SameSite=Strict; Path=/",
          "La credencial no está registrada correctamente")
    # Expiry check only; never print the token, credential ID or its contents.
    import base64
    parts = receipt["cookieValue"].split(".")
    check(len(parts) == 3 and parts[0] == "b1-device-v1",
          "Recibo de credencial inválido")
    payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    check(payload["exp"] - int(time.time() * 1000) > 300000,
          "La credencial vence en menos de cinco minutos")
    check(manifest["ingress"].get("evidenceReference") ==
          boot.get("technicalEvidenceReference") and boot.get("authGate05") == "OPEN",
          "Manifiesto de B1 no coincide con el recibo técnico")
    shadow = docker(SHADOW)
    check(shadow.get("Id") == stage.get("containerId") ==
          boot.get("shadowId") and shadow.get("Image") == EXPECTED_IMAGE and
          shadow.get("State", {}).get("Status") == "running",
          "No coincide el shadow B1 en ejecución")
    policy = shadow.get("HostConfig", {}).get("RestartPolicy", {}).get("Name")
    check(policy == "no", "La política de reinicio ya cambió; no aplicar otra vez")
    proxy = docker("dokploy-traefik")
    check(proxy.get("State", {}).get("Status") == "running",
          "Traefik no está operativo")
    mounts = [m for m in proxy.get("Mounts", [])
              if m.get("Type") == "bind" and m.get("Destination") == MOUNT and m.get("RW")]
    check(len(mounts) == 1, "Directorio dinámico no coincide")
    dynamic = Path(mounts[0]["Source"])
    check(dynamic.is_dir() and dynamic.stat().st_uid == 0,
          "Custodia del directorio Traefik inesperada")
    target = dynamic / ROUTER_FILE
    check(not os.path.lexists(target), "Ya existe ruta B1: no sobrescribir")
    contents = SOURCE.read_bytes()
    check(200 < len(contents) < 65536, "Tamaño del delta inesperado")
    yaml = contents.decode("utf-8")
    active = yaml.split("\nhttp:\n", 1)
    check(len(active) == 2, "Delta YAML sin bloque HTTP único")
    settings = active[1].split("\n# ---- Part 2:", 1)[0]
    for fragment in (
        "cleanops360-b1-guarded:", "service: cleanops-b1-shadow",
        'url: "http://cleanops-b1-ingress:3000"',
        "trustForwardHeader: false", "insecureSkipVerify: false",
        "authResponseHeaders: [X-Cleanops-B1-Assertion]",
        "cleanops-b1-strip-assertion", "forwardBody: true"):
        check(fragment in settings, "Falta una invariante del router B1")
    check("<" not in settings and "websecure@docker" not in settings,
          "Marcador pendiente o backend antiguo en YAML")
    for cert in ("server-ca.crt", "traefik-client.crt", "traefik-client.key"):
        regular(dynamic / "cleanops-b1-mtls" / cert, 0o400)
    check(probe("/login") == "200", "La página original /login no responde 200")

    tmp = dynamic / (".b1-guarded-stage-" + str(os.getpid()) + ".tmp")
    installed = False
    restart_changed = False
    try:
        changed = call(["docker", "update", "--restart=unless-stopped", SHADOW])
        check(changed.returncode == 0, "No se pudo supervisar shadow")
        restart_changed = True
        with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                               0o600), "wb") as f:
            f.write(contents)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        # Hard link atomically, refusing to overwrite a route written by
        # another operator; tmp files are not consumed by Traefik file provider.
        os.link(tmp, target, follow_symlinks=False)
        installed = True
        tmp.unlink()
        validated = False
        for _ in range(16):
            if router_enabled() and probe("/auth/login") == "403" and probe("/login") == "200":
                validated = True
                break
            time.sleep(1)
        check(validated, "Ruta B1 no devuelve 403 sin dispositivo o /login cambió")
        check(docker(SHADOW)["State"]["Status"] == "running",
              "Shadow B1 dejó de funcionar")
        print("B1_ROUTER_PUBLICO=ACTIVO")
        print("B1_SIN_COOKIE=DENEGADO_403")
        print("WEB_ORIGINAL_LOGIN=HTTP_200")
        print("B1_SHADOW=RUNNING_SUPERVISADO")
        print("AUTH_GATE_05=OPEN_PENDIENTE_PRUEBAS_FUNCIONALES")
    except Exception:
        # Remove ONLY our new exact file, preserving unrelated Traefik config.
        # Do not disable shadow supervision until router has been removed.
        if installed:
            try:
                current = target.read_bytes()
                if hashlib.sha256(current).digest() == hashlib.sha256(contents).digest():
                    target.unlink()
                    installed = False
            except OSError:
                pass
        if not installed and restart_changed:
            for _ in range(12):
                if not router_enabled():
                    break
                time.sleep(1)
            if not router_enabled():
                call(["docker", "update", "--restart=no", SHADOW])
        print("B1_CUTOVER=ROLLBACK_INTENTADO" if not installed
              else "B1_CUTOVER=REQUIERE_RECUPERACION_MANUAL", file=sys.stderr)
        raise
    finally:
        tmp.unlink(missing_ok=True)


def rollback():
    """Withdraw only the exact B1 router file; keep the old web intact."""
    check(os.geteuid() == 0, "Se requiere root")
    regular(SOURCE, 0o600)
    proxy = docker("dokploy-traefik")
    mounts = [m for m in proxy.get("Mounts", [])
              if m.get("Type") == "bind" and m.get("Destination") == MOUNT and m.get("RW")]
    check(len(mounts) == 1, "Directorio dinámico no coincide")
    target = Path(mounts[0]["Source"]) / ROUTER_FILE
    if os.path.lexists(target):
        regular(target, 0o600)
        check(hashlib.sha256(target.read_bytes()).digest() ==
              hashlib.sha256(SOURCE.read_bytes()).digest(),
              "Ruta B1 fue modificada después de activar; no borrar")
        target.unlink()
    # The file provider updates asynchronously. Do not disable supervision
    # while an active router could still target the candidate.
    for _ in range(15):
        if not router_enabled():
            break
        time.sleep(1)
    check(not router_enabled(), "Traefik aún expone el router B1; mantener shadow")
    result = call(["docker", "update", "--restart=no", SHADOW])
    check(result.returncode == 0, "No se pudo desactivar reinicio automático")
    check(probe("/login") == "200", "Revisar login tras retirar ruta B1")
    print("B1_ROUTER=RETIRADO")
    print("B1_CREDENCIAL=CONSERVADA_PARA_REVOCACION_AUDITADA")
    print("WEB_ORIGINAL_LOGIN=HTTP_200")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["activate"]:
            run()
        elif sys.argv[1:] == ["rollback"]:
            rollback()
        else:
            raise RuntimeError("Uso: b1-cutover-forwardauth.py activate|rollback")
    except Exception as error:
        print("B1_CUTOVER_STOP=" + str(error), file=sys.stderr)
        sys.exit(1)
