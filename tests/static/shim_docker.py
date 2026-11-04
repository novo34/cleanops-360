#!/usr/bin/env python3
"""Test double for the Docker CLI (used only by test_traefik_standalone_upgrade.py). No daemon, no network.

Besides containers/images it models what matters for pinned addresses on swarm-scoped networks:
  * st['holders'][net][ip] = container id that currently reserves the address
  * `stop` releases the reservation unless st['sticky_stop'] (a stopped container does not reliably give it back)
  * the release (by `stop`, or by `network disconnect` when stop kept it) is delayed when st['slow_release'][net][ip] = N
    (it lingers for N `network inspect` polls) or st['stuck'][net][ip] (it never goes away)
  * st['foreign'][net][ip] = name: a service task elsewhere that holds the address (visible in verbose inspect)
  * starting / connecting a running container with an address that is reserved by another holder fails like Docker
  * the simulated DAEMON applies its own defaults to created containers (st['daemon_log'], st['daemon_hostconfig']: init,
    security options, ulimits), like a hardened daemon.json; `--log-driver/--log-opt` override the log default
  * st['routers_lag'] = N: the first N router-API queries return nothing (providers still rebuilding after a start)
  * st['reject_create_with'] = flag: `docker create` fails when that flag is present (an option the daemon refuses)
  * st['create_reserves_ip'] = True: a daemon that reserves a pinned address ALREADY AT `docker create` (not proven either way on
    swarm-scoped networks): creating with an address someone holds fails, and a successful create takes the reservation
  * st['create_reserves_ports'] = True: `-p` at create conflicts with / takes the operational ports (st['ports_taken'])
"""
import json, os, sys, uuid
S = os.environ['SHIM_STATE']
st = json.load(open(S))
args = sys.argv[1:]
st['calls'].append(args)


def save():
    json.dump(st, open(S, 'w'))


fail_after = False
for i, entry in enumerate(st.get('fail_on', [])):
    if args[:len(entry['cmd'])] == entry['cmd']:        # one-shot: later (rollback) calls of the same verb succeed
        st['fail_on'].pop(i)
        if not entry.get('effect'):
            save(); sys.exit(1)                          # fails WITHOUT changing anything
        fail_after = True                                # fails AFTER the change happened (e.g. a timeout reporting an error)
        break


def find(name):
    for k, c in st['containers'].items():
        if k == name or c['Id'] == name:
            return k, c
    return None, None


def out(x):
    print(x if isinstance(x, str) else json.dumps(x))


def holders(net):
    return st.setdefault('holders', {}).setdefault(net, {})


def pinned(e):
    return (e.get('IPAMConfig') or {}).get('IPv4Address')


def conflict(c, net, e):
    ip = pinned(e)
    if not ip:
        return None
    other = holders(net).get(ip)
    foreign = st.get('foreign', {}).get(net, {}).get(ip)
    if foreign or (other not in (None, c['Id'])):
        return f'Error response from daemon: Address already in use: {ip} on network {net}'
    return None


def allocate(c):
    for net, e in c['NetworkSettings']['Networks'].items():
        err = conflict(c, net, e)
        if err:
            return err
    for net, e in c['NetworkSettings']['Networks'].items():
        ip = pinned(e)
        if ip:
            holders(net)[ip] = c['Id']; e['IPAddress'] = ip
        else:
            st['next_dyn'] = st.get('next_dyn', 16) + 1; e['IPAddress'] = f"172.23.0.{st['next_dyn']}"
    return None


def release(cid, net, linger=True):
    for ip, holder in list(holders(net).items()):
        if holder == cid:
            slow = st.get('slow_release', {}).get(net, {}).get(ip)
            if linger and st.get('stuck', {}).get(net, {}).get(ip):
                holders(net)[ip] = 'ghost-reservation'
            elif linger and slow:
                holders(net)[ip] = 'ghost-reservation'; st.setdefault('ghost_polls', {}).setdefault(net, {})[ip] = slow
            else:
                del holders(net)[ip]


