#!/usr/bin/env python3
"""Offline planner for the Dokploy STANDALONE Traefik container upgrade (never Swarm `service update`).

This tool NEVER talks to Docker, the VPS or the network. It reads JSON that the operator captured with
`docker inspect` and writes reviewed shell scripts that the operator may run later. Everything unexpected
fails closed: the generated container must be exactly what Dokploy creates (initializeStandaloneTraefik),
with only the image changed.

  plan   --container C.json --image I.json --network N.json... --target-version 3.7.17 --target-digest sha256:... --out DIR
  compare --spec DIR/spec.json --inspect after.json [--image new-image.json]
  routers-diff BEFORE.json AFTER.json
  scan-canary-log LOG
  api-check VERSION
"""
import argparse, json, os, re, shlex, stat, sys
from pathlib import Path

CONTAINER = 'dokploy-traefik'
EXPECTED_SOURCE_VERSION = '3.6.7'          # inventory confirmed by the owner on 2026-11-03
EXPECTED_NETWORKS = ('dokploy-network', 'supabase-supabase-2bvnab')
PRIMARY_NETWORK = 'dokploy-network'        # the one Dokploy attaches at creation time
EXPECTED_PORTS = {'80/tcp': '80', '443/tcp': '443', '443/udp': '443'}
MIN_TARGET = (3, 7, 17)                    # first 3.7.x with every fix listed in the runbook; 3.6 is out of security support
MAX_TARGET_EXCLUSIVE = (3, 8, 0)
MIN_DOCKER_API = (1, 40)                   # Traefik >= v3.6.16 Docker provider requirement
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')
# HostConfig fields that must keep Docker defaults (Dokploy sets none of them).
DEFAULT_HOSTCONFIG = {'Privileged': False, 'ReadonlyRootfs': False, 'PublishAllPorts': False, 'AutoRemove': False,
                      'CapAdd': None, 'CapDrop': None, 'SecurityOpt': None, 'ExtraHosts': None, 'Dns': None,
                      'Devices': None, 'Sysctls': None, 'Tmpfs': None, 'Init': None, 'UsernsMode': '', 'PidMode': '',
                      'UTSMode': '', 'Memory': 0, 'NanoCpus': 0, 'CpuShares': 0, 'PidsLimit': None}


class Refused(Exception):
    pass


def refuse(msg):
    raise Refused(msg)


def load(path):
    data = json.loads(Path(path).read_text())
    return data[0] if isinstance(data, list) else data


def version_tuple(v):
    m = re.fullmatch(r'v?(\d+)\.(\d+)\.(\d+)', v)
    if not m:
        refuse(f'not a plain release version: {v!r} (no latest/rc/branch tags)')
    return tuple(int(x) for x in m.groups())


def check_target(version, digest):
    t = version_tuple(version)
    if not (MIN_TARGET <= t < MAX_TARGET_EXCLUSIVE):
        refuse(f'target {version} outside the approved 3.7.x range >= {".".join(map(str, MIN_TARGET))}')
    if not DIGEST.match(digest or ''):
        refuse('target digest must be the sha256 index digest recorded from the registry by a human, never inferred')
    return t


def hostport(binding):
    ip = binding.get('HostIp') or ''
    if ip not in ('', '0.0.0.0', '::'):
        refuse(f'host IP bound explicitly ({ip}); the inventory has none')
    return binding.get('HostPort')


