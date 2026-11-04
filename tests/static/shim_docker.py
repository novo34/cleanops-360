#!/usr/bin/env python3
"""Test double for the Docker CLI (used only by test_traefik_standalone_upgrade.py). No daemon, no network."""
import json, os, sys, uuid
S = os.environ['SHIM_STATE']
st = json.load(open(S))
args = sys.argv[1:]
st['calls'].append(args)
fail_after = False
for i, entry in enumerate(st.get('fail_on', [])):
    if args[:len(entry['cmd'])] == entry['cmd']:        # one-shot: later (rollback) calls of the same verb succeed
        st['fail_on'].pop(i)
        if not entry.get('effect'):
            json.dump(st, open(S, 'w')); sys.exit(1)     # fails WITHOUT changing anything
        fail_after = True                                # fails AFTER the change happened (e.g. timeout reporting an error)
        break


def save():
    json.dump(st, open(S, 'w'))


def find(name):
    for k, c in st['containers'].items():
        if k == name or c['Id'] == name:
            return k, c
    return None, None


def out(x):
    print(x if isinstance(x, str) else json.dumps(x))


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
    out(st['routers'])
elif cmd == 'stop':
    _, c = find(args[-1]); c['State']['Running'] = False
elif cmd == 'update':
    _, c = find(args[-1]); c['HostConfig']['RestartPolicy']['Name'] = args[1].split('=', 1)[1]
elif cmd == 'rename':
    k, c = find(args[1]); st['containers'][args[2]] = st['containers'].pop(k); c['Name'] = '/' + args[2]
elif cmd == 'create':
    a, name, restart, net, ports, mounts = args[1:], None, None, None, {}, []
    i = 0
    while i < len(a) - 1:
        if a[i] == '--name': name = a[i + 1]; i += 2
        elif a[i] == '--restart': restart = a[i + 1]; i += 2
        elif a[i] == '--network': net = a[i + 1]; i += 2
        elif a[i] == '-p':
            hp, rest = a[i + 1].split(':'); ports[rest] = [{'HostIp': '', 'HostPort': hp}]; i += 2
        elif a[i] == '--mount':
            kv = dict(x.split('=', 1) if '=' in x else (x, True) for x in a[i + 1].split(','))
            mounts.append({'Type': kv['type'], 'Source': kv['source'], 'Destination': kv['target'], 'RW': 'readonly' not in kv}); i += 2
        else: raise SystemExit('shim: unsupported create arg ' + a[i])
    ref = a[-1]
    img = st['images'][ref]
    cid = uuid.uuid4().hex * 2
    st['containers'][name] = {'Id': cid[:64], 'Name': '/' + name, 'Image': img['Id'], 'RestartCount': 0, 'State': {'Running': False, 'Restarting': False},
        'Config': {'Image': ref, 'Cmd': img['Config'].get('Cmd'), 'Entrypoint': img['Config'].get('Entrypoint'), 'Env': img['Config'].get('Env'), 'Labels': img['Config'].get('Labels'), 'User': '', 'WorkingDir': ''},
        'HostConfig': {'RestartPolicy': {'Name': restart}, 'PortBindings': ports, 'LogConfig': {'Type': 'json-file', 'Config': {}}},
        'Mounts': mounts, 'NetworkSettings': {'Networks': {net: {'Aliases': [name, cid[:12]], 'IPAMConfig': None}}}}
elif cmd == 'network' and args[1] == 'connect':
    _, c = find(args[3]); c['NetworkSettings']['Networks'][args[2]] = {'Aliases': [c['Id'][:12]], 'IPAMConfig': None}
elif cmd == 'start':
    _, c = find(args[-1]); c['State']['Running'] = not st.get('fail_start')
    if st.get('fail_start') and c['Config']['Image'].startswith('traefik:v3.7'): c['RestartCount'] = 3
    elif st.get('fail_start'): c['State']['Running'] = True
else:
    save(); sys.exit('shim: unsupported docker command ' + ' '.join(args))
save()
sys.exit(1 if fail_after else 0)
