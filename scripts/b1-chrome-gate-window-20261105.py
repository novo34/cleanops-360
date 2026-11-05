#!/usr/bin/env python3
"""One-shot guarded staging B1 SQL window; 20-min systemd auto-rollback.
No production changes, account details, secrets or policy contents printed.
"""
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

DB="cleanops_staging"
PG="cleanops360-f4fxmd-postgres-1"
POLICY_HASH="3d582f5099611756473110c69fcddbd2ff76292d277bf01afc86ee854009147a"
OLD=Path("/root/b1-gate-trial-20261105.receipt.json")
RECEIPT=Path("/root/b1-chrome-gate-20261105.receipt.json")
SCRIPT=Path("/root/b1-chrome-gate-window-20261105.py")
UNIT="cleanops-b1-chrome-gate-20261105"
ROUTERS=("cleanops360-b1-device-login@file",
         "cleanops360-b1-device-assets@file",
         "cleanops360-b1-guarded@file")

def require(ok,msg):
    if not ok: raise RuntimeError(msg)

def private(path,mode):
    st=path.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_gid==0
            and stat.S_IMODE(st.st_mode)==mode and st.st_nlink==1,
            "ARCHIVO_PRIVADO_INVALIDO")

def call(args,stdin=None,timeout=25):
    p=subprocess.run(args,input=stdin,capture_output=True,text=True,timeout=timeout)
    require(p.returncode==0,"COMANDO_NO_DISPONIBLE")
    return p.stdout.strip()

def sql(statement):
    return call(["docker","exec","-i",PG,"sh","-c",
      'exec psql -X -q -A -t -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
      statement,25)

def one(raw):
    lines=[x for x in raw.splitlines() if x.startswith("{") and x.endswith("}")]
    require(len(lines)==1,"RESULTADO_SQL_NO_UNICO")
    return json.loads(lines[0])

def sha(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,
        separators=(",",":"),ensure_ascii=False).encode()).hexdigest()

def state():
    r=one(sql("""BEGIN TRANSACTION READ ONLY;
SELECT row_to_json(x)::text FROM (
 SELECT current_database() db, version, deployment_enabled, values_json
 FROM identity_private.configuration WHERE singleton
) x;
COMMIT;"""))
    require(r.get("db")==DB and type(r.get("version")) is int
      and type(r.get("deployment_enabled")) is bool
      and isinstance(r.get("values_json"),dict),"DB_O_CONFIG_INVALIDA")
    return r

def accounts():
    result=one(sql("""BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
 'active',count(*),
 'reserved',count(*) FILTER (
   WHERE lower(split_part(p.email_normalized,'@',2)) ~
   '(^|[.])(invalid|test|localhost)$|^example[.](com|org|net)$'
 ))::text
FROM app.users u
JOIN identity_private.principals p ON p.id=u.principal_id
JOIN identity_private.credentials c ON c.principal_id=p.id
JOIN app.organizations o ON o.id=u.tenant_id
WHERE u.state='ACTIVE' AND p.state='ACTIVE' AND o.state='ACTIVE';
COMMIT;"""))
    if result.get("active")!=1 or result.get("reserved")!=1:
        print("B1_CUENTA_SINTETICA=NO_ACREDITADA",flush=True)
        raise RuntimeError("GATE_NO_ABIERTO_CUENTA_NO_ACREDITADA")
    print("B1_CUENTA_SINTETICA=DOMINIO_RESERVADO_PASS",flush=True)

def check_routers():
    r=json.loads(call(["docker","exec","dokploy-traefik","wget","-qO-",
            "http://127.0.0.1:8080/api/http/routers"],timeout=12))
    found={x.get("name"):x.get("status") for x in r}
    require(all(found.get(name)=="enabled" for name in ROUTERS),
            "ROUTERS_B1_NO_ACTIVOS")