def normalize(c, image):
    """The preserved, comparable shape of the container. Only values (never secrets) are kept."""
    cfg, host = c['Config'], c['HostConfig']
    name = c['Name'].lstrip('/')
    if name != CONTAINER:
        refuse(f'container name {name!r} != {CONTAINER}')
    if host.get('RestartPolicy', {}).get('Name') != 'always':
        refuse('restart policy is not "always"')
    ports = {}
    for key, binds in (host.get('PortBindings') or {}).items():
        if not binds or len(binds) != 1:
            refuse(f'port {key} has {len(binds or [])} bindings')
        ports[key] = hostport(binds[0])
    if ports != EXPECTED_PORTS:
        refuse(f'published ports differ from inventory: {sorted(ports.items())}')
    mounts = sorted([m['Type'], m['Source'], m['Destination'], bool(m['RW'])] for m in c['Mounts'])
    if len(mounts) != 3 or any(m[0] != 'bind' for m in mounts):
        refuse('expected exactly three bind mounts')
    byDest = {m[2]: m for m in mounts}
    if set(byDest) != {'/etc/traefik/traefik.yml', '/etc/dokploy/traefik/dynamic', '/var/run/docker.sock'}:
        refuse(f'unexpected mount destinations: {sorted(byDest)}')
    if not byDest['/etc/traefik/traefik.yml'][3] or not byDest['/etc/dokploy/traefik/dynamic'][3]:
        refuse('configuration mounts must be read-write exactly as Dokploy creates them')
    if byDest['/var/run/docker.sock'][1] != '/var/run/docker.sock':
        refuse('docker socket mount source differs')
    # Docker reports the socket as RW unless :ro was requested; the owner confirmed it is read-only.
    if byDest['/var/run/docker.sock'][3]:
        refuse('inventory says the Docker socket is read-only but the container mounts it read-write; resolve before changing anything')
    nets = c['NetworkSettings']['Networks']
    if set(nets) != set(EXPECTED_NETWORKS):
        refuse(f'networks differ from inventory: {sorted(nets)}')
    aliases = {}
    for n, e in nets.items():
        if (e.get('IPAMConfig') or {}) and any((e['IPAMConfig'] or {}).values()):
            refuse(f'static IP configuration on {n} is not supported by this procedure')
        extra = sorted(a for a in (e.get('Aliases') or []) if a != name and not c['Id'].startswith(a))
        aliases[n] = extra
    if any(aliases.values()):
        refuse(f'custom network aliases present {aliases}; not part of the inventory')
    if cfg.get('Cmd') != image['Config'].get('Cmd') or cfg.get('Entrypoint') != image['Config'].get('Entrypoint'):
        refuse('command/entrypoint differ from the image defaults: the inventory says there are no explicit flags')
    image_env = set(image['Config'].get('Env') or [])
    extra_env = sorted(e.split('=', 1)[0] for e in (cfg.get('Env') or []) if e not in image_env)
    if extra_env:
        refuse(f'extra environment variables present (names only): {extra_env}; decide explicitly, nothing is copied automatically')
    image_labels = image['Config'].get('Labels') or {}
    extra_labels = sorted(k for k, v in (cfg.get('Labels') or {}).items() if image_labels.get(k) != v)
    if extra_labels:
        refuse(f'extra labels present: {extra_labels}')
    for key, expected in DEFAULT_HOSTCONFIG.items():
        have = host.get(key)
        if have in (None, '', [], {}, False, 0) and expected in (None, '', [], {}, False, 0):
            continue
        if have != expected:
            refuse(f'HostConfig.{key} = {have!r} is not the Docker default')
    if (cfg.get('User') or '') != (image['Config'].get('User') or '') or (cfg.get('WorkingDir') or '') != (image['Config'].get('WorkingDir') or ''):
        refuse('User/WorkingDir overrides present')
    log = host.get('LogConfig') or {}
    if log.get('Config'):
        refuse('custom log driver options present')
    return {'name': name, 'restart': 'always', 'ports': ports, 'mounts': mounts, 'networks': sorted(nets),
            'primaryNetwork': PRIMARY_NETWORK, 'logDriver': log.get('Type', 'json-file'),
            'backupPaths': sorted(m[1] for m in mounts if m[2] != '/var/run/docker.sock')}


def image_version(c):
    m = re.search(r':v?(\d+\.\d+\.\d+)(?:@|$)', c['Config'].get('Image', ''))
    return m.group(1) if m else None


def q(s):
    return shlex.quote(str(s))


def create_args(spec, new_ref):
    out = ['docker', 'create', '--name', q(spec['name']), '--restart', 'always', '--network', q(spec['primaryNetwork'])]
    for key, host_port in sorted(spec['ports'].items()):
        cport, proto = key.split('/')
        out += ['-p', q(f'{host_port}:{cport}/{proto}')]
    for typ, src, dst, rw in spec['mounts']:
        # --mount (unlike -v) refuses to create a missing host path.
        out += ['--mount', q(f'type=bind,source={src},target={dst}' + ('' if rw else ',readonly'))]
    out.append(q(new_ref))
    return ' '.join(out)


