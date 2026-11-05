#!/usr/bin/env python3
"""Isolated B1 assets canary on EXISTING image. No routes, no SQL gate, no replacement."""
import json
import os
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path

OLD = "cleanops360-b1-shadow-cc51574a"
WEB = "cleanops360-f4fxmd-web-1"
PG = "cleanops360-f4fxmd-postgres-1"
NEW = "cleanops360-b1-assets-shadow-296d4ef2"
IMAGE = "cleanops360-b1-assets-candidate:296d4ef2"
EXPECTED_IMAGE = "sha256:da7e2fc8369763d51002acdd4b00eb7788ecc603f39275dd36407fe6b6ade332"
EXPECTED_SOURCE = "296d4ef2063e3c39eeffa0c4d14fd3deb92922d7"
EXPECTED_OLD_IMAGE = "sha256:1db5df548b85f451f5eeec41959671aa1b983bffa687dae722c94571d5c20016"
DIRECTORY = Path("/root/b1-assets-canary-20261105")
COMPOSE = DIRECTORY / "compose.json"
PROJECT = "cleanops-b1-assets-296d4ef2"
SINK = "cleanops360-f4fxmd_identity_agent_sink"
PRIVATE = "/run/cleanops-b1-private"

PROBE = r"""
(async () => {
  const root = "http://127.0.0.1:3000";
  const r = await fetch(root + "/login", {signal: AbortSignal.timeout(3000)});
  if (r.status !== 200 || !(r.headers.get("content-type") || "").includes("text/html"))
    throw Error("HTML_FAIL");
  const html = await r.text();
  const refs = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g),
    x => x[1].replaceAll("&amp;", "&")).filter(x => x.includes("/_next/static/"));
  const prefix = "/b1-static/_next/static/";
  if (refs.some(x => !x.includes(prefix))) throw Error("MIXED_REFS");
  for (const [kind, ext] of [["CSS",".css"],["JS",".js"]]) {
    const url = refs.find(x => x.split("?")[0].endsWith(ext));
    if (!url) throw Error(kind + "_MISSING");
    const parsed = new URL(url, root);
    const upstream = parsed.pathname.replace(/^\/b1-static(?=\/_next\/static\/)/, "") + parsed.search;
    const resource = await fetch(root + upstream, {signal: AbortSignal.timeout(3000)});
    const type = resource.headers.get("content-type") || "";
    if (resource.status !== 200 ||
        (kind === "CSS" ? !type.includes("text/css") : !/javascript|ecmascript/.test(type)))
      throw Error(kind + "_FAIL");
  }
  console.log("B1_CANARY_HTML=PASS");
  console.log("B1_CANARY_CSS=PASS");
  console.log("B1_CANARY_JS=PASS");
  console.log("B1_CANARY_REF_MIX=ZERO");
})().catch(() => process.exit(7));
"""

def run(args, timeout=45, *, check=True):
    p = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    if check and p.returncode:
        raise RuntimeError("OPERACION_DOCKER_FALLIDA")
    return p

def inspect(kind, name):
    p = run(["docker", kind, "inspect", name], timeout=15)
    return json.loads(p.stdout)[0]

def current(name):
    c = inspect("container", name)
    if c.get("State", {}).get("Status") != "running":
        raise RuntimeError("CONTENEDOR_ORIGINAL_NO_RUNNING")
    return c

def fingerprint(name):
    c = current(name)
    return (c["Id"], c["Image"], c["State"]["Status"])

def resources():
    with open("/proc/meminfo", encoding="utf-8") as f:
        rows = dict(line.split(":", 1) for line in f if ":" in line)
    available = int(rows["MemAvailable"].split()[0])  # KiB
    if available < 1536 * 1024 or shutil.disk_usage("/var/lib/docker").free < 2 * 1024**3:
        raise RuntimeError("RECURSOS_INSUFICIENTES")