cmd = args[0]
if cmd == 'inspect':
    _, c = find(args[-1])
    if c is None:
        save(); sys.exit(1)
    fmt = args[2] if args[1] == '--format' else None
    if fmt == '{{.Id}}':
        out(c['Id'])
    elif fmt == '{{.Name}}':
        out(c['Name'])
    elif fmt == '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}':
        print(''.join(k + ' ' for k in c['NetworkSettings']['Networks']))
    elif fmt == '{{.State.Running}} {{.RestartCount}}':
        out(f"{str(c['State']['Running']).lower()} {c['RestartCount']}")
    else:
        out([c])
elif cmd == 'image' and args[1] == 'inspect':
    img = st['images'].get(args[-1])
    if img is None:
        save(); sys.exit(1)
    out([img])
elif cmd == 'version':
    out(st['api'])
elif cmd == 'pull':
    if args[1] not in st['images']:
        save(); sys.exit(1)
elif cmd == 'run':
    out(st['canary_log'])
elif cmd == 'exec':
    if st.get('routers_lag', 0) > 0:
        st['routers_lag'] -= 1; out('[]')
    else:
        out(st['routers'])
elif cmd == 'stop':
    _, c = find(args[-1]); c['State']['Running'] = False
    for net, e in c['NetworkSettings']['Networks'].items():
        e['IPAddress'] = ''
        if not st.get('sticky_stop'):
            release(c['Id'], net)          # slow/stuck reservations apply to whichever event frees the address first
elif cmd == 'update':
    _, c = find(args[-1]); c['HostConfig']['RestartPolicy']['Name'] = args[1].split('=', 1)[1]
elif cmd == 'rename':
    k, c = find(args[1]); st['containers'][args[2]] = st['containers'].pop(k); c['Name'] = '/' + args[2]
    for e in c['NetworkSettings']['Networks'].values():          # worst case: the previous name stays as a stale alias
        e['Aliases'] = list(dict.fromkeys((e.get('Aliases') or []) + [args[2]]))
elif cmd == 'create':
    a, name, restart, net, ports, mounts, ip, aliases = args[1:], None, None, None, {}, [], None, []
    log_driver, log_opts = None, {}
    if st.get('reject_create_with') and st['reject_create_with'] in a:
        print('Error response from daemon: unsupported option', file=sys.stderr); save(); sys.exit(1)
    i = 0
    while i < len(a) - 1:
        if a[i] == '--name': name = a[i + 1]; i += 2
        elif a[i] == '--restart': restart = a[i + 1]; i += 2
        elif a[i] == '--network': net = a[i + 1]; i += 2
        elif a[i] == '--ip': ip = a[i + 1]; i += 2
        elif a[i] == '--network-alias': aliases.append(a[i + 1]); i += 2
        elif a[i] == '--log-driver': log_driver = a[i + 1]; i += 2
        elif a[i] == '--log-opt': k, v = a[i + 1].split('=', 1); log_opts[k] = v; i += 2
        elif a[i] == '-p':
            hp, rest = a[i + 1].split(':'); ports[rest] = [{'HostIp': '', 'HostPort': hp}]; i += 2
        elif a[i] == '--mount':
            kv = dict(x.split('=', 1) if '=' in x else (x, True) for x in a[i + 1].split(','))
            mounts.append({'Type': kv['type'], 'Source': kv['source'], 'Destination': kv['target'], 'RW': 'readonly' not in kv}); i += 2
        else: raise SystemExit('shim: unsupported create arg ' + a[i])
    ref = a[-1]
    img = st['images'][ref]
    cid = uuid.uuid4().hex * 2
    if ip and st.get('create_reserves_ip'):
        if holders(net).get(ip) or st.get('foreign', {}).get(net, {}).get(ip):
            print(f'Error response from daemon: Address already in use: {ip} on network {net}', file=sys.stderr); save(); sys.exit(1)
        holders(net)[ip] = cid[:64]
    if ports and st.get('create_reserves_ports'):
        taken = set(st.setdefault('ports_taken', []))
        if taken & set(ports):
            print('Error response from daemon: port is already allocated', file=sys.stderr); save(); sys.exit(1)
        st['ports_taken'] = sorted(taken | set(ports))
    st['containers'][name] = {'Id': cid[:64], 'Name': '/' + name, 'Image': img['Id'], 'RestartCount': 0, 'State': {'Running': False, 'Restarting': False},
        'Config': {'Image': ref, 'Cmd': img['Config'].get('Cmd'), 'Entrypoint': img['Config'].get('Entrypoint'), 'Env': img['Config'].get('Env'), 'Labels': img['Config'].get('Labels'), 'User': '', 'WorkingDir': ''},
        'HostConfig': {'RestartPolicy': {'Name': restart}, 'PortBindings': ports, 'NetworkMode': net,
                       'LogConfig': ({'Type': log_driver, 'Config': log_opts} if log_driver else dict(st.get('daemon_log', {'Type': 'json-file', 'Config': {}}))),
                       **st.get('daemon_hostconfig', {})},
        'Mounts': mounts, 'NetworkSettings': {'Networks': {net: {'Aliases': [name, cid[:12], *aliases], 'IPAMConfig': {'IPv4Address': ip} if ip else None, 'IPAddress': ''}}}}
