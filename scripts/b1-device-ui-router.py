#!/usr/bin/env python3
"""Device-only B1 login/asset route. The legacy public /login remains unchanged."""
import base64
import hashlib
import json
import os
import stat
import subprocess
import sys
import time
from pathlib import Path

SHADOW = "cleanops360-b1-shadow-cc51574a"
DYNAMIC = "/etc/dokploy/traefik/dynamic"
NEW = "cleanops-b1-device-ui.yaml"
ROUTERS = ("cleanops360-b1-device-login@file", "cleanops360-b1-device-assets@file")
YAML = """# B1 UI only for requests carrying its device-cookie name
http:
  routers:
    cleanops360-b1-device-login:
      rule: 'Host("cleanops.nuvurent.com") && Path("/login") && HeaderRegexp("Cookie", "(^|;[ ]*)__Host-cleanops_b1_ingress_device=")'
      priority: 1200
      entryPoints: [websecure]
      tls:
        certResolver: letsencrypt
      middlewares: [cleanops-b1-strip-assertion@file, cleanops-b1-forward-auth@file]
      service: cleanops-b1-shadow@file
    cleanops360-b1-device-assets:
      rule: 'Host("cleanops.nuvurent.com") && PathPrefix("/_next/static/") && HeaderRegexp("Cookie", "(^|;[ ]*)__Host-cleanops_b1_ingress_device=")'
      priority: 1200
      entryPoints: [websecure]
      tls:
        certResolver: letsencrypt
      service: cleanops-b1-shadow@file
"""


def require(ok, msg):
    if not ok:
        raise RuntimeError(msg)


def cmd(args):
    return subprocess.run(args, capture_output=True, text=True, timeout=12)


def inspect(name):
    p = cmd(["docker", "inspect", name])
    require(p.returncode == 0, "Contenedor no localizado")
    return json.loads(p.stdout)[0]


def routers():
    p = cmd(["docker", "exec", "dokploy-traefik", "wget", "-qO-",
             "http://127.0.0.1:8080/api/http/routers"])
    require(p.returncode == 0, "API Traefik no disponible")
    return {x.get("name"): x for x in json.loads(p.stdout)}


def active(name):
    return routers().get(name, {}).get("status") == "enabled"


def without_cookie():
    p = cmd(["curl", "--noproxy", "*", "-sS", "--max-time", "7",
             "--resolve", "cleanops.nuvurent.com:443:127.0.0.1",
             "-o", "/dev/null", "-w", "%{http_code}",
             "https://cleanops.nuvurent.com/login"])
    return p.returncode == 0 and p.stdout.strip() == "200"


def secure(path, mode=None):
    st = path.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and st.st_nlink == 1,
            "Archivo privado inesperado")
    if mode is not None:
        require(stat.S_IMODE(st.st_mode) == mode, "Permisos inesperados")
    return st


def still_valid():
    file = Path("/run/cleanops-b1-operator/result.json")
    secure(file, 0o600)
    data = json.loads(file.read_text())
    require(data.get("state") == "ENROLLED" and
            data.get("cookieName") == "__Host-cleanops_b1_ingress_device",
            "Recibo de dispositivo inválido")
    token = data["cookieValue"]
    p = token.split(".")
    require(len(p) == 3 and p[0] == "b1-device-v1",
            "Formato de credencial inválido")
    d = json.loads(base64.urlsafe_b64decode(p[1] + "=" * (-len(p[1]) % 4)))
    require(d["exp"] - int(time.time() * 1000) >= 300000,
            "Credencial caducada o menos de 5 minutos")


def wait_for(active_now):
    for _ in range(18):
        try:
            rs = routers()
            if all((rs.get(k, {}).get("status") == "enabled") == active_now for k in ROUTERS):
                return True
        except (RuntimeError, ValueError):
            pass
        time.sleep(1)
    return False


def run(action):
    require(os.geteuid() == 0, "Requiere root")
    require(inspect(SHADOW)["State"]["Status"] == "running",
            "Shadow no está en ejecución")
    proxy = inspect("dokploy-traefik")
    require(proxy["State"]["Status"] == "running", "Traefik no está ejecutándose")
    mounts = [m for m in proxy["Mounts"] if m.get("Type") == "bind"
              and m.get("Destination") == DYNAMIC and m.get("RW")]
    require(len(mounts) == 1, "Bind del proveedor de archivos no coincide")
    directory = Path(mounts[0]["Source"])
    st = directory.lstat()
    require(stat.S_ISDIR(st.st_mode) and st.st_uid == 0,
            "Directorio dinámico inesperado")
    secure(directory / "cleanops-b1-guarded.yaml", 0o600)
    require(active("cleanops360-b1-guarded@file"),
            "Router B1 principal no disponible")
    target = directory / NEW
    if action == "activate":
        still_valid()
        require(not os.path.lexists(target), "Router UI ya preparado; no duplicar")
        require(without_cookie(), "Login público original no responde HTTP 200")
        tmp = directory / (".b1-ui-" + str(os.getpid()) + ".tmp")
        installed = False
        try:
            with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as out:
                out.write(YAML.encode())
                out.flush()
                os.fsync(out.fileno())
            os.link(tmp, target, follow_symlinks=False)
            installed = True
            tmp.unlink()
            require(wait_for(True), "Routers UI no habilitados")
            require(without_cookie(), "Login público original ha cambiado")
            print("B1_UI_LOGIN_DEVICE=ROUTER_ACTIVO")
            print("B1_UI_ASSETS_DEVICE=ROUTER_ACTIVO")
            print("WEB_ORIGINAL_SIN_COOKIE=HTTP_200")
            print("AUTH_GATE_05=OPEN_PENDIENTE_FUNCIONAL")
        except Exception:
            if installed and target.is_file() and target.read_bytes() == YAML.encode():
                target.unlink()
                print("B1_UI_RECOVERY=ROUTER_RETIRADO", file=sys.stderr)
            raise
        finally:
            tmp.unlink(missing_ok=True)
    elif action == "rollback":
        if os.path.lexists(target):
            secure(target, 0o600)
            require(hashlib.sha256(target.read_bytes()).digest() ==
                    hashlib.sha256(YAML.encode()).digest(),
                    "Router modificado: no retirar bytes ajenos")
            target.unlink()
        require(wait_for(False), "Los routers UI siguen activos en Traefik")
        require(without_cookie(), "La web original /login no responde")
        print("B1_UI_DEVICE=RETIRADO")
        print("WEB_ORIGINAL_LOGIN=HTTP_200")
        print("B1_MAIN_ROUTER=INTACTO")
    else:
        raise RuntimeError("Uso: activate|rollback")


if __name__ == "__main__":
    try:
        require(sys.argv[1:] in (["activate"], ["rollback"]), "Uso: activate|rollback")
        run(sys.argv[1])
    except Exception as exc:
        print("B1_UI_STOP=" + str(exc), file=sys.stderr)
        sys.exit(1)