def transact(r,enabled):
    require(0<r["version"]<2**63-1,"VERSION_INVALIDA")
    payload=json.dumps(r["values_json"],separators=(",",":"),ensure_ascii=True)
    require("$b1json$" not in payload,"DELIMITADOR_INVALIDO")
    json_sql="$b1json$"+payload+"$b1json$::jsonb"
    src,dst=("false","true") if enabled else ("true","false")
    sql(f"""BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
DO $b1$
DECLARE changed integer;
BEGIN
 IF current_database()<>'{DB}' THEN RAISE EXCEPTION 'WRONG_DB'; END IF;
 UPDATE identity_private.configuration SET deployment_enabled={dst}
  WHERE singleton=true AND deployment_enabled={src} AND version={r["version"]}
  AND values_json={json_sql};
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'CAS_MISMATCH'; END IF;
END $b1$;
COMMIT;""")

def rollback():
    require(RECEIPT.exists(),"RECIBO_CHROME_AUSENTE")
    private(RECEIPT,0o600)
    receipt=json.loads(RECEIPT.read_text())
    require(receipt.get("database")==DB and receipt.get("intent")==UNIT
            and receipt.get("policy_sha256")==POLICY_HASH
            and receipt.get("before_enabled") is False,
            "RECIBO_CHROME_NO_COINCIDE")
    r=state()
    require(r["version"]==receipt["version"]
            and sha(r["values_json"])==POLICY_HASH,"DERIVA_CONFIG_SQL")
    if not r["deployment_enabled"]:
        print("B1_GATE_CHROME=YA_CERRADO",flush=True)
        return
    transact(r,False)
    require(state()["deployment_enabled"] is False,"GATE_CIERRE_NO_VERIFICADO")
    print("B1_GATE_CHROME=ROLLBACK_PASS",flush=True)

def activate():
    private(OLD,0o600)
    prev=json.loads(OLD.read_text())
    require(prev.get("database")==DB and prev.get("before_enabled") is False
      and prev.get("policy_sha256")==POLICY_HASH,"RECIBO_ANTERIOR_INVALIDO")
    require(not RECEIPT.exists(),"RECIBO_CHROME_EXISTE_NO_REPETIR")
    private(SCRIPT,0o700)
    require(shutil.which("systemd-run") and shutil.which("systemctl")
      and Path("/usr/bin/python3").exists(),"TIMER_ROLLBACK_NO_DISPONIBLE")
    r=state()
    require(r["deployment_enabled"] is False
      and len(r["values_json"])==60 and sha(r["values_json"])==POLICY_HASH,
      "GATE_PRECHECK_NO_COINCIDE")
    check_routers()
    accounts()
    receipt={"database":DB,"version":r["version"],"policy_sha256":POLICY_HASH,
             "before_enabled":False,"intent":UNIT}
    with os.fdopen(os.open(RECEIPT,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600),"w") as out:
        json.dump(receipt,out,sort_keys=True)
        out.write("\n");out.flush();os.fsync(out.fileno())
    try:
        call(["systemd-run","--quiet","--unit="+UNIT,"--on-active=20m",
              "/usr/bin/python3",str(SCRIPT),"rollback"],timeout=20)
        require(call(["systemctl","is-active",UNIT+".timer"],timeout=10)=="active",
          "TIMER_ROLLBACK_NO_ACTIVO")
        print("B1_ROLLBACK_AUTOMATICO=PROGRAMADO_20_MIN",flush=True)
        transact(r,True)
        after=state()
        require(after["deployment_enabled"] is True
           and after["version"]==r["version"]
           and sha(after["values_json"])==POLICY_HASH,
           "GATE_ABIERTO_NO_VERIFICADO")
        print("B1_GATE_CHROME=HABILITADO_VERIFICADO",flush=True)
    except Exception:
        try: rollback()
        except Exception:
            print("B1_GATE_CHROME=REVISION_MANUAL_NECESARIA",flush=True)
        raise

if __name__=="__main__":
    os.umask(0o077)
    try:
        require(os.geteuid()==0,"REQUIERE_ROOT")
        require(len(sys.argv)==2,"USO_ACTIVATE_O_ROLLBACK")
        if sys.argv[1]=="activate":activate()
        elif sys.argv[1]=="rollback":rollback()
        else:raise RuntimeError("ACCION_INVALIDA")
    except Exception as e:
        print("B1_CHROME_TRIAL_STOP="+str(e),flush=True)
        sys.exit(1)
    finally:
        print("B1_GATE_SOLO_STAGING=SI",flush=True)
        print("B1_SECRETOS_EMAILS_Y_POLITICA=NO_IMPRESOS",flush=True)