elif cmd == 'network' and args[1] == 'connect':
    a, ip, aliases = args[2:], None, []
    i = 0
    while i < len(a) - 2:
        if a[i] == '--ip': ip = a[i + 1]; i += 2
        elif a[i] == '--alias': aliases.append(a[i + 1]); i += 2
        else: raise SystemExit('shim: unsupported connect arg ' + a[i])
    net, target = a[-2], a[-1]
    _, c = find(target)
    e = {'Aliases': [c['Id'][:12], *aliases], 'IPAMConfig': {'IPv4Address': ip} if ip else None, 'IPAddress': ''}
    if c['State']['Running']:                          # a running container is attached for real: the address is requested now
        err = conflict(c, net, e)
        if err:
            print(err, file=sys.stderr); save(); sys.exit(1)
        if ip:
            holders(net)[ip] = c['Id']; e['IPAddress'] = ip
        else:
            st['next_dyn'] = st.get('next_dyn', 16) + 1; e['IPAddress'] = f"172.23.0.{st['next_dyn']}"
    c['NetworkSettings']['Networks'][net] = e
elif cmd == 'network' and args[1] == 'disconnect':
    _, c = find(args[3])
    c['NetworkSettings']['Networks'].pop(args[2], None)
    release(c['Id'], args[2])
elif cmd == 'network' and args[1] == 'inspect':
    verbose = '--verbose' in args
    net = args[-1]
    doc = dict(st['networks'][net])
    containers = {}
    for ip, holder in list(holders(net).items()):
        if holder == 'ghost-reservation':
            polls = st.setdefault('ghost_polls', {}).setdefault(net, {})
            if ip in polls:
                polls[ip] -= 1
                if polls[ip] <= 0:
                    del polls[ip]; del holders(net)[ip]; continue
            containers['ghost' + '0' * 59] = {'Name': 'ghost-endpoint', 'IPv4Address': ip + '/24'}
            continue
        _, c = find(holder)
        containers[holder] = {'Name': (c or {'Name': '/?'})['Name'].lstrip('/'), 'IPv4Address': ip + '/24'}
    doc['Containers'] = containers
    if verbose:
        doc['Services'] = {f'svc-{n}': {'VIP': '', 'Tasks': [{'Name': f'{n}.1', 'EndpointIP': ip + '/24'}]}
                           for ip, n in st.get('foreign', {}).get(net, {}).items()}
    out([doc])
elif cmd == 'start':
    _, c = find(args[-1])
    if st.get('foreign_on_start') and c['Config']['Image'].startswith('traefik:v3.7'):
        for net, e in c['NetworkSettings']['Networks'].items():
            if pinned(e):
                st.setdefault('foreign', {}).setdefault(net, {})[pinned(e)] = st['foreign_on_start']   # the address is taken by someone else first
    err = allocate(c)
    if err:
        print(err, file=sys.stderr); save(); sys.exit(1)
    c['State']['Running'] = not st.get('fail_start')
    if st.get('fail_start') and c['Config']['Image'].startswith('traefik:v3.7'): c['RestartCount'] = 3
    elif st.get('fail_start'): c['State']['Running'] = True
else:
    save(); sys.exit('shim: unsupported docker command ' + ' '.join(args))
save()
sys.exit(1 if fail_after else 0)