HEADER = '''#!/usr/bin/env bash
# GENERATED by scripts/traefik-standalone-upgrade.py -- review before running. Docker CLI only: the Swarm service API is never used for Traefik.
set -Eeuo pipefail
umask 077
export LC_ALL=C
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TOOL="${B1_TRAEFIK_TOOL:-$HERE/traefik-standalone-upgrade.py}"
STATE=${B1_TRAEFIK_STATE_DIR:?set B1_TRAEFIK_STATE_DIR to an absolute 0700 directory owned by the operator (root) outside the repository}
[[ $STATE == /* ]] || { echo "state dir must be absolute" >&2; exit 2; }
[[ -d $STATE && ! -L $STATE ]] || { echo "state dir missing or symlink" >&2; exit 2; }
[[ $(stat -c '%a %u' "$STATE") == "700 $(id -u)" ]] || { echo "state dir must be mode 700 and owned by the user running this script (root on the VPS)" >&2; exit 2; }
'''


def common(spec):
    return (f'OLD={q(spec["name"])}\nOLD_ID={q(spec["containerId"])}\nOLD_IMAGE_ID={q(spec["imageId"])}\n'
            f'NEW_REF={q(spec["newRef"])}\nNEW_DIGEST={q(spec["targetDigest"])}\nTARGET={q(spec["targetVersion"])}\n')


def script_prepare(spec):
    return HEADER + common(spec) + f'''
actual=$(docker inspect --format '{{{{.Id}}}}' "$OLD")
[[ $actual == "$OLD_ID" ]] || {{ echo "INVENTORY DRIFT: container id changed; regenerate the plan" >&2; exit 3; }}
api=$(docker version --format '{{{{.Server.APIVersion}}}}')
python3 -I "$TOOL" api-check "$api"
avail=$(df --output=avail -k "$STATE" | tail -1 | tr -d ' ')
(( avail > 262144 )) || {{ echo "less than 256 MiB free in state dir" >&2; exit 3; }}
docker inspect "$OLD" > "$STATE/before.inspect.json"
docker image inspect "$OLD_IMAGE_ID" > "$STATE/before.image.json"
chmod 600 "$STATE"/before.*.json
python3 -I "$TOOL" compare --spec "$HERE/spec.json" --inspect "$STATE/before.inspect.json" --image "$STATE/before.image.json" --mode before
# Private backup. acme.json and certificates live here: never print, copy elsewhere or commit it.
paths=({" ".join(q(p.lstrip("/")) for p in spec["backupPaths"])})
tar --numeric-owner --xattrs --acls -cpf "$STATE/traefik-config.tar" -C / "${{paths[@]}}"
chmod 600 "$STATE/traefik-config.tar"
(cd "$STATE" && sha256sum traefik-config.tar > traefik-config.tar.sha256)
tar -tf "$STATE/traefik-config.tar" >/dev/null
# Router baseline from the running Traefik (loopback API inside the container; port 8080 is not published).
docker exec "$OLD" wget -qO- http://127.0.0.1:8080/api/http/routers > "$STATE/routers.before.json" || {{ echo "WARN: router API unavailable; baseline must come from smoke checks only" >&2; : > "$STATE/routers.before.json"; }}
chmod 600 "$STATE/routers.before.json"
docker pull "$NEW_REF"
docker image inspect "$NEW_REF" > "$STATE/new.image.json"
python3 -I "$TOOL" compare --spec "$HERE/spec.json" --image "$STATE/new.image.json" --mode image
# Canary: parse the REAL configuration with the new binary; no network, no published ports, no Docker socket.
set +e
timeout 20 docker run --rm --name "$OLD-canary" --network none --read-only --cap-drop ALL \\
  --security-opt no-new-privileges --pids-limit 256 --memory 256m \\
  --mount type=bind,source={q(next(m[1] for m in spec["mounts"] if m[2] == "/etc/traefik/traefik.yml"))},target=/etc/traefik/traefik.yml,readonly \\
  --mount type=bind,source={q(next(m[1] for m in spec["mounts"] if m[2] == "/etc/dokploy/traefik/dynamic"))},target=/etc/dokploy/traefik/dynamic,readonly \\
  "$NEW_REF" > "$STATE/canary.log" 2>&1
set -e
chmod 600 "$STATE/canary.log"
python3 -I "$TOOL" scan-canary-log "$STATE/canary.log"
date -u +%FT%TZ > "$STATE/prepared.ok"
echo "PREPARE OK. Nothing was changed on the running Traefik."
'''