def preflight():
    if os.geteuid() != 0:
        raise RuntimeError("REQUIERE_ROOT")
    if DIRECTORY.exists():
        raise RuntimeError("CANARY_YA_PREPARADO")
    if run(["docker", "container", "inspect", NEW], check=False).returncode == 0:
        raise RuntimeError("CANARY_EXISTENTE_NO_DUPLICAR")
    i = inspect("image", IMAGE)
    if i.get("Id") != EXPECTED_IMAGE or \
       (i.get("Config", {}).get("Labels") or {}).get("org.opencontainers.image.revision") != EXPECTED_SOURCE:
        raise RuntimeError("IMAGEN_NO_COINCIDE")
    old = current(OLD)
    if old["Image"] != EXPECTED_OLD_IMAGE:
        raise RuntimeError("SHADOW_ORIGINAL_CAMBIO")
    for n in [WEB, PG]:
        current(n)
    mounts = old.get("Mounts", [])
    by_dest = {m["Destination"]: m for m in mounts}
    prv = by_dest.get(PRIVATE)
    sink = by_dest.get("/run/cleanops-agent")
    if (len(mounts) != 2 or not prv or not sink or
        prv.get("Type") != "bind" or prv.get("Source") != PRIVATE or prv.get("RW") is not False or
        sink.get("Type") != "volume" or sink.get("Name") != SINK or sink.get("RW") is not False):
        raise RuntimeError("CUSTODIA_MONTADA_INESPERADA")
    info = Path(PRIVATE).stat()
    if info.st_uid != 0 or info.st_gid != 999 or stat.S_IMODE(info.st_mode) != 0o750:
        raise RuntimeError("CUSTODIA_METADATOS")
    networks = old.get("NetworkSettings", {}).get("Networks") or {}
    if "dokploy-network" not in networks or len(networks) < 2:
        raise RuntimeError("REDES_INESPERADAS")
    env = dict(v.split("=",1) for v in old.get("Config", {}).get("Env",[]) if "=" in v)
    origin = env.get("CLEANOPS_AUTH_ORIGIN")
    internal = env.get("CLEANOPS_AUTH_INTERNAL_ORIGINS")
    if origin != "https://cleanops.nuvurent.com" or not internal:
        raise RuntimeError("ORIGEN_INESPERADO")
    if not (isinstance(json.loads(internal), list)):
        raise RuntimeError("ORIGEN_INTERNO_INVALIDO")
    resources()
    return sorted(networks), {"NODE_ENV":"production",
        "NEXT_TELEMETRY_DISABLED":"1",
        "CLEANOPS_AUTH_ORIGIN":origin,
        "CLEANOPS_AUTH_INTERNAL_ORIGINS":internal,
        "CLEANOPS_B1_ASSET_PREFIX":"/b1-static"}

