#!/usr/bin/env python3
"""Build and smoke-test an isolated B1 static-asset candidate. NEVER deploys it."""
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

REPO = "/etc/dokploy/compose/cleanops360-f4fxmd/code"
SOURCE = "296d4ef2063e3c39eeffa0c4d14fd3deb92922d7"
TAG = "cleanops360-b1-assets-candidate:296d4ef2"
ORIGINAL = ("cleanops360-f4fxmd-web-1", "cleanops360-f4fxmd-postgres-1",
            "cleanops360-b1-shadow-cc51574a")
LOG = "/root/b1-ui-assets-build-20261105.log"

NODE_TEST = r"""
const { spawn } = require('node:child_process');
const base = 'http://127.0.0.1:3000';
const child = spawn(process.execPath, ['/app/node_modules/next/dist/bin/next', 'start',
  '-H', '127.0.0.1', '-p', '3000'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function run() {
  try {
    let html, ready = false;
    for (let i = 0; i < 42; i++) {
      if (child.exitCode !== null) throw Error('NEXT_STOP');
      try {
        const r = await fetch(base + '/login', { signal: AbortSignal.timeout(1500) });
        if (r.status === 200 && (r.headers.get('content-type') || '').includes('text/html')) {
          html = await r.text(); ready = true; break;
        }
      } catch { }
      await wait(500);
    }
    if (!ready) throw Error('HTML_UNAVAILABLE');
    console.log('B1_ASSET_HTML=PASS');
    const refs = Array.from(html.matchAll(/(?:href|src)="([^"]*\/b1-static\/_next\/static\/[^"]+)"/g),
      m => m[1].replaceAll('&amp;', '&'));
    const css = refs.find(v => /\.css(?:\?|$)/.test(v));
    const js = refs.find(v => /\.js(?:\?|$)/.test(v));
    if (!css || !js) throw Error('NAMESPACED_ASSETS_MISSING');
    for (const [kind, url] of [['CSS', css], ['JS', js]]) {
      const parsed = new URL(url, base);
      const upstream = parsed.pathname.replace(/^\/b1-static(?=\/_next\/static\/)/, '') + parsed.search;
      const r = await fetch(base + upstream, { signal: AbortSignal.timeout(5000) });
      const type = r.headers.get('content-type') || '';
      if (r.status !== 200 || (kind === 'CSS' ? !type.includes('text/css') :
         !(/javascript|ecmascript/.test(type)))) throw Error(kind + '_UNAVAILABLE');
      console.log('B1_ASSET_' + kind + '=PASS');
    }
    console.log('B1_ASSET_PREFIX=PASS');
  } catch {
    console.log('B1_ASSET_SMOKE=FAIL');
    process.exitCode = 2;
  } finally {
    child.kill('SIGTERM');
  }
}
run();
"""

def call(argv, *, stdin=None, timeout=20):
    return subprocess.run(argv, input=stdin, capture_output=True, timeout=timeout,
                          check=True, text=True).stdout.strip()

def versions():
    result = {}
    for name in ORIGINAL:
        a = json.loads(call(["docker", "inspect", name]))[0]
        result[name] = (a["Id"], a["Image"], a["State"]["Status"])
        if result[name][2] != "running":
            raise RuntimeError("CONTENEDOR_NO_EJECUTANDOSE")
    return result

def headroom():
    disk = shutil.disk_usage("/var/lib/docker")
    with open("/proc/meminfo", encoding="utf-8") as f:
        mem = {k.rstrip(":"): int(v.split()[0]) for row in f
               if (v := row.split(maxsplit=1)[1]) and (k := row.split(maxsplit=1)[0])}
    return mem.get("MemAvailable", 0) >= 4608 * 1024 and disk.free >= 8 * 1024**3