def script_verify(spec):
    return HEADER + common(spec) + f'''
# Read-only. Usage: 03-verify.sh <container-name> (default {spec["name"]})
NAME=${{1:-$OLD}}
docker inspect "$NAME" > "$STATE/after.inspect.json"
chmod 600 "$STATE/after.inspect.json"
MODE=${{B1_TRAEFIK_VERIFY_MODE:-after}}
IMG="$STATE/new.image.json"; [[ $MODE == before ]] && IMG="$STATE/before.image.json"
python3 -I "$TOOL" compare --spec "$HERE/spec.json" --inspect "$STATE/after.inspect.json" --image "$IMG" --mode "$MODE"
if [[ -s $STATE/routers.before.json ]]; then
  docker exec "$NAME" wget -qO- http://127.0.0.1:8080/api/http/routers > "$STATE/routers.after.json"
  python3 -I "$TOOL" routers-diff "$STATE/routers.before.json" "$STATE/routers.after.json"
fi
[[ -s $STATE/smoke.tsv ]] || {{ echo "missing $STATE/smoke.tsv (host<TAB>path<TAB>expected status)" >&2; exit 4; }}
while IFS=$'\\t' read -r host path want; do
  [[ -z ${{host:-}} || $host == \\#* ]] && continue
  got=$(curl -sS -o /dev/null -w '%{{http_code}}' --max-time 15 --resolve "$host:443:127.0.0.1" "https://$host$path" || echo 000)
  [[ $got == "$want" ]] || {{ echo "SMOKE FAIL $host$path got $got want $want" >&2; exit 5; }}
done < "$STATE/smoke.tsv"
echo "VERIFY OK ($NAME)"
'''


def script_rollback(spec):
    return HEADER + common(spec) + f'''
[[ -s $STATE/switch.state ]] || {{ echo "no switch.state: nothing to roll back" >&2; exit 2; }}
source "$STATE/switch.state"      # STAMP, PREV, PHASE (last phase reached by 02-switch.sh)
echo "rollback: last recorded phase = ${{PHASE:-unknown}}" >&2
# The ERR trap is armed BEFORE stop/update/rename, so the original may still be named "$OLD" (stop, update or
# rename failed), or already be "$PREV". Recover from the effective state, identifying the original by its Id.
current=$(docker inspect --format '{{{{.Name}}}}' "$OLD_ID") || {{ echo "ORIGINAL CONTAINER $OLD_ID NOT FOUND: manual recovery required, nothing was deleted" >&2; exit 6; }}
current=${{current#/}}
# A candidate (different Id) may hold the production name only after a later phase: move it aside, never delete it.
holder=$(docker inspect --format '{{{{.Id}}}}' "$OLD" 2>/dev/null || true)
if [[ -n $holder && $holder != "$OLD_ID" ]]; then
  docker stop -t 10 "$holder" || true
  docker rename "$holder" "$OLD-failed-$STAMP"
  docker update --restart=no "$OLD-failed-$STAMP"
fi
[[ $current == "$OLD" ]] || docker rename "$OLD_ID" "$OLD"
docker update --restart=always "$OLD_ID"
docker start "$OLD_ID"           # no-op when it never stopped
# Configuration is never rewritten automatically (Dokploy may have written valid changes since). Report drift only.
if ! (cd "$STATE" && sha256sum --status -c traefik-config.tar.sha256); then echo "backup archive integrity FAILED" >&2; exit 6; fi
B1_TRAEFIK_VERIFY_MODE=before bash "$HERE/03-verify.sh" "$OLD"
echo "ROLLBACK OK. Original container $OLD_ID (image $OLD_IMAGE_ID) is $OLD again; any failed candidate is kept as $OLD-failed-$STAMP for analysis."
'''


