#!/usr/bin/env python3
"""Activate ONLY a device-guarded B1 UI canary; prove routing and rollback on error.

No SQL changes, no redeploy, no certificate changes, no original web alteration.
Uses the Git-pinned reviewed UI v2 YAML, not a generated/relaxed middleware.
"""
import base64
import html
import json
import os
import re
import stat
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

REPO = "/etc/dokploy/compose/cleanops360-f4fxmd/code"
YAML_COMMIT = "b0b98bc80880f2d8933cd49132b845679a161ada"
YAML_PATH = "deploy/staging/traefik/b1-device-ui-assets-v2.review.yaml"
YAML_BLOB = "b7410ec217ff309f045a060e5612f0496264faca"
ROOT = "/etc/dokploy/traefik/dynamic"
TARGET = "cleanops-b1-device-ui-v2.yaml"
OLD_TARGET = "cleanops-b1-device-ui.yaml"
CANARY = "cleanops360-b1-assets-shadow-296d4ef2"
CANARY_IMAGE = "sha256:da7e2fc8369763d51002acdd4b00eb7788ecc603f39275dd36407fe6b6ade332"
CANARY_PROJECT = "cleanops-b1-assets-296d4ef2"
ROUTERS = ("cleanops360-b1-device-login@file", "cleanops360-b1-device-assets@file")
MAIN = "cleanops360-b1-guarded@file"
URL = "https://cleanops.nuvurent.com"
RECEIPT = Path("/run/cleanops-b1-operator/result.json")

def run(args, *, input=None, timeout=15, check=True):
    p = subprocess.run(args, input=input, capture_output=True, text=True, timeout=timeout)
    if check and p.returncode:
        raise RuntimeError("EJECUCION_FALLIDA")
    return p

def docker(name):
    return json.loads(run(["docker", "container", "inspect", name]).stdout)[0]

def regular(path, mode=None):
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != 0 or \
       (mode is not None and stat.S_IMODE(st.st_mode) != mode):
        raise RuntimeError("METADATOS_PRIVADOS_INVALIDOS")

def routers():
    p = run(["docker", "exec", "dokploy-traefik", "wget", "-qO-",
             "http://127.0.0.1:8080/api/http/routers"], timeout=12)
    return {v["name"]: v for v in json.loads(p.stdout)}

def wait(wanted):
    for _ in range(18):
        try:
            r = routers()
            if all((r.get(name, {}).get("status") == "enabled") == wanted for name in ROUTERS):
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("ROUTERS_ESTADO_NO_CONFIRMADO")

def source_yaml():
    b = subprocess.run(
        ["git", "-C", REPO, "show", YAML_COMMIT + ":" + YAML_PATH],
        capture_output=True, timeout=20, check=True).stdout
    digest = run(["git", "hash-object", "--stdin"],
                 input=b.decode("utf-8"), timeout=8).stdout.strip()
    if digest != YAML_BLOB:
        raise RuntimeError("YAML_NO_COINCIDE")
    value = b.decode("utf-8")
    for expected in (
        "cleanops360-b1-device-login:", "cleanops360-b1-device-assets:",
        "middlewares: [cleanops-b1-strip-assertion@file, cleanops-b1-forward-auth@file]",
        "PathPrefix(\"/b1-static/_next/static/\")",
        "prefixes: [/b1-static]",
        "http://cleanops-b1-assets:3000",
    ):
        if expected not in value:
            raise RuntimeError("YAML_INVARIANTE_AUSENTE")
    if value.count("service: cleanops-b1-assets-shadow@file") != 2:
        raise RuntimeError("YAML_SERVICIO_INCORRECTO")
    return b

def canonical_directory():
    proxy = docker("dokploy-traefik")
    if proxy["State"]["Status"] != "running":
        raise RuntimeError("TRAEFIK_NO_RUNNING")
    mounts = [m for m in proxy["Mounts"] if
              m.get("Type") == "bind" and m.get("Destination") == ROOT and m.get("RW") is True]
    if len(mounts) != 1:
        raise RuntimeError("DYNAMIC_BIND_INVALIDO")
    folder = Path(mounts[0]["Source"])
    if not folder.is_dir() or folder.stat().st_uid != 0:
        raise RuntimeError("DIRECTORIO_INVALIDO")
    regular(folder / "cleanops-b1-guarded.yaml", 0o600)
    return folder