def create(networks, env):
    DIRECTORY.mkdir(mode=0o700)
    aliases = {n: "net" + str(i) for i,n in enumerate(networks)}
    services = {aliases[n]: {"aliases":["cleanops-b1-assets"]} if n=="dokploy-network" else {}
                for n in networks}
    compose = {
        "name":PROJECT,
        "services":{"b1-assets":{
            "container_name":NEW, "image":IMAGE, "pull_policy":"never",
            "restart":"no", "init":True,"user":"999:999",
            "read_only":True, "cap_drop":["ALL"],
            "security_opt":["no-new-privileges:true"],
            "pids_limit":128, "mem_limit":"768m","cpus":0.65,
            "tmpfs":["/tmp:rw,nosuid,nodev,size=64m"],
            "environment":env,
            "volumes":[
                {"type":"bind","source":PRIVATE,"target":PRIVATE,
                 "read_only":True,"bind":{"create_host_path":False}},
                {"type":"volume","source":"agent_sink","target":"/run/cleanops-agent",
                 "read_only":True,"volume":{"nocopy":True}}],
            "networks":services
        }},
        "networks":{aliases[n]:{"external":True,"name":n} for n in networks},
        "volumes":{"agent_sink":{"external":True,"name":SINK}}}
    with os.fdopen(os.open(COMPOSE,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600),"w") as fd:
        json.dump(compose,fd,sort_keys=True)
        fd.flush();os.fsync(fd.fileno())
    run(["docker","compose","-f",str(COMPOSE),"-p",PROJECT,
         "create","--no-build","--no-recreate","--pull","never","b1-assets"],timeout=90)
    c = inspect("container",NEW)
    if c.get("Image") != EXPECTED_IMAGE or c.get("State",{}).get("Status") != "created" or \
       (c.get("Config",{}).get("Labels") or {}).get("com.docker.compose.project") != PROJECT:
        raise RuntimeError("CANARY_CREADO_NO_COINCIDE")
    run(["docker","start",NEW],timeout=30)
    if current(NEW).get("Image") != EXPECTED_IMAGE:
        raise RuntimeError("CANARY_IMAGEN_CAMBIO")
    for _ in range(40):
        p = run(["docker","exec","-i",NEW,"node","-e",PROBE],timeout=12,check=False)
        if p.returncode == 0 and all(x in p.stdout for x in [
            "B1_CANARY_HTML=PASS","B1_CANARY_CSS=PASS",
            "B1_CANARY_JS=PASS","B1_CANARY_REF_MIX=ZERO"]):
            for line in p.stdout.splitlines():
                if line.startswith("B1_CANARY_"): print(line,flush=True)
            return
        if inspect("container",NEW).get("State",{}).get("Status") != "running":
            raise RuntimeError("CANARY_DETUVO")
        time.sleep(1)
    raise RuntimeError("CANARY_NO_SUPERO_SMOKE")

def safe_remove():
    p=run(["docker","container","inspect",NEW],check=False)
    if p.returncode == 0:
        c=json.loads(p.stdout)[0]
        if c.get("Image")!=EXPECTED_IMAGE or \
           (c.get("Config",{}).get("Labels") or {}).get("com.docker.compose.project") != PROJECT:
            raise RuntimeError("CANARY_PROPIEDAD_NO_COINCIDE")
        # refuse to remove a routed service: protected principal B1 remains unchanged.
        r=run(["docker","exec","dokploy-traefik","wget","-qO-",
               "http://127.0.0.1:8080/api/http/routers"],check=False,timeout=12)
        if r.returncode != 0:
            raise RuntimeError("ROUTERS_NO_VERIFICABLES")
        live=json.loads(r.stdout)
        if any(v.get("status")=="enabled" and "b1-assets" in v.get("service","")
               for v in live):
            raise RuntimeError("CANARY_EN_USO_POR_ROUTER")
        run(["docker","rm","-f",NEW],timeout=30)
    if DIRECTORY.exists():
        if COMPOSE.is_file(): COMPOSE.unlink()
        DIRECTORY.rmdir()

def main():
    os.umask(0o077)
    action=sys.argv[1] if len(sys.argv)==2 else ""
    try:
        if action=="stage":
            snapshots={n:fingerprint(n) for n in [OLD,WEB,PG]}
            networks,env=preflight()
            try:
                create(networks,env)
                if {n:fingerprint(n) for n in snapshots} != snapshots:
                    raise RuntimeError("CONTENEDORES_ORIGINALES_CAMBIARON")
            except Exception:
                safe_remove()
                raise
            print("B1_CANARY=PREPARADO_PRIVADO_SIN_ROUTER")
            print("B1_ORIGINALES=INTACTOS")
        elif action=="rollback":
            if os.geteuid()!=0:raise RuntimeError("REQUIERE_ROOT")
            safe_remove()
            print("B1_CANARY=RETIRADO")
        else:
            raise RuntimeError("USO_STAGE_O_ROLLBACK")
    except Exception as e:
        print("B1_STOP="+str(e))
        sys.exit(1)
    finally:
        print("B1_ROUTERS=NO_MODIFICADOS")
        print("B1_SQL_GATE=NO_MODIFICADO")
        print("B1_SECRETOS=NO_IMPRESOS")
if __name__=="__main__":
    main()