def script_switch(spec):
    create = create_args(spec, spec['newRef'])
    connect = '\n'.join(f'docker network connect {q(n)} "$OLD"' for n in spec['networks'] if n != spec['primaryNetwork'])
    return HEADER + common(spec) + f'''
: "${{B1_TRAEFIK_APPROVAL_REF:?owner approval reference required (ticket/commit of the written authorization)}}"
[[ $B1_TRAEFIK_APPROVAL_REF =~ ^[A-Za-z0-9._:/-]{{6,120}}$ ]] || {{ echo "invalid approval reference" >&2; exit 2; }}
[[ ${{B1_TRAEFIK_VERSION_GUARD_ACK:-}} == "yes" ]] || {{ echo "ACK required: Dokploy TRAEFIK_VERSION must be aligned to $TARGET first, or any panel-triggered recreate silently reverts Traefik to Dokploy's default" >&2; exit 2; }}
[[ -s $STATE/prepared.ok ]] || {{ echo "run 01-prepare.sh first" >&2; exit 2; }}
[[ $(docker inspect --format '{{{{.Id}}}}' "$OLD") == "$OLD_ID" ]] || {{ echo "INVENTORY DRIFT since prepare" >&2; exit 3; }}
STAMP=$(date -u +%Y%m%dT%H%M%SZ); PREV="$OLD-prev-$STAMP"
printf 'STAMP=%s\\nPREV=%s\\nAPPROVAL=%s\\n' "$STAMP" "$PREV" "$B1_TRAEFIK_APPROVAL_REF" > "$STATE/switch.state"
phase() {{ printf 'PHASE=%s\\n' "$1" >> "$STATE/switch.state"; }}
fail() {{ echo "SWITCH FAILED at line $1 (phase: $(sed -n 's/^PHASE=//p' "$STATE/switch.state" | tail -1)) -> automatic rollback" >&2; trap - ERR; bash "$HERE/rollback.sh" || echo "ROLLBACK ALSO FAILED: manual restore from $PREV required" >&2; exit 1; }}
trap 'fail $LINENO' ERR
# Downtime window starts: ports 80/443 are released by the stop.
phase stopping;         docker stop -t 30 "$OLD"
phase stopped;          docker update --restart=no "$OLD"
phase restart-disabled; docker rename "$OLD" "$PREV"
phase renamed;          {create}
phase created;          {connect}
phase networked;        docker start "$OLD"
phase started
for i in $(seq 1 30); do
  [[ $(docker inspect --format '{{{{.State.Running}}}} {{{{.RestartCount}}}}' "$OLD") == "true 0" ]] && ok=$((${{ok:-0}}+1)) || ok=0
  (( ok >= 5 )) && break
  sleep "${{B1_TRAEFIK_POLL_SECONDS:-2}}"
done
(( ${{ok:-0}} >= 5 )) || false
bash "$HERE/03-verify.sh" "$OLD"
phase verified
trap - ERR
echo "SWITCH OK. Previous container kept stopped as $PREV (restart=no). Do NOT delete it until the observation window ends."
'''


def cmd_plan(a):
    c, image = load(a.container), load(a.image)
    check_target(a.target_version, a.target_digest)
    src = image_version(c)
    if src != EXPECTED_SOURCE_VERSION:
        refuse(f'running image tag is {src!r}, inventory confirmed {EXPECTED_SOURCE_VERSION}')
    if c['Image'] != image['Id']:
        refuse('the supplied image JSON is not the image of this container')
    spec = normalize(c, image)
    nets = {load(p)['Name'] for p in a.network}
    if nets != set(EXPECTED_NETWORKS):
        refuse(f'network inspect files cover {sorted(nets)}')
    spec.update(containerId=c['Id'], imageId=c['Image'], sourceVersion=src, targetVersion=a.target_version,
                targetDigest=a.target_digest, newRef=f'traefik:v{a.target_version}@{a.target_digest}')
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / 'spec.json').write_text(json.dumps(spec, indent=2, sort_keys=True) + '\n')
    for name, body in (('01-prepare.sh', script_prepare(spec)), ('02-switch.sh', script_switch(spec)),
                       ('03-verify.sh', script_verify(spec)), ('rollback.sh', script_rollback(spec))):
        p = out / name; p.write_text(body); p.chmod(0o750)
    print(f'PLAN OK {src} -> {a.target_version}; scripts written to {out} (review them; nothing was executed)')


def cmd_compare(a):
    spec = json.loads(Path(a.spec).read_text())
    if a.mode == 'image':
        image = load(a.image)
        if not any(d.endswith('@' + spec['targetDigest']) for d in image.get('RepoDigests', [])):
            refuse('pulled image does not carry the approved digest')
        if image['Config'].get('Labels', {}).get('org.opencontainers.image.version', f'v{spec["targetVersion"]}') not in (f'v{spec["targetVersion"]}', spec['targetVersion']):
            refuse('image version label differs from the approved target')
        print('IMAGE OK'); return
    c = load(a.inspect)
    image = load(a.image) if a.image else None
    if image is None:
        refuse('--image is required for before/after comparisons')
    if a.mode == 'before':
        if normalize(c, image) != {k: spec[k] for k in ('name', 'restart', 'ports', 'mounts', 'networks', 'primaryNetwork', 'logDriver', 'backupPaths')} \
                or c['Id'] != spec['containerId'] or c['Image'] != spec['imageId']:
            refuse('running container no longer matches the plan')
        print('BEFORE MATCHES PLAN'); return
    # after: the new container must be the old one with ONLY the image (and ids) changed.
    state = c['State']
    if not state.get('Running') or state.get('Restarting') or c['RestartCount'] != 0:
        refuse('new container is not stably running')
    if c['Id'] == spec['containerId'] or c['Image'] == spec['imageId']:
        refuse('container/image id unchanged')
    if not c['Config'].get('Image', '').endswith('@' + spec['targetDigest']):
        refuse('container is not running the approved digest')
    now = normalize(c, image)       # image = the pulled NEW image: no extra env/labels/cmd/user may differ from its defaults
    want = {k: spec[k] for k in ('name', 'restart', 'ports', 'mounts', 'networks', 'primaryNetwork', 'logDriver', 'backupPaths')}
    if now != want:
        diff = sorted(k for k in want if now.get(k) != want[k])
        refuse(f'NOT PRESERVED: {diff}')
    print('AFTER PRESERVES PORTS/MOUNTS/NETWORKS/RESTART; image changed to the approved digest')