def build():
    exists = subprocess.run(["docker", "image", "inspect", TAG],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if exists:
        info = json.loads(call(["docker", "image", "inspect", TAG]))[0]
        if info.get("Config", {}).get("Labels", {}).get("org.opencontainers.image.revision") != SOURCE:
            raise RuntimeError("IMAGEN_EXISTENTE_INCOMPATIBLE")
        print("B1_BUILD=IMAGEN_PREVIA_REVISADA", flush=True)
        return
    if not headroom():
        raise RuntimeError("RECURSOS_INSUFICIENTES")
    with tempfile.TemporaryDirectory(prefix="b1-assets-", dir="/tmp") as tmp:
        archive = subprocess.run(["git", "-C", REPO, "archive", "--format=tar", SOURCE],
                                 capture_output=True, check=True, timeout=30).stdout
        with tempfile.TemporaryFile() as tar:
            tar.write(archive); tar.seek(0)
            with tarfile.open(fileobj=tar, mode="r:") as reader:
                # The source is a pinned Git commit, not an untrusted user archive.
                reader.extractall(tmp, filter="data")
        print("B1_BUILD=INICIADO", flush=True)
        with open(LOG, "w", encoding="utf-8") as logs:
            proc = subprocess.run(
                ["docker", "build", "--pull=false", "--tag", TAG, "--label",
                 "org.opencontainers.image.revision=" + SOURCE,
                 "--build-arg", "CLEANOPS_B1_ASSET_PREFIX=/b1-static",
                 "--file", "deploy/staging/Dockerfile", "."],
                cwd=tmp, stdout=logs, stderr=subprocess.STDOUT, timeout=1200)
        if proc.returncode != 0:
            raise RuntimeError("COMPILACION_FALLIDA")
    print("B1_BUILD=PASS", flush=True)

def smoke():
    args = [
        "docker", "run", "--rm", "--network", "none", "--read-only",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--user", "999:999", "--pids-limit", "128", "--memory", "768m",
        "--cpus", "0.65", "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m",
        "--env", "CLEANOPS_AUTH_ORIGIN=https://cleanops.nuvurent.com",
        "--env", 'CLEANOPS_AUTH_INTERNAL_ORIGINS=["http://127.0.0.1:3000"]',
        "--entrypoint", "node", TAG, "-e", NODE_TEST
    ]
    p = subprocess.run(args, text=True, capture_output=True, timeout=85)
    # Only the controlled PASS/FAIL keys generated by the isolated smoke are echoed.
    lines = [v for v in p.stdout.splitlines() if v in (
        "B1_ASSET_HTML=PASS", "B1_ASSET_CSS=PASS",
        "B1_ASSET_JS=PASS", "B1_ASSET_PREFIX=PASS", "B1_ASSET_SMOKE=FAIL")]
    for value in lines:
        print(value, flush=True)
    if p.returncode != 0 or "B1_ASSET_PREFIX=PASS" not in lines:
        raise RuntimeError("SMOKE_FALLIDO")

def main():
    os.umask(0o077)
    stage = "PRECHECK"
    before = None
    try:
        if os.geteuid() != 0:
            raise RuntimeError("REQUIERE_ROOT")
        if call(["git", "-C", REPO, "rev-parse", "--verify", SOURCE + "^{commit}"]) != SOURCE:
            raise RuntimeError("COMMIT_NO_DISPONIBLE")
        before = versions()
        stage = "BUILD"
        build()
        stage = "SMOKE"
        smoke()
        stage = "FIN"
        if versions() != before:
            raise RuntimeError("CONTENEDORES_CAMBIARON")
        print("B1_CANDIDATO=LISTO_SOLO_PARA_REVISION")
    except Exception as e:
        print("B1_ETAPA=" + stage)
        print("B1_RESULTADO=" + str(e))
    finally:
        print("B1_DESPLIEGUE=NINGUNO")
        print("B1_ROUTERS=NO_MODIFICADOS")
        print("B1_SECRETOS=NO_IMPRESOS")

if __name__ == "__main__":
    main()
