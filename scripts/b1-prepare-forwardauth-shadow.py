#!/usr/bin/env python3
"""Prepare B1 ForwardAuth for a separate shadow backend; no live changes.

Renders a private pending YAML from the reviewed B1 template. Does not
start containers, expose secrets, write Traefik dynamic directory, or
mutate the B1 manifest.
"""
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

SHADOW = "cleanops360-b1-shadow-cc51574a"
STATE = Path("/root/b1-shadow-stage/stage.json")
OUTPUT = Path("/root/b1-shadow-stage/b1-forwardauth.pending")
MANIFEST = Path("/run/cleanops-b1-private/installation.json")
CERT_DIR = Path("/etc/cleanops360-staging/b1-ingress-pki")
TRAEFIK_DIR = "/etc/dokploy/traefik/dynamic"
TRAEFIK_TLS = TRAEFIK_DIR + "/cleanops-b1-mtls"


def fail(reason):
    raise RuntimeError(reason)


def inspect(name):
    cmd = subprocess.run(["docker", "container", "inspect", name],
                         text=True, capture_output=True, check=False, timeout=20)
    if cmd.returncode != 0:
        fail("No se encuentra el contenedor esperado")
    return json.loads(cmd.stdout)[0]


def regular(path):
    meta = path.lstat()
    if not stat.S_ISREG(meta.st_mode) or meta.st_nlink != 1 or meta.st_size <= 0:
        fail("Material TLS no es archivo regular")
    return meta


def prepare(template):
    if os.geteuid() != 0:
        fail("Se requiere root")
    if OUTPUT.exists():
        fail("El delta privado ya está preparado; no volver a prepararlo")
    snapshot = json.loads(STATE.read_text())
    if snapshot.get("container") != SHADOW or snapshot.get("state") != "CREATED_NOT_STARTED":
        fail("Estado de contenedor B1 inesperado")
    shadow = inspect(SHADOW)
    if (shadow.get("Id") != snapshot.get("containerId")
        or shadow.get("State", {}).get("Status") != "created"):
        fail("El candidato B1 fue modificado después de prepararlo")
    proxy = inspect("dokploy-traefik")
    if proxy.get("State", {}).get("Status") != "running":
        fail("Traefik no está operativo")
    mounts = [m for m in proxy.get("Mounts", [])
              if m.get("Type") == "bind" and m.get("Destination") == TRAEFIK_DIR]
    if len(mounts) != 1:
        fail("El directorio dinámico existente de Traefik no coincide")
    # The rendered paths are in Traefik's existing bind, not in CERT_DIR.
    staged = Path(mounts[0]["Source"]) / "cleanops-b1-mtls"
    staged_info = staged.lstat()
    if not stat.S_ISDIR(staged_info.st_mode) or staged_info.st_uid != 0 or stat.S_IMODE(staged_info.st_mode) != 0o700:
        fail("Directorio TLS B1 del proxy no es root-only")
    for name in ("server-ca.crt", "traefik-client.crt", "traefik-client.key"):
        regular(CERT_DIR / name)
        staged_file = staged / name
        meta = regular(staged_file)
        if meta.st_uid != 0 or stat.S_IMODE(meta.st_mode) != 0o400:
            fail("Archivo TLS preparado sin custodia root-only")

    manifest = json.loads(MANIFEST.read_text())
    ingress = manifest.get("ingress", {})
    port = ingress.get("port")
    if not isinstance(port, int) or isinstance(port, bool) or port < 1 or port > 65535:
        fail("Puerto B1 del manifiesto inválido")
    source = template.read_text(encoding="utf-8")
    required = [
        "service: cleanops-b1-shadow",
        'url: "http://cleanops-b1-ingress:3000"',
        'address: "https://cleanops-b1-ingress:<ingress.port>/forward-auth"'
    ]
    if not all(item in source for item in required):
        fail("La plantilla no apunta de forma exclusiva al candidato B1")
    converted = (source
        .replace("<ingress.port>", str(port))
        .replace("<path of the CA that signed the listener certificate, read-only in Traefik>",
                 TRAEFIK_TLS + "/server-ca.crt")
        .replace("<path of the pinned Traefik client certificate (SHA-256 = manifest proxyCertificateSha256)>",
                 TRAEFIK_TLS + "/traefik-client.crt")
        .replace("<path of its private key, never in Git>",
                 TRAEFIK_TLS + "/traefik-client.key"))
    if any(tag in converted for tag in ("<ingress.port>", "<path of")):
        fail("Quedan marcadores TLS sin resolver")
    if "service: cleanops360-f4fxmd-15-websecure@docker" in converted:
        fail("El router no puede utilizar la web anterior")
    fd = os.open(OUTPUT, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "w") as out:
            out.write(converted)
            out.flush()
            os.fsync(out.fileno())
    except Exception:
        OUTPUT.unlink(missing_ok=True)
        raise
    print("B1_FORWARD_AUTH=DELTA_PREPARADO_NO_ACTIVO")
    print("WEB_ANTERIOR=CONSERVADA")
    print("BACKEND_B1=SOMBRA_SEPARADA")
    print("TRAEFIK=NO_MODIFICADO")
    if not str(ingress.get("evidenceReference") or "").strip():
        print("B1_EVIDENCE_REFERENCE=PENDIENTE")
    else:
        print("B1_EVIDENCE_REFERENCE=PRESENTE_SIN_APROBAR")
    print("CREDENCIAL_DISPOSITIVO=AUN_NO_EMITIDA")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            fail("Uso: script /ruta/plantilla-versionada.yaml")
        prepare(Path(sys.argv[1]))
    except (RuntimeError, OSError, ValueError, KeyError, IndexError,
            subprocess.TimeoutExpired) as exc:
        print("B1_STOP=" + str(exc), file=sys.stderr)
        sys.exit(1)
