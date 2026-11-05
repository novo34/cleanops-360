#!/usr/bin/env python3
"""One-time B1 staging device credential replacement after UI-v2 expiry.

Never creates accounts, users, roles, migrations, routers or deployments.
Never prints the bearer token, original request, secrets or private logs.
Only archived, expired ENROLLED receipt and request may be replaced.
"""
import base64
import json
import os
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path

DIR = Path("/run/cleanops-b1-operator")
ARCHIVE = DIR / "expired-ui-v2-20261105"
COMPOSE = "/root/b1-shadow-stage/compose.yaml"
EXPECTED_ROLE = "cleanops_b1_operator_login"
NEW_REFERENCE = "b1-owner-device-v2-replacement-20261105"
NEW_AUTH_REFERENCE = "owner-b1-expired-device-v2-replacement-20261105"

def need(condition, reason):
    if not condition:
        raise RuntimeError(reason)

def file(path, mode, *, kind="file"):
    st = path.lstat()
    need(st.st_uid == 0 and st.st_gid == 0 and stat.S_IMODE(st.st_mode) == mode,
         "PERMISOS_PRIVADOS_INVALIDOS")
    if kind == "file":
        need(stat.S_ISREG(st.st_mode) and st.st_nlink == 1, "ARCHIVO_PRIVADO_INVALIDO")
    else:
        need(stat.S_ISDIR(st.st_mode), "DIRECTORIO_PRIVADO_INVALIDO")
    return st

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def exp_from_credential(value):
    need(isinstance(value,str) and value.startswith("b1-device-v1."), "TOKEN_FORMATO_INVALIDO")
    parts = value.split(".")
    need(len(parts)==3, "TOKEN_FORMATO_INVALIDO")
    payload=json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    return payload.get("exp")

def prepare():
    need(os.geteuid() == 0, "REQUIERE_ROOT")
    file(DIR,0o700,kind="dir")
    need(not ARCHIVE.exists(), "REEMPLAZO_YA_PREPARADO_NO_REPETIR")
    request_path, result_path = DIR/"request.json", DIR/"result.json"
    file(request_path,0o400)
    file(result_path,0o600)
    file(DIR/"postgres.password",0o400)
    file(DIR/"ingress-signing.pem",0o400)
    file(Path(COMPOSE),0o600)
    request=read_json(request_path)
    result=read_json(result_path)
    need(request.get("version")==1 and request.get("operation")=="device.issue" and
         request.get("operatorLoginRole")==EXPECTED_ROLE and
         isinstance(request.get("device"),str) and bool(request.get("device")) and
         isinstance(request.get("browser"),str) and bool(request.get("browser")),
         "SOLICITUD_OPERADOR_INVALIDA")
    need(set(request)=={"version","operation","operatorLoginRole","device","browser",
                        "lifetimeMs","reference","authorizationReference"},
         "SOLICITUD_CAMPOS_INESPERADOS")
    lifetime=request.get("lifetimeMs")
    need(type(lifetime) is int and 0<lifetime<=14400000,
         "TTL_OPERADOR_INVALIDO")
    need(result.get("state")=="ENROLLED" and
         result.get("cookieName")=="__Host-cleanops_b1_ingress_device" and
         isinstance(result.get("id"),str), "RECIBO_ANTERIOR_INVALIDO")
    exp=exp_from_credential(result.get("cookieValue"))
    need(type(exp) is int and exp-int(time.time()*1000)<300000,
         "CREDENCIAL_ANTERIOR_TODAVIA_VIGENTE")
    # Never write a new audit authorization with old receipt or token content.
    request["reference"]=NEW_REFERENCE
    request["authorizationReference"]=NEW_AUTH_REFERENCE
    ARCHIVE.mkdir(mode=0o700)
    request_path.rename(ARCHIVE/"request.json")
    result_path.rename(ARCHIVE/"result.json")
    with os.fdopen(os.open(request_path,
        os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400),"w") as fh:
        json.dump(request,fh,sort_keys=True)
        fh.write("\n");fh.flush();os.fsync(fh.fileno())
    print("B1_RECIBO_ANTERIOR=ARCHIVADO_PRIVADO",flush=True)
    print("B1_REEMPLAZO_V2=PREPARADO",flush=True)

def issue():
    argv=["docker","compose","-f",COMPOSE,"-p","cleanops-b1-shadow",
        "run","--rm","--no-deps","--user","0:0","--volume",
        "/run/cleanops-b1-operator:/run/cleanops-b1-operator:rw",
        "--entrypoint","node","shadow","scripts/b1-private-operator.mjs",
        "/run/cleanops-b1-operator"]
    proc=subprocess.run(argv,capture_output=True,text=True,timeout=150)
    if proc.returncode != 0:
        raise RuntimeError("OPERADOR_NO_CONFIRMADO_NO_REPETIR")
    need("B1_OPERATOR_RECEIPT_SEALED" in proc.stdout,
         "OPERADOR_NO_SELLO_RECIBO_NO_REPETIR")
    file(DIR/"result.json",0o600)
    result=read_json(DIR/"result.json")
    need(result.get("state")=="ENROLLED" and
         result.get("cookieName")=="__Host-cleanops_b1_ingress_device",
         "NUEVO_RECIBO_INVALIDO")
    exp=exp_from_credential(result.get("cookieValue"))
    need(type(exp) is int and exp-int(time.time()*1000)>300000,
         "RECIBO_NUEVO_CADUCADO")
    print("B1_OPERATOR_RECEIPT_SEALED",flush=True)
    print("B1_CREDENCIAL_V2=ENROLLED",flush=True)
    print("B1_CREDENCIAL_V2_MINUTOS_RESTANTES=" + str((exp-int(time.time()*1000))//60000),flush=True)

def main():
    os.umask(0o077)
    try:
        prepare()
        issue()
    except Exception as err:
        print("B1_RENOVACION_STOP="+str(err),flush=True)
        sys.exit(1)
    finally:
        print("B1_USUARIO_Y_ROLES=NO_MODIFICADOS",flush=True)
        print("B1_TRAEFIK=NO_MODIFICADO",flush=True)
        print("B1_GATE_SQL=NO_MODIFICADO",flush=True)
        print("B1_COOKIE=NO_EXPUESTA",flush=True)

if __name__=="__main__":
    main()