def device_cookie():
    regular(RECEIPT, 0o600)
    obj = json.loads(RECEIPT.read_text())
    name, value = obj.get("cookieName"), obj.get("cookieValue")
    if obj.get("state") != "ENROLLED" or name != "__Host-cleanops_b1_ingress_device" or \
       not isinstance(value, str) or not re.fullmatch(r"b1-device-v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", value):
        raise RuntimeError("DEVICE_RECEIPT_INVALIDO")
    parts = value.split(".")
    payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    if payload.get("exp", 0) - int(time.time() * 1000) < 300000:
        raise RuntimeError("DEVICE_CADUCADO")
    return name, value

def probe(path, cookie=None):
    if not path.startswith("/") or "//" in path[:3] or len(path) > 500:
        raise RuntimeError("URL_INVALIDA")
    args = ["curl", "-q", "--silent", "--show-error", "--noproxy", "*",
            "--max-time", "12", "--connect-timeout", "4", "--max-filesize", "4000000",
            "--resolve", "cleanops.nuvurent.com:443:127.0.0.1",
            "--header", "Accept: text/html,application/xhtml+xml,*/*;q=0.8",
            "--output", "-", "--write-out", "\n__B1_HTTP__=%{http_code}:%{content_type}",
            "--config", "-", URL + path]
    payload = ""
    if cookie is not None:
        name, value = cookie
        payload = f'header = "Cookie: {name}={value}"\n'
    p = run(args, input=payload, timeout=16, check=False)
    if p.returncode != 0 or "\n__B1_HTTP__=" not in p.stdout:
        raise RuntimeError("HTTP_ERROR")
    body, result = p.stdout.rsplit("\n__B1_HTTP__=", 1)
    code, content_type = result.strip().split(":", 1)
    return code, content_type, body

def ensure_original():
    code, content_type, body = probe("/login")
    if code != "200" or "text/html" not in content_type or "<html" not in body.lower() or "/b1-static/_next/static/" in body:
        raise RuntimeError("LOGIN_ORIGINAL_ALTERADO")

def inspect_canary():
    c = docker(CANARY)
    if c["State"]["Status"] != "running" or c["Image"] != CANARY_IMAGE or \
       (c.get("Config",{}).get("Labels") or {}).get("com.docker.compose.project") != CANARY_PROJECT:
        raise RuntimeError("CANARY_INCORRECTO")
    if "cleanops-b1-assets" not in (
        c.get("NetworkSettings",{}).get("Networks",{}).get("dokploy-network",{}).get("Aliases") or []
    ):
        raise RuntimeError("ALIAS_NO_COINCIDE")
    env = dict(v.split("=",1) for v in c.get("Config",{}).get("Env",[]) if "=" in v)
    if env.get("CLEANOPS_B1_ASSET_PREFIX") != "/b1-static":
        raise RuntimeError("PREFIJO_RUNTIME_NO_ACTIVO")

def asset_candidates(body):
    refs = [html.unescape(m) for m in re.findall(r'(?:href|src)="([^"]+)"', body)]
    static = [v for v in refs if "/_next/static/" in v]
    if not static or any(not v.startswith("/b1-static/_next/static/") for v in static):
        raise RuntimeError("ASSETS_HTML_MEZCLADOS")
    found={}
    for ext in ("css", "js"):
        match = next((v for v in static if urlsplit(v).path.endswith("." + ext)), None)
        if not match:
            raise RuntimeError("ASSET_" + ext.upper() + "_NO_REFERENCIADO")
        u=urlsplit(match)
        if u.scheme or u.netloc or not re.fullmatch(r"/b1-static/_next/static/[A-Za-z0-9_./%\-]+", u.path):
            raise RuntimeError("ASSET_PATH_INVALIDO")
        found[ext] = u.path + (("?" + u.query) if u.query else "")
    return found

