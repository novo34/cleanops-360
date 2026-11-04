#!/usr/bin/env python3
"""Stage existing Traefik B1 mTLS bytes in the ALREADY-mounted private file-provider tree.

Staging only: no router YAML write, no Traefik restart, no web/PG/OpenBao mutation.
The destination is not a new Docker mount. Requires Traefik's configured user
to be root so the client key can remain root-only 0400.
"""
import hashlib
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

CONTAINER = "dokploy-traefik"
MOUNT_TARGET = "/etc/dokploy/traefik/dynamic"
SUBDIR = "cleanops-b1-mtls"
SOURCE = Path("/etc/cleanops360-staging/b1-ingress-pki")
FILES = ("server-ca.crt", "traefik-client.crt", "traefik-client.key")


def stop(reason):
    raise RuntimeError(reason)


def inspect(container):
    result = subprocess.run(["docker", "container", "inspect", container],
                            capture_output=True, text=True, check=False, timeout=20)
    if result.returncode:
        stop("Contenedor Traefik no encontrado")
    return json.loads(result.stdout)[0]


def require_regular(path):
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_nlink != 1:
        stop("Origen TLS no es archivo root regular único")
    if st.st_size < 1 or st.st_size > 65536:
        stop("Tamaño del material TLS fuera de límite")
    if (st.st_mode & 0o022):
        stop("Origen TLS permite escritura a grupo/otros")
    return st


def stage():
    if os.geteuid() != 0:
        stop("Se requiere root")
    proxy = inspect(CONTAINER)
    if proxy.get("State", {}).get("Status") != "running":
        stop("Traefik no está en ejecución")
    # Traefik default is root; with a nonroot runtime the key is intentionally
    # not copied into the shared folder until an approved access model exists.
    if proxy.get("Config", {}).get("User") not in ("", "root", "0", "0:0"):
        stop("Traefik utiliza usuario distinto de root; requiere otro plan de acceso")
    mounts = [m for m in proxy.get("Mounts", [])
              if m.get("Type") == "bind" and m.get("Destination") == MOUNT_TARGET]
    if len(mounts) != 1 or not mounts[0].get("RW"):
        stop("No existe el bind RW esperado del proveedor dinámico")
    hostdir = Path(mounts[0]["Source"])
    root_st = hostdir.lstat()
    if not stat.S_ISDIR(root_st.st_mode) or root_st.st_uid != 0:
        stop("Host directory del proveedor Traefik inesperado")
    if (root_st.st_mode & 0o022):
        stop("Host directory de Traefik escribible por terceros")
    existing = hostdir / SUBDIR
    if os.path.lexists(existing):
        stop("TLS B1 ya preparado o destino ocupado; no sobrescribir")

    # Do not read/write original private keys except to copy into a root-only
    # subdirectory; no secrets or fingerprints are logged.
    for name in FILES:
        require_regular(SOURCE / name)

    created = False
    names_written = []
    try:
        os.mkdir(existing, 0o700)
        created = True
        os.chown(existing, 0, 0)
        os.chmod(existing, 0o700)
        for name in FILES:
            inp = SOURCE / name
            fd = os.open(inp, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                first = os.fstat(fd)
                if first.st_uid != 0 or not stat.S_ISREG(first.st_mode) or first.st_nlink != 1:
                    stop("Origen TLS cambió durante la copia")
                payload = os.read(fd, 65537)
            finally:
                os.close(fd)
            if len(payload) < 1 or len(payload) > 65536:
                stop("Origen TLS cambió de tamaño")
            dst = existing / name
            out = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
            names_written.append(dst)
            try:
                os.fchown(out, 0, 0)
                os.fchmod(out, 0o400)
                offset = 0
                while offset < len(payload):
                    offset += os.write(out, payload[offset:])
                os.fsync(out)
            finally:
                os.close(out)
            # This is COPY integrity validation, not a repeated PKI validation.
            if hashlib.sha256(dst.read_bytes()).digest() != hashlib.sha256(payload).digest():
                stop("Copia de TLS no coincide con origen")
        print("TRAEFIK_B1_TLS=PREPARADO")
        print("COPIAS_TLS=3_ROOT_ONLY")
        print("ORIGINALES_TLS=INTACTOS")
        print("FORWARDAUTH=NO_ACTIVADO")
        print("WEB_B1=NO_ARRANCADA")
    except Exception:
        if created:
            for target in names_written:
                try:
                    target.unlink()
                except OSError:
                    pass
            try:
                existing.rmdir()
            except OSError:
                pass
        raise


if __name__ == "__main__":
    try:
        stage()
    except (RuntimeError, OSError, ValueError, KeyError,
            subprocess.TimeoutExpired) as exc:
        print("TRAEFIK_B1_TLS_STOP=" + str(exc), file=sys.stderr)
        sys.exit(1)