def routers(path):
    text = Path(path).read_text().strip()
    data = json.loads(text) if text else []
    return {r['name']: (r.get('rule'), tuple(r.get('entryPoints') or ()), r.get('service'), tuple(r.get('middlewares') or ()),
                        json.dumps(r.get('tls'), sort_keys=True), r.get('priority')) for r in data}


def cmd_routers(a):
    before, after = routers(a.before), routers(a.after)
    missing = sorted(set(before) - set(after)); changed = sorted(n for n in before if n in after and before[n] != after[n])
    if missing or changed:
        refuse(f'ROUTERS CHANGED missing={missing} changed={changed}')
    print(f'ROUTERS OK ({len(before)} preserved, {len(set(after) - set(before))} added)')


FATAL = re.compile(r'(command traefik error|error configuring|cannot unmarshal|field not found|yaml:|invalid (static )?configuration|unknown (field|flag)|"?level"?[=:]"?fatal|panic:|failed to (decode|load))', re.I)
EXPECTED_NOISE = re.compile(r'(docker|swarm|acme|letsencrypt|lego|dial unix|cannot connect to the docker daemon|no such host|network is unreachable|resolver)', re.I)


def cmd_scan(a):
    lines = Path(a.log).read_text(errors='replace').splitlines()
    fatal = [l for l in lines if FATAL.search(l)]
    errors = [l for l in lines if re.search(r'level=error|"level":"error"', l)]
    unexpected = [l for l in errors if not EXPECTED_NOISE.search(l)]
    if fatal or unexpected:
        for l in (fatal + unexpected)[:10]:
            print('CANARY:', l[:200], file=sys.stderr)
        refuse('canary found configuration errors the new version cannot start with')
    if not any('Configuration loaded from file' in l or 'Starting provider' in l or 'Starting Traefik' in l for l in lines):
        refuse('canary produced no startup evidence (image did not run?)')
    print(f'CANARY OK ({len(errors)} expected provider/ACME errors without a network or socket, 0 configuration errors)')


def cmd_api(a):
    m = re.fullmatch(r'(\d+)\.(\d+)', a.version)
    if not m or tuple(int(x) for x in m.groups()) < MIN_DOCKER_API:
        refuse(f'Docker API {a.version} < 1.40 required by the new Traefik Docker provider (set DOCKER_API_VERSION or upgrade the engine: human decision)')
    print(f'DOCKER API OK ({a.version})')


def main(argv=None):
    p = argparse.ArgumentParser(); sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('plan'); s.add_argument('--container', required=True); s.add_argument('--image', required=True)
    s.add_argument('--network', nargs='+', required=True); s.add_argument('--target-version', required=True)
    s.add_argument('--target-digest', required=True); s.add_argument('--out', required=True); s.set_defaults(f=cmd_plan)
    s = sub.add_parser('compare'); s.add_argument('--spec', required=True); s.add_argument('--inspect'); s.add_argument('--image')
    s.add_argument('--mode', choices=('before', 'after', 'image'), required=True); s.set_defaults(f=cmd_compare)
    s = sub.add_parser('routers-diff'); s.add_argument('before'); s.add_argument('after'); s.set_defaults(f=cmd_routers)
    s = sub.add_parser('scan-canary-log'); s.add_argument('log'); s.set_defaults(f=cmd_scan)
    s = sub.add_parser('api-check'); s.add_argument('version'); s.set_defaults(f=cmd_api)
    a = p.parse_args(argv)
    try:
        a.f(a)
    except Refused as e:
        print(f'REFUSED: {e}', file=sys.stderr); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