def verify_public(cookie):
    code, content_type, body = probe("/login", cookie)
    if code != "200" or "text/html" not in content_type:
        raise RuntimeError("B1_LOGIN_NO_200")
    refs = asset_candidates(body)
    for ext, path in refs.items():
        status, content_type, data = probe(path)
        if status != "200":
            raise RuntimeError("B1_ASSET_" + ext.upper() + "_NO_200")
        if ext == "css":
            if "text/css" not in content_type or len(data) < 100:
                raise RuntimeError("B1_CSS_MIME_O_CONTENIDO_INVALIDO")
        elif not any(t in content_type for t in ("javascript", "ecmascript")) or len(data) < 100:
            raise RuntimeError("B1_JS_MIME_O_CONTENIDO_INVALIDO")
    print("B1_UI_V2_HTTP=200",flush=True)
    print("B1_UI_V2_CSS=PASS",flush=True)
    print("B1_UI_V2_JS=PASS",flush=True)
    print("B1_UI_V2_REF_MIX=ZERO",flush=True)

def safe_unlink(target, expected):
    if os.path.lexists(target):
        regular(target, 0o600)
        if target.read_bytes() != expected:
            raise RuntimeError("ROUTER_BYTES_MODIFICADOS")
        target.unlink()
    wait(False)
    ensure_original()
    print("B1_UI_V2_ROLLBACK=PASS",flush=True)

def activate():
    if os.geteuid() != 0: raise RuntimeError("REQUIERE_ROOT")
    content=source_yaml()
    folder=canonical_directory()
    target=folder/TARGET
    if os.path.lexists(target) or os.path.lexists(folder/OLD_TARGET):
        raise RuntimeError("UI_ROUTER_YA_EXISTE")
    r=routers()
    if r.get(MAIN,{}).get("status")!="enabled" or \
       any(r.get(name,{}).get("status") == "enabled" for name in ROUTERS):
        raise RuntimeError("ROUTER_PREEXISTENTE")
    inspect_canary()
    ck = device_cookie()
    ensure_original()
    tmp=folder/(".b1-ui-v2-" + str(os.getpid()) + ".tmp")
    installed=False
    try:
        with os.fdopen(os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),"wb") as fh:
            fh.write(content); fh.flush(); os.fsync(fh.fileno())
        os.link(tmp,target,follow_symlinks=False)
        installed=True
        tmp.unlink()
        wait(True)
        ensure_original()
        verify_public(ck)
        if docker(CANARY)["State"]["Status"] != "running":
            raise RuntimeError("CANARY_DETUVO")
        print("B1_UI_V2=ACTIVO_DEVICE_ONLY",flush=True)
    except Exception:
        if installed:
            try: safe_unlink(target, content)
            except Exception: print("B1_UI_V2_ROLLBACK=REQUIERE_REVISION",flush=True)
        raise
    finally:
        tmp.unlink(missing_ok=True)

def rollback():
    if os.geteuid()!=0: raise RuntimeError("REQUIERE_ROOT")
    content=source_yaml()
    folder=canonical_directory()
    safe_unlink(folder/TARGET,content)
    print("B1_MAIN_ROUTER=INTACTO",flush=True)

if __name__=="__main__":
    try:
        action=sys.argv[1] if len(sys.argv)==2 else ""
        if action=="activate":activate()
        elif action=="rollback":rollback()
        else: raise RuntimeError("USO_ACTIVATE_O_ROLLBACK")
    except Exception as e:
        print("B1_UI_V2_STOP="+str(e),flush=True)
        sys.exit(1)
    finally:
        print("B1_SQL_GATE=NO_MODIFICADO",flush=True)
        print("B1_ORIGINALES=NO_MODIFICADOS_POR_SCRIPT",flush=True)
        print("B1_SECRETOS=NO_IMPRESOS",flush=True)
