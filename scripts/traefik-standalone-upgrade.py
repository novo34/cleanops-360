#!/usr/bin/env python3
"""Offline planner for the Dokploy STANDALONE Traefik container upgrade (never Swarm `service update`).

This tool NEVER talks to Docker, the VPS or the network. It reads JSON that the operator captured with
`docker inspect` and writes reviewed shell scripts that the operator may run later. Everything unexpected
fails closed: the generated container must be exactly what Dokploy creates (initializeStandaloneTraefik),
with only the image changed.

  plan   --container C.json --image I.json --network N.json... --target-version 3.7.17 --target-digest sha256:... --out DIR
  compare --spec DIR/spec.json --inspect after.json [--image new-image.json]
  log-args --spec DIR/spec.json --inspect before.inspect.json   (NUL-separated --log-driver/--log-opt tokens; values never printed to a terminal)
  routers-diff BEFORE.json AFTER.json
  ip-check NETWORK_INSPECT.json IPV4 [--ignore-container ID]   (exit 0 only when no container/task holds the address)
  scan-canary-log LOG
  api-check VERSION
"""
import argparse, hashlib, ipaddress, json, os, re, shlex, stat, sys
from pathlib import Path

CONTAINER = 'dokploy-traefik'
EXPECTED_SOURCE_VERSION = '3.6.7'          # inventory confirmed by the owner on 2026-11-03
PRIMARY_NETWORK = 'dokploy-network'        # the one Dokploy attaches at creation time
EXPECTED_PORTS = {'80/tcp': '80', '443/tcp': '443', '443/udp': '443'}
MIN_TARGET = (3, 7, 17)                    # first 3.7.x with every fix listed in the runbook; 3.6 is out of security support
MAX_TARGET_EXCLUSIVE = (3, 8, 0)
MIN_DOCKER_API = (1, 40)                   # Traefik >= v3.6.16 Docker provider requirement
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')
ALIAS = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$')
NETNAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,126}$')
LOG_DRIVERS = ('json-file', 'local', 'journald', 'syslog', 'gelf', 'fluentd', 'splunk', 'awslogs', 'gcplogs', 'none')   # built-in drivers only
LOG_OPT_KEY = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
# Names this procedure itself gives to containers; Docker may leave them as stale aliases after `docker rename`.
TRANSIENT_NAME = re.compile(r'^' + re.escape('dokploy-traefik') + r'-(prev|failed|probe)-\d{8}T\d{6}Z$')
PROBE_NAME = TRANSIENT_NAME
# What the isolated pre-flight probe can prove. Ports, networks, the pinned address and aliases are NOT part of it on purpose:
# the probe must never compete with the operational Traefik for them (they are validated offline and in the switch window).
PROBE_KEYS = ('name', 'restart', 'mounts', 'log', 'inherited', 'backupPaths')
PRESERVED = ('name', 'restart', 'ports', 'mounts', 'networks', 'primaryNetwork', 'networkConfig', 'log', 'inherited', 'backupPaths')
SUPPORTED_DRIVERS = ('overlay', 'bridge')
# HostConfig fields that must keep Docker defaults (Dokploy sets none of them). Init/SecurityOpt/Ulimits/LogConfig are the
# ones a hardened daemon.json legitimately injects: they are preserved and VERIFIED on a pre-flight candidate (see inherited_settings).
DEFAULT_HOSTCONFIG = {'Privileged': False, 'ReadonlyRootfs': False, 'PublishAllPorts': False, 'AutoRemove': False,
                      'CapAdd': None, 'CapDrop': None, 'ExtraHosts': None, 'Dns': None,
                      'Devices': None, 'Sysctls': None, 'Tmpfs': None, 'UsernsMode': '', 'PidMode': '',
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


def network_config(c, name):
    """Per-network endpoint settings that must survive the upgrade. The address is read from the capture (never assumed):
    a pinned IPv4 is preserved exactly; a dynamic endpoint stays dynamic; custom aliases are preserved; anything else is refused."""
    running = bool((c.get('State') or {}).get('Running'))
    out = {}
    for n, e in sorted(c['NetworkSettings']['Networks'].items()):
        ipam = e.get('IPAMConfig') or {}
        unsupported = sorted(k for k, v in ipam.items() if k != 'IPv4Address' and v)
        if unsupported:
            refuse(f'unsupported endpoint IPAM settings on {n}: {unsupported} (only a pinned IPv4 address is supported)')
        static = ipam.get('IPv4Address') or None
        if static:
            try:
                ok = str(ipaddress.IPv4Address(static)) == static
            except ValueError:
                ok = False
            if not ok:
                refuse(f'pinned address on {n} is not a canonical IPv4 address')
            if running and e.get('IPAddress') != static:
                refuse(f'the running endpoint address on {n} differs from the pinned one: the capture is inconsistent')
        extra = sorted({a for a in (e.get('Aliases') or []) if a != name and not c['Id'].startswith(a) and not TRANSIENT_NAME.match(a)})
        bad = [a for a in extra if not ALIAS.match(a)]
        if bad:
            refuse(f'unsupported alias on {n}: {bad}')
        out[n] = {'staticIPv4': static, 'aliases': extra}
    return out


def check_networks(netcfg, docs):
    """Cross-check the pinned addresses with the captured network definitions (driver, scope, subnet)."""
    info = {}
    for d in docs:
        n, driver = d['Name'], d.get('Driver')
        if driver not in SUPPORTED_DRIVERS:
            refuse(f'network {n}: driver {driver!r} is not supported (overlay or bridge only)')
        if driver == 'overlay' and (d.get('Scope') != 'swarm' or not d.get('Attachable')):
            refuse(f'network {n}: an overlay network used by a standalone container must be swarm-scoped and attachable')
        subnets = [x['Subnet'] for x in ((d.get('IPAM') or {}).get('Config') or []) if x.get('Subnet') and ':' not in x['Subnet']]
        info[n] = {'driver': driver, 'scope': d.get('Scope'), 'subnets': subnets}
    for n, cfg in netcfg.items():
        ip = cfg['staticIPv4']
        if ip and not any(ipaddress.ip_address(ip) in ipaddress.ip_network(sub, strict=False) for sub in info[n]['subnets']):
            refuse(f'pinned address on {n} is outside the IPv4 subnets of that network ({info[n]["subnets"]})')
    return info


def read_log(host):
    """Validated (driver, options) of HostConfig.LogConfig. Errors name keys only, never option values (they may be credentials)."""
    lc = host.get('LogConfig') or {}
    typ, opts = lc.get('Type') or '', lc.get('Config') or {}
    if typ not in LOG_DRIVERS:
        refuse(f'log driver {typ!r} cannot be reproduced or verified (built-in drivers only: {", ".join(LOG_DRIVERS)})')
    if not isinstance(opts, dict):
        refuse('LogConfig.Config is not a map')
    for k, v in opts.items():
        if not isinstance(k, str) or not LOG_OPT_KEY.match(k):
            refuse(f'log option key {str(k)[:40]!r} is not reproducible')
        if not isinstance(v, str) or len(v) > 4096 or any(ord(ch) < 32 or ord(ch) == 127 for ch in v):
            refuse(f'value of log option {k!r} is not reproducible (non-string, too long or control characters); the value is not shown')
    return typ, opts


def log_summary(typ, opts):
    canonical = json.dumps({'type': typ, 'config': opts}, sort_keys=True, separators=(',', ':'))
    return {'driver': typ, 'optionKeys': sorted(opts), 'sha256': hashlib.sha256(canonical.encode()).hexdigest()}


def inherited_settings(host):
    """Settings a hardened daemon.json injects into every container. They are not copied as flags: the candidate is created by the
    same daemon and the pre-flight probe proves it ends up with the same values (otherwise nothing is switched)."""
    ulimits = sorted(({'Name': u.get('Name'), 'Soft': u.get('Soft'), 'Hard': u.get('Hard')} for u in (host.get('Ulimits') or [])), key=lambda u: str(u['Name']))
    return {'init': bool(host.get('Init')), 'securityOpt': sorted(host.get('SecurityOpt') or []), 'ulimits': ulimits}


def normalize(c, image, kind='live'):
    """The preserved, comparable shape of the container. Only values (never secrets) are kept."""
    cfg, host = c['Config'], c['HostConfig']
    name = c['Name'].lstrip('/')
    probe = kind == 'probe'      # the stopped pre-flight candidate: other name, restart=no (it must never start by itself)
    if name != CONTAINER and not (probe and PROBE_NAME.match(name) and '-probe-' in name):
        refuse(f'container name {name!r} != {CONTAINER}')
    restart = 'no' if probe else 'always'
    if (host.get('RestartPolicy') or {}).get('Name') not in ((restart, '') if restart == 'no' else (restart,)):
        refuse(f'restart policy is not "{restart}"')
    ports = {}
    if probe:
        if host.get('PortBindings'):
            refuse('the pre-flight candidate publishes ports: it must never compete for the operational ports')
    else:
        for key, binds in (host.get('PortBindings') or {}).items():
            if not binds or len(binds) != 1:
                refuse(f'port {key} has {len(binds or [])} bindings')
            ports[key] = hostport(binds[0])
        if ports != EXPECTED_PORTS:
            refuse(f'published ports differ from inventory: {sorted(ports.items())}')
    mounts = sorted([m['Type'], m['Source'], m['Destination'], bool(m['RW'])] for m in c['Mounts'])
    if len(mounts) != 3 or any(m[0] != 'bind' for m in mounts):
        refuse('expected exactly three bind mounts')
    for m in c['Mounts']:
        if (m.get('Propagation') or 'rprivate') != 'rprivate':
            refuse(f'mount {m["Destination"]}: propagation {m.get("Propagation")!r} cannot be reproduced')
        mode = m.get('Mode') or ''
        if mode not in ('', 'rw', 'ro') or (mode == 'ro' and m['RW']) or (mode == 'rw' and not m['RW']):
            refuse(f'mount {m["Destination"]}: mode {mode!r} is not reproducible or contradicts RW')
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
    mode = host.get('NetworkMode') or ''
    if probe:
        if mode != 'none' or set(nets) - {'none'}:
            refuse('the pre-flight candidate is attached to a network: it must have none, so it cannot take an endpoint or the pinned address')
        netcfg = {}
    else:
        if mode in ('host', 'none') or mode.startswith('container:'):
            refuse(f'network mode {mode.split(":")[0]!r} is not supported')
        if PRIMARY_NETWORK not in nets:
            refuse(f'{PRIMARY_NETWORK} is not attached')
        odd = sorted(n for n in nets if n in ('bridge', 'host', 'none') or not NETNAME.match(n))
        if odd:
            refuse(f'unsupported network attachments: {odd}')
        netcfg = network_config(c, name)
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
    log = log_summary(*read_log(host))
    return {'name': CONTAINER, 'restart': restart, 'ports': ports, 'mounts': mounts, 'networks': sorted(nets),
            'primaryNetwork': PRIMARY_NETWORK, 'networkConfig': netcfg, 'log': log,
            'inherited': inherited_settings(host), 'backupPaths': sorted(m[1] for m in mounts if m[2] != '/var/run/docker.sock')}


def image_version(c):
    m = re.search(r':v?(\d+\.\d+\.\d+)(?:@|$)', c['Config'].get('Image', ''))
    return m.group(1) if m else None


def q(s):
    return shlex.quote(str(s))


def create_args(spec, new_ref, name=None, restart='always', isolated=False):
    """`name` is an already-quoted shell expression (the pre-flight probe uses "$PROBE"). Log flags come from "${LOGARGS[@]}" which the
    scripts load from the private capture at run time, so option values never appear in the generated scripts or spec.json."""
    if isolated:
        # Pre-flight probe: NO network, NO published port, NO pinned address. It cannot take an endpoint, a port or the address of the
        # operational Traefik at any time (not even if someone started it), and no existing network is touched.
        out = ['docker', 'create', '--name', name or q(spec['name']), '--restart', restart, '--network', 'none']
    else:
        out = ['docker', 'create', '--name', name or q(spec['name']), '--restart', restart, '--network', q(spec['primaryNetwork'])]
        prim = spec['networkConfig'][spec['primaryNetwork']]
        if prim['staticIPv4']:
            out += ['--ip', q(prim['staticIPv4'])]
        for a in prim['aliases']:
            out += ['--network-alias', q(a)]
        for key, host_port in sorted(spec['ports'].items()):
            cport, proto = key.split('/')
            out += ['-p', q(f'{host_port}:{cport}/{proto}')]
    for typ, src, dst, rw in spec['mounts']:
        # --mount (unlike -v) refuses to create a missing host path.
        out += ['--mount', q(f'type=bind,source={src},target={dst}' + ('' if rw else ',readonly'))]
    out.append('"${LOGARGS[@]}"')
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


def connect_args(spec, n, target):
    cfg = spec['networkConfig'][n]
    flags = (['--ip', q(cfg['staticIPv4'])] if cfg['staticIPv4'] else []) + [x for a in cfg['aliases'] for x in ('--alias', q(a))]
    return ' '.join(['docker', 'network', 'connect', *flags, q(n), target])


def static_networks(spec):
    return [(n, spec['networkConfig'][n]['staticIPv4']) for n in spec['networks'] if spec['networkConfig'][n]['staticIPv4']]


NETFUNCS = '''
# A stopped container does NOT reliably give back a pinned address (swarm-scoped networks reserve it through the
# cluster): it is released explicitly with `docker network disconnect` and observed free before it is reused.
wait_free() {   # wait_free <network> <ipv4> [ip-check options]; bounded, true only when nothing holds the address
  local net=$1 ip=$2 i; shift 2
  for i in $(seq 1 "${B1_TRAEFIK_IP_WAIT_TRIES:-30}"); do
    { docker network inspect --verbose "$net" || docker network inspect "$net"; } > "$STATE/net.inspect.json" 2>/dev/null || true
    python3 -I "$TOOL" ip-check "$STATE/net.inspect.json" "$ip" "$@" && return 0
    sleep "${B1_TRAEFIK_POLL_SECONDS:-2}"
  done
  return 1
}
connected() {   # connected <container> <network>
  local nets; nets=$(docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$1")
  [[ " $nets" == *" $2 "* ]]
}
'''


def common(spec):
    return (f'OLD={q(spec["name"])}\nOLD_ID={q(spec["containerId"])}\nOLD_IMAGE_ID={q(spec["imageId"])}\n'
            f'NEW_REF={q(spec["newRef"])}\nNEW_DIGEST={q(spec["targetDigest"])}\nTARGET={q(spec["targetVersion"])}\n') + NETFUNCS


PROBE_TEMPLATE = '''# Pre-flight probe: created with the same image, mounts, log driver/options and restart policy (restart=no here) as 02-switch.sh will use,
# but ISOLATED: no network, no published port, no pinned address, never started. It therefore cannot compete with the running Traefik
# for its endpoints, ports or fixed IP, and no existing network is touched. Comparing it with the plan surfaces, BEFORE any downtime,
# what this daemon adds or inherits (log driver, init, security options, ulimits) and every option Docker would reject. Ports, networks,
# the pinned address and aliases are validated offline (plan) and in the switch window, not here. It is left stopped for you to
# remove after the change window (its name is in probe.name; deleting it is a decision for the owner).
python3 -I "$TOOL" log-args --spec "$HERE/spec.json" --inspect "$STATE/before.inspect.json" > "$STATE/log.args"
chmod 600 "$STATE/log.args"
mapfile -d '' -t LOGARGS < "$STATE/log.args"
PROBE="$OLD-probe-$(date -u +%Y%m%dT%H%M%SZ)"
@CREATE@
docker inspect "$PROBE" > "$STATE/probe.inspect.json"
chmod 600 "$STATE/probe.inspect.json"
python3 -I "$TOOL" compare --spec "$HERE/spec.json" --inspect "$STATE/probe.inspect.json" --image "$STATE/new.image.json" --mode probe
echo "$PROBE" > "$STATE/probe.name"
'''


def probe_snippet(spec):
    return PROBE_TEMPLATE.replace('@CREATE@', create_args(spec, spec['newRef'], name='"$PROBE"', restart='no', isolated=True))


def script_prepare(spec):
    probe = probe_snippet(spec)
    ipchecks = '\n'.join(
        f'B1_TRAEFIK_IP_WAIT_TRIES=1 wait_free {q(n)} {q(ip)} --ignore-container "$OLD_ID" || {{ echo "pinned address on {n} is held by something other than the running Traefik" >&2; exit 3; }}'
        for n, ip in static_networks(spec))
    return HEADER + common(spec) + f'''
actual=$(docker inspect --format '{{{{.Id}}}}' "$OLD")
[[ $actual == "$OLD_ID" ]] || {{ echo "INVENTORY DRIFT: container id changed; regenerate the plan" >&2; exit 3; }}
api=$(docker version --format '{{{{.Server.APIVersion}}}}')
python3 -I "$TOOL" api-check "$api"
avail=$(df --output=avail -k "$STATE" | tail -1 | tr -d ' ')
(( avail > 262144 )) || {{ echo "less than 256 MiB free in state dir" >&2; exit 3; }}
docker inspect "$OLD" > "$STATE/before.inspect.json"
{ipchecks}
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
{probe}
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
echo "PREPARE OK. The running Traefik was not touched; a stopped, restart=no pre-flight candidate exists: $PROBE."
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
TRIES=${{B1_TRAEFIK_VERIFY_TRIES:-15}}
# The Docker/Swarm providers rebuild their routers a few seconds after a start: retry (bounded) before judging.
if [[ -s $STATE/routers.before.json ]]; then
  ok=0
  for i in $(seq 1 "$TRIES"); do
    if docker exec "$NAME" wget -qO- http://127.0.0.1:8080/api/http/routers > "$STATE/routers.after.json" 2>/dev/null \
       && python3 -I "$TOOL" routers-diff "$STATE/routers.before.json" "$STATE/routers.after.json" >/dev/null 2>&1; then ok=1; break; fi
    sleep "${{B1_TRAEFIK_POLL_SECONDS:-2}}"
  done
  (( ok )) || {{ python3 -I "$TOOL" routers-diff "$STATE/routers.before.json" "$STATE/routers.after.json" || true; echo "router baseline not restored" >&2; exit 5; }}
fi
[[ -s $STATE/smoke.tsv ]] || {{ echo "missing $STATE/smoke.tsv (host<TAB>path<TAB>expected status)" >&2; exit 4; }}
while IFS=$'\\t' read -r host path want; do
  [[ -z ${{host:-}} || $host == \\#* ]] && continue
  got=000
  for i in $(seq 1 "$TRIES"); do
    got=$(curl -sS -o /dev/null -w '%{{http_code}}' --max-time 15 --resolve "$host:443:127.0.0.1" "https://$host$path" || echo 000)
    [[ $got == "$want" ]] && break
    sleep "${{B1_TRAEFIK_POLL_SECONDS:-2}}"
  done
  [[ $got == "$want" ]] || {{ echo "SMOKE FAIL $host$path got $got want $want" >&2; exit 5; }}
done < "$STATE/smoke.tsv"
echo "VERIFY OK ($NAME)"
'''


def script_rollback(spec):
    release_cand = '\n'.join(f'  if connected "$holder" {q(n)}; then docker network disconnect {q(n)} "$holder" || true; fi' for n, _ in static_networks(spec))
    restore = []
    for n in spec['networks']:
        ip = spec['networkConfig'][n]['staticIPv4']
        wait = (f'  B1_TRAEFIK_IP_WAIT_TRIES="${{B1_TRAEFIK_ROLLBACK_IP_WAIT_TRIES:-90}}" wait_free {q(n)} {q(ip)} --ignore-container "$OLD_ID" || echo "WARN: {n} still reports its pinned address as held; connecting anyway, Docker re-requests it at start" >&2\n' if ip else '')
        restore.append(f'if ! connected "$OLD_ID" {q(n)}; then\n{wait}  {connect_args(spec, n, chr(34) + "$OLD_ID" + chr(34))}\nfi')
    restore = '\n'.join(restore)
    return HEADER + common(spec) + f'''
[[ -s $STATE/switch.state ]] || {{ echo "no switch.state: nothing to roll back" >&2; exit 2; }}
source "$STATE/switch.state"      # STAMP, PREV, PHASE (last phase reached by 02-switch.sh)
echo "rollback: last recorded phase = ${{PHASE:-unknown}}" >&2
# The ERR trap is armed BEFORE stop/update/rename, so the original may still be named "$OLD" (stop, update or
# rename failed), or already be "$PREV", and it may or may not still own its pinned network endpoints.
# Recover from the effective state, identifying the original by its Id.
current=$(docker inspect --format '{{{{.Name}}}}' "$OLD_ID") || {{ echo "ORIGINAL CONTAINER $OLD_ID NOT FOUND: manual recovery required, nothing was deleted" >&2; exit 6; }}
current=${{current#/}}
# A candidate (different Id) may hold the production name only after a later phase: stop it, give back its pinned
# addresses and move it aside, never delete it.
holder=$(docker inspect --format '{{{{.Id}}}}' "$OLD" 2>/dev/null || true)
if [[ -n $holder && $holder != "$OLD_ID" ]]; then
  docker stop -t 10 "$holder" || true
{release_cand}
  docker rename "$holder" "$OLD-failed-$STAMP"
  docker update --restart=no "$OLD-failed-$STAMP"
fi
[[ $current == "$OLD" ]] || docker rename "$OLD_ID" "$OLD"
# Re-attach the original to every network it lost, with its exact pinned address and aliases (Docker documents that a
# stopped container re-requests its address at start, and fails to start if it is unavailable).
{restore}
docker update --restart=always "$OLD_ID"
docker start "$OLD_ID" || {{ echo "ORIGINAL COULD NOT START (its pinned address is probably still held; see docs runbook section 6). Nothing was deleted: container $OLD_ID is named $OLD with restart=always and its endpoints restored; start it once the address is free." >&2; exit 7; }}
# Configuration is never rewritten automatically (Dokploy may have written valid changes since). Report drift only.
if ! (cd "$STATE" && sha256sum --status -c traefik-config.tar.sha256); then echo "backup archive integrity FAILED" >&2; exit 6; fi
B1_TRAEFIK_VERIFY_MODE=before bash "$HERE/03-verify.sh" "$OLD"
echo "ROLLBACK OK. Original container $OLD_ID (image $OLD_IMAGE_ID) is $OLD again; any failed candidate is kept as $OLD-failed-$STAMP for analysis."
'''


def script_switch(spec):
    create = create_args(spec, spec['newRef'])
    connect = '\n'.join(connect_args(spec, n, '"$OLD"') for n in spec['networks'] if n != spec['primaryNetwork'])
    # The previous container is KEPT (renamed): its pinned addresses are released explicitly and must be seen free before the candidate asks for them.
    release = '\n'.join(f'docker network disconnect {q(n)} "$PREV"\nwait_free {q(n)} {q(ip)}' for n, ip in static_networks(spec))
    return HEADER + common(spec) + f'''
: "${{B1_TRAEFIK_APPROVAL_REF:?owner approval reference required (ticket/commit of the written authorization)}}"
[[ $B1_TRAEFIK_APPROVAL_REF =~ ^[A-Za-z0-9._:/-]{{6,120}}$ ]] || {{ echo "invalid approval reference" >&2; exit 2; }}
[[ ${{B1_TRAEFIK_VERSION_GUARD_ACK:-}} == "yes" ]] || {{ echo "ACK required: Dokploy TRAEFIK_VERSION must be aligned to $TARGET first, or any panel-triggered recreate silently reverts Traefik to Dokploy's default" >&2; exit 2; }}
[[ -s $STATE/prepared.ok ]] || {{ echo "run 01-prepare.sh first" >&2; exit 2; }}
[[ $(docker inspect --format '{{{{.Id}}}}' "$OLD") == "$OLD_ID" ]] || {{ echo "INVENTORY DRIFT since prepare" >&2; exit 3; }}
python3 -I "$TOOL" log-args --spec "$HERE/spec.json" --inspect "$STATE/before.inspect.json" > "$STATE/log.args"
chmod 600 "$STATE/log.args"
mapfile -d '' -t LOGARGS < "$STATE/log.args"
STAMP=$(date -u +%Y%m%dT%H%M%SZ); PREV="$OLD-prev-$STAMP"
printf 'STAMP=%s\\nPREV=%s\\nAPPROVAL=%s\\n' "$STAMP" "$PREV" "$B1_TRAEFIK_APPROVAL_REF" > "$STATE/switch.state"
phase() {{ printf 'PHASE=%s\\n' "$1" >> "$STATE/switch.state"; }}
fail() {{ echo "SWITCH FAILED at line $1 (phase: $(sed -n 's/^PHASE=//p' "$STATE/switch.state" | tail -1)) -> automatic rollback" >&2; trap - ERR; bash "$HERE/rollback.sh" || echo "ROLLBACK ALSO FAILED: manual restore from $PREV required" >&2; exit 1; }}
trap 'fail $LINENO' ERR
# Downtime window starts: ports 80/443 are released by the stop.
phase stopping;         docker stop -t 30 "$OLD"
phase stopped;          docker update --restart=no "$OLD"
phase restart-disabled; docker rename "$OLD" "$PREV"
phase renamed
{release}
phase released
phase creating;         {create}
phase created
{connect}
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
    if src != a.expect_source_version:
        refuse(f'running image tag is {src!r}, the inventory confirmed {a.expect_source_version} (--expect-source-version)')
    if c['Image'] != image['Id']:
        refuse('the supplied image JSON is not the image of this container')
    spec = normalize(c, image)
    docs = [load(p) for p in a.network]
    attached = set(c['NetworkSettings']['Networks'])
    if {d['Name'] for d in docs} != attached:
        refuse(f'networks differ: the supplied network captures {sorted(d["Name"] for d in docs)} do not match the networks attached to the container {sorted(attached)}')
    spec['networkDrivers'] = check_networks(spec['networkConfig'], docs)
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
    want = {k: spec[k] for k in PRESERVED}
    if a.mode == 'before':
        if normalize(c, image) != want or c['Id'] != spec['containerId'] or c['Image'] != spec['imageId']:
            refuse('running container no longer matches the plan')
        print('BEFORE MATCHES PLAN'); return
    if a.mode == 'probe':
        # The stopped pre-flight candidate, created by THIS daemon with the generated flags: everything Docker adds or
        # inherits (log driver, init, security options, ulimits, mounts, networks) must equal the plan before any downtime.
        if (c.get('State') or {}).get('Running') or c['Id'] in (spec['containerId'],):
            refuse('the pre-flight candidate must be a different, stopped container')
        if not c['Config'].get('Image', '').endswith('@' + spec['targetDigest']):
            refuse('the pre-flight candidate does not use the approved digest')
        now = normalize(c, image, kind='probe')       # refuses a probe that has a network or a published port
        pw = {k: want[k] for k in PROBE_KEYS}; pw['restart'] = 'no'
        if {k: now[k] for k in PROBE_KEYS} != pw:
            refuse(f'THE CANDIDATE WOULD NOT PRESERVE: {sorted(k for k in pw if now.get(k) != pw[k])} (nothing was switched)')
        print('PROBE OK: an isolated candidate created with the generated flags preserves mounts, log configuration and inherited settings (ports, networks and the pinned address are not exercised by the probe)'); return
    # after: the new container must be the old one with ONLY the image (and ids) changed.
    state = c['State']
    if not state.get('Running') or state.get('Restarting') or c['RestartCount'] != 0:
        refuse('new container is not stably running')
    if c['Id'] == spec['containerId'] or c['Image'] == spec['imageId']:
        refuse('container/image id unchanged')
    if not c['Config'].get('Image', '').endswith('@' + spec['targetDigest']):
        refuse('container is not running the approved digest')
    now = normalize(c, image)       # image = the pulled NEW image: no extra env/labels/cmd/user may differ from its defaults
    if now != want:
        refuse(f'NOT PRESERVED: {sorted(k for k in want if now.get(k) != want[k])}')
    print('AFTER PRESERVES PORTS/MOUNTS/NETWORKS/LOG/RESTART; image changed to the approved digest')


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


def cmd_logargs(a):
    spec, c = json.loads(Path(a.spec).read_text()), load(a.inspect)
    typ, opts = read_log(c['HostConfig'])
    if log_summary(typ, opts) != spec['log']:
        refuse('the log configuration of the capture differs from the plan; regenerate the plan')
    tokens = ['--log-driver', typ] + [t for k in sorted(opts) for t in ('--log-opt', f'{k}={opts[k]}')]
    sys.stdout.buffer.write(b''.join(t.encode() + b'\0' for t in tokens))   # NUL-separated: no shell quoting, no values in scripts
    sys.stdout.buffer.flush()


def cmd_ipcheck(a):
    try:
        ip = str(ipaddress.IPv4Address(a.ip))
        text = Path(a.network_json).read_text().strip()
        data = json.loads(text) if text else None
    except (ValueError, OSError):
        print('IP-CHECK: unusable input (address or network inspect output); treating the address as NOT free', file=sys.stderr); return 2
    net = data[0] if isinstance(data, list) and data else data
    if not isinstance(net, dict):
        print('IP-CHECK: no network inspect data; treating the address as NOT free', file=sys.stderr); return 2
    ignore = tuple(a.ignore_container or ())
    held = []
    for cid, c in (net.get('Containers') or {}).items():
        if (c.get('IPv4Address') or '').split('/')[0] == ip and not any(cid.startswith(i) for i in ignore):
            held.append(f'container {c.get("Name", cid[:12])}')
    for svc, sv in (net.get('Services') or {}).items():
        if (sv.get('VIP') or '').split('/')[0] == ip:
            held.append(f'service VIP {svc}')
        for t in sv.get('Tasks') or []:
            if (t.get('EndpointIP') or '').split('/')[0] == ip:
                held.append(f'task {t.get("Name", "?")}')
    if held:
        print(f'IP-CHECK: {ip} is held by: {", ".join(held)}', file=sys.stderr); return 1
    print(f'IP-CHECK: {ip} is free'); return 0


def cmd_scan(a):
    lines = Path(a.log).read_text(errors='replace').splitlines()
    benign = re.compile(r'level=(info|debug|warn|trace)\b|"level":"(info|debug|warn|trace)"')
    fatal = [l for l in lines if FATAL.search(l) and not benign.search(l)]
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
    s.add_argument('--target-digest', required=True); s.add_argument('--out', required=True)
    s.add_argument('--expect-source-version', default=EXPECTED_SOURCE_VERSION); s.set_defaults(f=cmd_plan)
    s = sub.add_parser('compare'); s.add_argument('--spec', required=True); s.add_argument('--inspect'); s.add_argument('--image')
    s.add_argument('--mode', choices=('before', 'probe', 'after', 'image'), required=True); s.set_defaults(f=cmd_compare)
    s = sub.add_parser('routers-diff'); s.add_argument('before'); s.add_argument('after'); s.set_defaults(f=cmd_routers)
    s = sub.add_parser('log-args'); s.add_argument('--spec', required=True); s.add_argument('--inspect', required=True); s.set_defaults(f=cmd_logargs)
    s = sub.add_parser('ip-check'); s.add_argument('network_json'); s.add_argument('ip'); s.add_argument('--ignore-container', action='append'); s.set_defaults(f=cmd_ipcheck)
    s = sub.add_parser('scan-canary-log'); s.add_argument('log'); s.set_defaults(f=cmd_scan)
    s = sub.add_parser('api-check'); s.add_argument('version'); s.set_defaults(f=cmd_api)
    a = p.parse_args(argv)
    try:
        rc = a.f(a)
        return rc or 0
    except Refused as e:
        print(f'REFUSED: {e}', file=sys.stderr); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
