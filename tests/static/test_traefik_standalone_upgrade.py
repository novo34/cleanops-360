"""Isolated tests for scripts/traefik-standalone-upgrade.py and the scripts it generates.

No Docker daemon, VPS, secret or network: the Docker CLI is replaced by tests/static/shim_docker.py.
The fixture mirrors only the owner-confirmed inventory (Dokploy v0.30.10 standalone Traefik v3.6.7).
"""
import copy, json, os, shutil, stat, subprocess, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / 'scripts/traefik-standalone-upgrade.py'
SHIM = ROOT / 'tests/static/shim_docker.py'
CURL = ROOT / 'tests/static/shim_curl.sh'
OLD_ID, OLD_IMG = 'a' * 64, 'sha256:' + '1' * 64
LOG_SECRET = 'SECRET-VALUE-do-not-print-9f3a'   # stands for a credential carried in a log option
PIN = '10.0.1.11'          # synthetic fixture value only: the tool derives the address from the capture
NETS = {'dokploy-network': {'Name': 'dokploy-network', 'Driver': 'overlay', 'Scope': 'swarm', 'Attachable': True, 'IPAM': {'Config': [{'Subnet': '10.0.1.0/24', 'Gateway': '10.0.1.1'}]}},
        'supabase-supabase-2bvnab': {'Name': 'supabase-supabase-2bvnab', 'Driver': 'bridge', 'Scope': 'local', 'Attachable': False, 'IPAM': {'Config': [{'Subnet': '172.23.0.0/16'}]}}}
NEW_IMG, DIGEST = 'sha256:' + '2' * 64, 'sha256:' + '3' * 64
REF = f'traefik:v3.7.17@{DIGEST}'
ROUTERS = [{'name': 'cleanops360-f4fxmd-15-websecure@docker', 'rule': 'Host(`cleanops.nuvurent.com`)', 'entryPoints': ['websecure'],
            'service': 'web', 'middlewares': [], 'tls': {'certResolver': 'letsencrypt'}}]


def image(img_id, ref):
    return {'Id': img_id, 'RepoDigests': [f'traefik@{DIGEST}'] if img_id == NEW_IMG else [], 'RepoTags': [ref],
            'Config': {'Cmd': None, 'Entrypoint': ['/entrypoint.sh'], 'Env': ['PATH=/usr/bin'], 'Labels': {'org.opencontainers.image.version': 'v3.7.17'}, 'User': '', 'WorkingDir': ''}}


def container(root):
    return {'Id': OLD_ID, 'Name': '/dokploy-traefik', 'Image': OLD_IMG, 'RestartCount': 0, 'State': {'Running': True, 'Restarting': False},
            'Config': {'Image': 'traefik:v3.6.7', 'Cmd': None, 'Entrypoint': ['/entrypoint.sh'], 'Env': ['PATH=/usr/bin'], 'Labels': {}, 'User': '', 'WorkingDir': ''},
            'HostConfig': {'RestartPolicy': {'Name': 'always'}, 'LogConfig': {'Type': 'json-file', 'Config': {}},
                           'PortBindings': {'80/tcp': [{'HostIp': '', 'HostPort': '80'}], '443/tcp': [{'HostIp': '', 'HostPort': '443'}], '443/udp': [{'HostIp': '', 'HostPort': '443'}]}},
            'Mounts': [{'Type': 'bind', 'Source': f'{root}/etc/dokploy/traefik/traefik.yml', 'Destination': '/etc/traefik/traefik.yml', 'RW': True},
                       {'Type': 'bind', 'Source': f'{root}/etc/dokploy/traefik/dynamic', 'Destination': '/etc/dokploy/traefik/dynamic', 'RW': True},
                       {'Type': 'bind', 'Source': '/var/run/docker.sock', 'Destination': '/var/run/docker.sock', 'RW': False}],
            'NetworkSettings': {'Networks': {'dokploy-network': {'Aliases': ['dokploy-traefik', 'aaaaaaaaaaaa'], 'IPAMConfig': {'IPv4Address': PIN}, 'IPAddress': PIN},
                                             'supabase-supabase-2bvnab': {'Aliases': ['aaaaaaaaaaaa'], 'IPAMConfig': {}, 'IPAddress': '172.23.0.15'}}}}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='traefik-upgrade-test-'))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.root = self.tmp / 'host'
        (self.root / 'etc/dokploy/traefik/dynamic').mkdir(parents=True)
        (self.root / 'etc/dokploy/traefik/traefik.yml').write_text('entryPoints: {}\n')
        (self.root / 'etc/dokploy/traefik/dynamic/acme.json').write_text('{"synthetic":"never a real certificate store"}')
        self.inputs = self.tmp / 'inputs'; self.inputs.mkdir()
        self.write('container.json', [container(self.root)]); self.write('image.json', [image(OLD_IMG, 'traefik:v3.6.7')])
        for n in NETS:
            self.write(f'{n}.json', [NETS[n]])

    def write(self, name, data):
        (self.inputs / name).write_text(json.dumps(data))

    def plan(self, version='3.7.17', digest=DIGEST, out=None, networks=('dokploy-network.json', 'supabase-supabase-2bvnab.json'), extra=()):
        out = out or self.tmp / 'plan'
        return subprocess.run(['python3', '-I', str(TOOL), 'plan', '--container', str(self.inputs / 'container.json'), '--image', str(self.inputs / 'image.json'),
                               '--network', *[str(self.inputs / n) for n in networks],
                               '--target-version', version, '--target-digest', digest, '--out', str(out), *extra], capture_output=True, text=True)


class Planning(Base):
    def test_generates_exact_reviewable_scripts(self):
        r = self.plan(); self.assertEqual(r.returncode, 0, r.stderr)
        spec = json.loads((self.tmp / 'plan/spec.json').read_text())
        self.assertEqual((spec['sourceVersion'], spec['targetVersion'], spec['newRef']), ('3.6.7', '3.7.17', REF))
        switch = (self.tmp / 'plan/02-switch.sh').read_text()
        for needle in ('--restart always', '--network dokploy-network', '-p 80:80/tcp', '-p 443:443/tcp', '-p 443:443/udp',
                       'target=/var/run/docker.sock,readonly', 'type=bind,source=', 'docker network connect supabase-supabase-2bvnab "$OLD"',
                       f'--ip {PIN}', 'docker network disconnect dokploy-network "$PREV"', f'wait_free dokploy-network {PIN}',
                       'docker stop -t 30', 'docker update --restart=no', 'docker rename "$OLD" "$PREV"', 'trap '):
            self.assertIn(needle, switch)
        for name in ('01-prepare.sh', '02-switch.sh', '03-verify.sh', 'rollback.sh'):
            text = (self.tmp / 'plan' / name).read_text()
            subprocess.run(['bash', '-n', str(self.tmp / 'plan' / name)], check=True)
            for forbidden in ('service update', 'docker service', 'docker rm', ' rm -', 'prune', '--privileged', 'docker exec "$OLD" sh', 'latest'):
                self.assertNotIn(forbidden, text, f'{name} contains {forbidden!r}')
        # -v is never used: --mount refuses to create a missing host path
        self.assertNotIn(' -v ', switch)
        prepare = (self.tmp / 'plan/01-prepare.sh').read_text()
        probe_cmd = next(l for l in prepare.splitlines() if l.startswith('docker create --name "$PROBE"'))
        self.assertIn('--network none', probe_cmd); self.assertIn('--restart no', probe_cmd)
        for forbidden in ('--ip', ' -p ', '--network-alias', 'dokploy-network', 'supabase'):
            self.assertNotIn(forbidden, probe_cmd, f'the probe must not compete for {forbidden!r}')
        self.assertNotIn('network connect', prepare.split('PROBE=')[1].split('# Canary')[0], 'the probe attaches to no network')
        self.assertIn('--mount type=bind,source=', probe_cmd); self.assertIn('"${LOGARGS[@]}"', probe_cmd)
        everything = ''.join((self.tmp / 'plan' / n).read_text() for n in ('01-prepare.sh', '02-switch.sh', '03-verify.sh', 'rollback.sh'))
        self.assertNotIn('172.23.0.15', everything, 'the dynamic address of the second network is never pinned')
        self.assertNotIn('network connect --ip', switch.split('docker create')[1].split('docker start')[0], 'only the primary network is pinned, at create')
        self.assertEqual(spec['networkConfig']['dokploy-network'], {'staticIPv4': PIN, 'aliases': []})
        self.assertEqual(spec['networkConfig']['supabase-supabase-2bvnab'], {'staticIPv4': None, 'aliases': []})
        self.assertEqual(spec['networkDrivers']['dokploy-network']['driver'], 'overlay')

    def refuses(self, mutate, fragment, **kw):
        c = [container(self.root)]; img = [image(OLD_IMG, 'traefik:v3.6.7')]
        mutate(c[0], img[0]); self.write('container.json', c); self.write('image.json', img)
        r = self.plan(**kw)
        self.assertEqual(r.returncode, 1, r.stdout); self.assertIn('REFUSED', r.stderr); self.assertIn(fragment, r.stderr)
        self.assertFalse((self.tmp / 'plan').exists(), 'no scripts may be written when refusing')
        return r

    def test_fail_closed_on_inventory_drift(self):
        self.refuses(lambda c, i: c['HostConfig']['PortBindings'].pop('443/udp'), 'published ports')
        self.refuses(lambda c, i: c['HostConfig']['PortBindings']['80/tcp'][0].update(HostIp='10.0.0.5'), 'host IP')
        self.refuses(lambda c, i: c['Mounts'].pop(), 'three bind mounts')
        self.refuses(lambda c, i: c['Mounts'][2].update(RW=True), 'read-only')
        self.refuses(lambda c, i: c['Mounts'][1].update(RW=False), 'read-write')
        self.refuses(lambda c, i: c['NetworkSettings']['Networks'].pop('supabase-supabase-2bvnab'), 'networks differ')
        self.refuses(lambda c, i: c['Config'].update(Cmd=['--api.insecure=true']), 'no explicit flags')
        self.refuses(lambda c, i: c['HostConfig'].update(Privileged=True), 'Privileged')
        self.refuses(lambda c, i: c['HostConfig']['RestartPolicy'].update(Name='unless-stopped'), 'restart policy')
        self.refuses(lambda c, i: c['Config'].update(Image='traefik:v3.6.25'), 'inventory confirmed')

    def test_pinned_address_is_derived_never_hardcoded(self):
        source = TOOL.read_text()
        self.assertNotIn(PIN, source); self.assertNotIn('10.0.1.', source); self.assertNotIn('172.23.0.15', source)
        other = '10.7.3.42'
        c = [container(self.root)]; c[0]['NetworkSettings']['Networks']['dokploy-network'].update(IPAMConfig={'IPv4Address': other}, IPAddress=other)
        self.write('container.json', c)
        nets = copy.deepcopy(NETS['dokploy-network']); nets['IPAM']['Config'][0]['Subnet'] = '10.7.3.0/24'; self.write('dokploy-network.json', [nets])
        r = self.plan(); self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads((self.tmp / 'plan/spec.json').read_text())['networkConfig']['dokploy-network']['staticIPv4'], other)
        text = ''.join((self.tmp / 'plan' / n).read_text() for n in ('02-switch.sh', 'rollback.sh'))
        self.assertIn(f'--ip {other}', text); self.assertNotIn(PIN, text)

    def test_custom_aliases_are_preserved_exactly(self):
        c = [container(self.root)]
        c[0]['NetworkSettings']['Networks']['dokploy-network']['Aliases'] += ['traefik.internal']
        c[0]['NetworkSettings']['Networks']['supabase-supabase-2bvnab']['Aliases'] += ['edge-proxy']
        self.write('container.json', c)
        self.assertEqual(self.plan().returncode, 0)
        switch = (self.tmp / 'plan/02-switch.sh').read_text(); rollback = (self.tmp / 'plan/rollback.sh').read_text()
        self.assertIn('--network-alias traefik.internal', switch)
        self.assertIn('docker network connect --alias edge-proxy supabase-supabase-2bvnab "$OLD"', switch)
        self.assertIn(f'docker network connect --ip {PIN} --alias traefik.internal dokploy-network', rollback)

    def test_unsupported_network_configurations_are_still_refused(self):
        dk = lambda c: c['NetworkSettings']['Networks']['dokploy-network']
        sb = lambda c: c['NetworkSettings']['Networks']['supabase-supabase-2bvnab']
        self.refuses(lambda c, i: dk(c).update(IPAMConfig={'IPv4Address': PIN, 'IPv6Address': 'fd00::5'}), 'unsupported endpoint IPAM')
        self.refuses(lambda c, i: dk(c).update(IPAMConfig={'IPv4Address': PIN, 'LinkLocalIPs': ['169.254.1.1']}), 'unsupported endpoint IPAM')
        self.refuses(lambda c, i: dk(c).update(IPAMConfig={'IPv4Address': '010.0.1.11'}, IPAddress='010.0.1.11'), 'canonical IPv4')
        self.refuses(lambda c, i: dk(c).update(IPAMConfig={'IPv4Address': 'not-an-ip'}, IPAddress='not-an-ip'), 'canonical IPv4')
        self.refuses(lambda c, i: dk(c).update(IPAddress='10.0.1.99'), 'inconsistent')
        self.refuses(lambda c, i: sb(c).update(IPAMConfig={'IPv4Address': '172.23.0.15'}, IPAddress='172.23.0.14'), 'inconsistent')
        self.refuses(lambda c, i: dk(c).update(Aliases=['dokploy-traefik', 'aaaaaaaaaaaa', 'bad alias!']), 'unsupported alias')
        # network definitions
        def with_net(name, **changes):
            doc = copy.deepcopy(NETS[name]); doc.update(changes); self.write(f'{name}.json', [doc])
        for label, name, changes, fragment in (
                ('driver', 'dokploy-network', {'Driver': 'macvlan'}, 'not supported'),
                ('overlay without swarm scope', 'dokploy-network', {'Scope': 'local'}, 'swarm-scoped and attachable'),
                ('overlay not attachable', 'dokploy-network', {'Attachable': False}, 'swarm-scoped and attachable'),
                ('address outside the subnet', 'dokploy-network', {'IPAM': {'Config': [{'Subnet': '10.9.0.0/24'}]}}, 'outside')):
            with self.subTest(label):
                shutil.rmtree(self.tmp / 'plan', ignore_errors=True)
                for n in NETS: self.write(f'{n}.json', [NETS[n]])
                self.write('container.json', [container(self.root)]); self.write('image.json', [image(OLD_IMG, 'traefik:v3.6.7')])
                with_net(name, **changes)
                r = self.plan(); self.assertEqual(r.returncode, 1); self.assertIn(fragment, r.stderr); self.assertFalse((self.tmp / 'plan').exists())


    # ---- integral audit: LogConfig and the other predictable false rejections / false acceptances ----
    SECRET = 'SECRET-VALUE-do-not-print-9f3a'
    LOGS = {
        'json-file with rotation (typical hardened daemon.json)': {'Type': 'json-file', 'Config': {'max-size': '10m', 'max-file': '3'}},
        'local with limits': {'Type': 'local', 'Config': {'max-size': '20m', 'compress': 'true'}},
        'journald': {'Type': 'journald', 'Config': {'tag': 'traefik'}},
        'syslog': {'Type': 'syslog', 'Config': {'syslog-address': 'udp://127.0.0.1:514', 'tag': 'cleanops-{{.Name}}-prod'}},
        'fluentd': {'Type': 'fluentd', 'Config': {'fluentd-address': 'localhost:24224', 'fluentd-async': 'true'}},
        'none': {'Type': 'none', 'Config': {}},
        'splunk with a credential option': {'Type': 'splunk', 'Config': {'splunk-url': 'https://splunk.example:8088', 'splunk-token': SECRET}},
        'default json-file': {'Type': 'json-file', 'Config': {}},
    }

    def test_every_supported_log_configuration_is_preserved_without_printing_values(self):
        for label, lc in self.LOGS.items():
            with self.subTest(label):
                shutil.rmtree(self.tmp / 'plan', ignore_errors=True)
                c = [container(self.root)]; c[0]['HostConfig']['LogConfig'] = copy.deepcopy(lc); self.write('container.json', c)
                r = self.plan(); self.assertEqual(r.returncode, 0, r.stderr)
                spec = json.loads((self.tmp / 'plan/spec.json').read_text())
                self.assertEqual(spec['log']['driver'], lc['Type']); self.assertEqual(spec['log']['optionKeys'], sorted(lc['Config']))
                private = r.stdout + r.stderr + ''.join(f.read_text() for f in (self.tmp / 'plan').iterdir())
                for v in lc['Config'].values():
                    if len(v) > 8:
                        self.assertFalse(v in private, f'{label}: option values are never written to the plan, its scripts or the terminal')   # no haystack dump on failure
                # the flags are produced at run time from the private capture, exactly and NUL-separated
                tokens = subprocess.run(['python3', '-I', str(TOOL), 'log-args', '--spec', str(self.tmp / 'plan/spec.json'), '--inspect', str(self.inputs / 'container.json')], capture_output=True)
                self.assertEqual(tokens.returncode, 0)
                want = ['--log-driver', lc['Type']] + [t for k in sorted(lc['Config']) for t in ('--log-opt', f"{k}={lc['Config'][k]}")]
                self.assertEqual(tokens.stdout.split(b'\0')[:-1], [t.encode() for t in want])
                self.assertIn('"${LOGARGS[@]}"', (self.tmp / 'plan/02-switch.sh').read_text())

    def test_unreproducible_log_configurations_are_refused_without_leaking_values(self):
        cases = (('unknown/plugin driver', {'Type': 'acme/custom-logger', 'Config': {}}, 'cannot be reproduced'),
                 ('empty driver', {'Type': '', 'Config': {}}, 'cannot be reproduced'),
                 ('options not a map', {'Type': 'json-file', 'Config': ['max-size=10m']}, 'not a map'),
                 ('bad option key', {'Type': 'json-file', 'Config': {'bad key=1': self.SECRET}}, 'not reproducible'),
                 ('non-string value', {'Type': 'json-file', 'Config': {'max-size': 10}}, 'not reproducible'),
                 ('newline in a value', {'Type': 'json-file', 'Config': {'tag': self.SECRET + '\nINJECTED'}}, 'not reproducible'),
                 ('oversized value', {'Type': 'json-file', 'Config': {'tag': 'x' * 5000}}, 'not reproducible'))
        for label, lc, fragment in cases:
            with self.subTest(label):
                shutil.rmtree(self.tmp / 'plan', ignore_errors=True)
                c = [container(self.root)]; c[0]['HostConfig']['LogConfig'] = lc; self.write('container.json', c)
                r = self.plan(); self.assertEqual(r.returncode, 1); self.assertIn('REFUSED', r.stderr); self.assertIn(fragment, r.stderr)
                self.assertFalse(self.SECRET in r.stdout + r.stderr or 'INJECTED' in r.stdout + r.stderr, 'values are never echoed')
                self.assertFalse((self.tmp / 'plan').exists())

    def test_log_args_refuses_a_capture_that_changed_after_planning(self):
        self.assertEqual(self.plan().returncode, 0)
        c = [container(self.root)]; c[0]['HostConfig']['LogConfig'] = {'Type': 'json-file', 'Config': {'max-size': '1m'}}; self.write('container.json', c)
        r = subprocess.run(['python3', '-I', str(TOOL), 'log-args', '--spec', str(self.tmp / 'plan/spec.json'), '--inspect', str(self.inputs / 'container.json')], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1); self.assertIn('differs from the plan', r.stderr); self.assertEqual(r.stdout, '')

    def test_mount_mode_and_propagation_are_no_longer_ignored(self):
        self.refuses(lambda c, i: c['Mounts'][0].update(Propagation='rshared'), 'propagation')
        self.refuses(lambda c, i: c['Mounts'][1].update(Mode='z'), 'not reproducible')
        self.refuses(lambda c, i: c['Mounts'][2].update(Mode='rw'), 'contradicts')
        self.refuses(lambda c, i: c['Mounts'][1].update(Mode='ro'), 'contradicts')
        c = [container(self.root)]
        for m in c[0]['Mounts']: m.update(Propagation='rprivate')
        c[0]['Mounts'][2].update(Mode='ro'); self.write('container.json', c)       # what Docker really reports for `-v /var/run/docker.sock:...:ro`
        self.assertEqual(self.plan().returncode, 0)

    def test_network_modes_and_attachments_other_than_user_networks_are_refused(self):
        self.refuses(lambda c, i: c['HostConfig'].update(NetworkMode='host'), 'network mode')
        self.refuses(lambda c, i: c['HostConfig'].update(NetworkMode='container:abc'), 'network mode')
        self.refuses(lambda c, i: c['NetworkSettings']['Networks'].update(bridge={'Aliases': None, 'IPAMConfig': None, 'IPAddress': '172.17.0.2'}), 'unsupported network attachments')
        self.refuses(lambda c, i: c['NetworkSettings']['Networks'].pop('dokploy-network'), 'not attached')

    def test_network_names_and_source_version_are_not_tied_to_one_installation(self):
        c = [container(self.root)]
        c[0]['NetworkSettings']['Networks']['other-stack_default'] = c[0]['NetworkSettings']['Networks'].pop('supabase-supabase-2bvnab')
        self.write('container.json', c)
        doc = copy.deepcopy(NETS['supabase-supabase-2bvnab']); doc['Name'] = 'other-stack_default'; self.write('other.json', [doc])
        r = self.plan(networks=('dokploy-network.json', 'other.json')); self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads((self.tmp / 'plan/spec.json').read_text())['networks'], ['dokploy-network', 'other-stack_default'])
        # a network capture that does not match what is attached is still refused
        shutil.rmtree(self.tmp / 'plan'); r = self.plan(); self.assertEqual(r.returncode, 1); self.assertIn('networks differ', r.stderr)
        # another running 3.6.x needs the explicit confirmation, nothing is silently accepted
        c = [container(self.root)]; c[0]['Config']['Image'] = 'traefik:v3.6.12'; self.write('container.json', c)
        self.assertEqual(self.plan().returncode, 1)
        self.assertEqual(self.plan(extra=('--expect-source-version', '3.6.12')).returncode, 0)

    def test_settings_a_hardened_daemon_injects_are_recorded_for_verification_not_rejected(self):
        c = [container(self.root)]
        c[0]['HostConfig'].update(Init=True, SecurityOpt=['no-new-privileges'], Ulimits=[{'Name': 'nofile', 'Soft': 1024, 'Hard': 2048}])
        self.write('container.json', c)
        r = self.plan(); self.assertEqual(r.returncode, 0, r.stderr)
        spec = json.loads((self.tmp / 'plan/spec.json').read_text())
        self.assertEqual(spec['inherited'], {'init': True, 'securityOpt': ['no-new-privileges'], 'ulimits': [{'Name': 'nofile', 'Soft': 1024, 'Hard': 2048}]})
        switch = (self.tmp / 'plan/02-switch.sh').read_text()
        for flag in ('--init', '--security-opt', '--ulimit'):
            self.assertNotIn(flag, switch, 'inherited settings are verified on a probe, never guessed as flags')
        # explicit non-default settings that are NOT inheritable stay refused
        shutil.rmtree(self.tmp / 'plan')
        self.refuses(lambda c, i: c['HostConfig'].update(CapAdd=['NET_ADMIN']), 'CapAdd')

    def test_stale_transient_aliases_left_by_rename_are_not_custom_aliases(self):
        c = [container(self.root)]
        c[0]['NetworkSettings']['Networks']['dokploy-network']['Aliases'] += ['dokploy-traefik-prev-20261104T101010Z', 'dokploy-traefik-failed-20261104T101010Z']
        self.write('container.json', c)
        self.assertEqual(self.plan().returncode, 0)
        self.assertEqual(json.loads((self.tmp / 'plan/spec.json').read_text())['networkConfig']['dokploy-network']['aliases'], [])
        # a genuinely custom alias is still preserved, one that merely looks similar is not swallowed
        c[0]['NetworkSettings']['Networks']['dokploy-network']['Aliases'] += ['dokploy-traefik-prev-notatimestamp']; self.write('container.json', c)
        shutil.rmtree(self.tmp / 'plan'); self.assertEqual(self.plan().returncode, 0)
        self.assertEqual(json.loads((self.tmp / 'plan/spec.json').read_text())['networkConfig']['dokploy-network']['aliases'], ['dokploy-traefik-prev-notatimestamp'])

    def test_extra_environment_reports_names_never_values(self):
        r = self.refuses(lambda c, i: c['Config']['Env'].append('CF_API_TOKEN=super-secret-value-123'), 'CF_API_TOKEN')
        self.assertNotIn('super-secret-value-123', r.stdout + r.stderr)

    def test_target_policy(self):
        for version, digest in (('3.6.25', DIGEST), ('3.7.16', DIGEST), ('3.8.0', DIGEST), ('latest', DIGEST), ('3.7.17-rc.1', DIGEST), ('3.7.17', 'sha256:abc'), ('3.7.17', '')):
            r = self.plan(version, digest, out=self.tmp / f'p-{version}-{len(digest)}')
            self.assertEqual(r.returncode, 1, (version, digest)); self.assertIn('REFUSED', r.stderr)
        self.assertEqual(self.plan('3.7.18', DIGEST, out=self.tmp / 'p-next').returncode, 0)


class Shimmed(Base):
    def setUp(self):
        super().setUp()
        self.assertEqual(self.plan().returncode, 0)
        self.plan_dir = self.tmp / 'plan'
        self.state = self.tmp / 'state'; self.state.mkdir(mode=0o700); os.chmod(self.state, 0o700)
        self.bin = self.tmp / 'bin'; self.bin.mkdir()
        (self.bin / 'docker').symlink_to(SHIM); (self.bin / 'curl').symlink_to(CURL)
        self.shim_state = self.tmp / 'shim.json'
        self.reset()
        (self.state / 'smoke.tsv').write_text('cleanops.nuvurent.com\t/login\t200\n')

    def reset(self, **extra):
        old = container(self.root)
        st = dict(calls=[], api='1.45', containers={'dokploy-traefik': old}, routers=json.dumps(ROUTERS), canary_log=(
            'time=1 level=info msg="Configuration loaded from file: /etc/traefik/traefik.yml"\n'
            'time=2 level=error msg="Cannot connect to the Docker daemon at unix:///var/run/docker.sock" providerName=docker\n'),
            images={OLD_IMG: image(OLD_IMG, 'traefik:v3.6.7'), REF: image(NEW_IMG, REF)},
            networks=NETS, holders={'dokploy-network': {PIN: OLD_ID}}, **extra)
        self.shim_state.write_text(json.dumps(st))

    def sh(self, name, *, env=None, check=False):
        e = {'PATH': f'{self.bin}:/usr/bin:/bin', 'SHIM_STATE': str(self.shim_state), 'B1_TRAEFIK_STATE_DIR': str(self.state),
             'B1_TRAEFIK_TOOL': str(TOOL), 'B1_TRAEFIK_POLL_SECONDS': '0', 'HOME': str(self.tmp)}
        e.update(env or {})
        r = subprocess.run(['bash', str(self.plan_dir / name)], env=e, capture_output=True, text=True, timeout=120)
        if check:
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r

    def switch_calls(self):
        calls = self.snapshot()['calls']
        first = next((i for i, c in enumerate(calls) if c[0] == 'stop'), len(calls))
        return calls[first:]

    def snapshot(self):
        return json.loads(self.shim_state.read_text())

    APPROVE = {'B1_TRAEFIK_APPROVAL_REF': 'OWNER-2026-11-04:b1-traefik', 'B1_TRAEFIK_VERSION_GUARD_ACK': 'yes'}

    def test_prepare_is_non_mutating_and_makes_a_private_backup(self):
        r = self.sh('01-prepare.sh', check=True); self.assertIn('was not touched', r.stdout)
        st = self.snapshot(); verbs = [c[0] for c in st['calls']]
        self.assertFalse({'stop', 'rename', 'start', 'update'} & set(verbs), verbs)
        creates = [c for c in st['calls'] if c[0] == 'create']
        self.assertEqual(len(creates), 1, 'exactly one stopped pre-flight probe')
        self.assertEqual(creates[0][creates[0].index('--restart') + 1], 'no', 'the probe can never be started by a daemon restart')
        probe = (self.state / 'probe.name').read_text().strip()
        self.assertRegex(probe, r'^dokploy-traefik-probe-\d{8}T\d{6}Z$')
        self.assertFalse(st['containers'][probe]['State']['Running'])
        self.assertEqual(st['containers']['dokploy-traefik']['Id'], OLD_ID)
        pc = st['containers'][probe]
        self.assertEqual((pc['HostConfig']['NetworkMode'], sorted(pc['NetworkSettings']['Networks']), pc['HostConfig']['PortBindings']), ('none', ['none'], {}))
        self.assertFalse([c for c in st['calls'] if c[:2] in (['network', 'connect'], ['network', 'disconnect'])], 'prepare never touches a network')
        self.assertFalse([a for c in creates for a in c if a in ('--ip', '-p', '--network-alias')])
        self.assertEqual(st['holders']['dokploy-network'], {PIN: OLD_ID}, 'the pinned address still belongs only to the operational Traefik')
        self.assertEqual(st['containers']['dokploy-traefik']['NetworkSettings']['Networks'], container(self.root)['NetworkSettings']['Networks'], 'its endpoints are untouched')
        for name in ('traefik-config.tar', 'before.inspect.json', 'canary.log', 'prepared.ok'):
            self.assertEqual(stat.S_IMODE((self.state / name).stat().st_mode) & 0o077, 0, name)
        listing = subprocess.run(['tar', '-tf', str(self.state / 'traefik-config.tar')], capture_output=True, text=True).stdout
        self.assertIn('dynamic/acme.json', listing)
        self.assertNotIn('synthetic', r.stdout + r.stderr, 'backup contents are never printed')
        canary = next(c for c in self.snapshot()['calls'] if c[0] == 'run')
        for flag in ('--network', 'none', '--cap-drop', 'ALL', '--read-only'):
            self.assertIn(flag, canary)
        self.assertNotIn('/var/run/docker.sock', ' '.join(canary), 'the canary never receives the Docker socket')

    def test_prepare_blocks_on_drift_old_api_and_config_errors(self):
        st = self.snapshot(); st['containers']['dokploy-traefik']['Id'] = 'b' * 64; self.shim_state.write_text(json.dumps(st))
        self.assertEqual(self.sh('01-prepare.sh').returncode, 3)
        self.reset(); st = self.snapshot(); st['api'] = '1.39'; self.shim_state.write_text(json.dumps(st))
        r = self.sh('01-prepare.sh'); self.assertNotEqual(r.returncode, 0); self.assertIn('1.40', r.stderr)
        self.reset(); st = self.snapshot(); st['canary_log'] = 'level=error msg="command traefik error: field not found, node: foo"'; self.shim_state.write_text(json.dumps(st))
        r = self.sh('01-prepare.sh'); self.assertNotEqual(r.returncode, 0); self.assertFalse((self.state / 'prepared.ok').exists())

    def test_switch_requires_approval_ack_and_prepare(self):
        self.assertNotEqual(self.sh('02-switch.sh').returncode, 0)
        self.sh('01-prepare.sh', check=True)
        for env in ({}, {'B1_TRAEFIK_APPROVAL_REF': 'x'}, {'B1_TRAEFIK_APPROVAL_REF': 'OWNER-2026-11-04'}, {'B1_TRAEFIK_VERSION_GUARD_ACK': 'yes'}):
            self.assertNotEqual(self.sh('02-switch.sh', env=env).returncode, 0, env)
        self.assertFalse({'stop', 'rename'} & {c[0] for c in self.snapshot()['calls']})

    def test_successful_switch_preserves_everything_and_keeps_previous_container(self):
        self.sh('01-prepare.sh', check=True)
        r = self.sh('02-switch.sh', env=self.APPROVE, check=True); self.assertIn('SWITCH OK', r.stdout)
        st = self.snapshot(); calls = st['calls']
        first = next(i for i, c in enumerate(calls) if c[0] == 'stop')
        sigs = (['stop'], ['rename'], ['network', 'disconnect'], ['create'], ['network', 'connect'], ['start'])
        order = [next(i for i, c in enumerate(calls) if i >= first and c[:len(sg)] == sg) for sg in sigs]
        self.assertEqual(order, sorted(order), 'stop -> rename -> disconnect (release pinned IP) -> create --ip -> connect -> start')
        create = calls[order[3]]; self.assertEqual(create[create.index('--ip') + 1], PIN)
        self.assertEqual([c for c in calls if c[:2] == ['network', 'disconnect']], [['network', 'disconnect', 'dokploy-network', st['switch_prev']]] if 'switch_prev' in st else [c for c in calls if c[:2] == ['network', 'disconnect']])
        connects = [c for c in self.switch_calls() if c[:2] == ['network', 'connect']]
        self.assertEqual(len(connects), 1); self.assertNotIn('--ip', connects[0], 'the dynamic network is never pinned')
        self.assertFalse(any(c[0] in ('rm', 'service') or c[:2] == ['system', 'prune'] for c in calls))
        new, prev = st['containers']['dokploy-traefik'], next(v for k, v in st['containers'].items() if k.startswith('dokploy-traefik-prev-'))
        self.assertEqual(prev['Id'], OLD_ID); self.assertEqual(prev['HostConfig']['RestartPolicy']['Name'], 'no'); self.assertFalse(prev['State']['Running'])
        self.assertNotEqual(new['Id'], OLD_ID); self.assertTrue(new['State']['Running'])
        old = container(self.root)
        self.assertEqual(new['HostConfig']['PortBindings'], old['HostConfig']['PortBindings'])
        self.assertEqual(sorted((m['Source'], m['Destination'], m['RW']) for m in new['Mounts']), sorted((m['Source'], m['Destination'], m['RW']) for m in old['Mounts']))
        self.assertEqual(set(new['NetworkSettings']['Networks']), set(old['NetworkSettings']['Networks']))
        dk, sb = new['NetworkSettings']['Networks']['dokploy-network'], new['NetworkSettings']['Networks']['supabase-supabase-2bvnab']
        self.assertEqual((dk['IPAMConfig'], dk['IPAddress']), ({'IPv4Address': PIN}, PIN))          # the same address, still pinned
        self.assertFalse(sb['IPAMConfig'], 'the automatically assigned address of the other network is not pinned')
        self.assertEqual(st['holders']['dokploy-network'], {PIN: new['Id']})
        self.assertNotIn('dokploy-network', prev['NetworkSettings']['Networks'], 'the kept container no longer reserves the address')
        self.assertIn('supabase-supabase-2bvnab', prev['NetworkSettings']['Networks'])
        self.assertEqual(new['HostConfig']['RestartPolicy']['Name'], 'always'); self.assertEqual(new['Config']['Image'], REF)
        # a later read-only verification passes and compare rejects a dropped network
        self.sh('03-verify.sh', check=True)
        unpinned = copy.deepcopy(new); unpinned['NetworkSettings']['Networks']['dokploy-network'].update(IPAMConfig=None)
        (self.tmp / 'unpinned.json').write_text(json.dumps([unpinned]))
        r = subprocess.run(['python3', '-I', str(TOOL), 'compare', '--spec', str(self.plan_dir / 'spec.json'), '--inspect', str(self.tmp / 'unpinned.json'),
                            '--image', str(self.state / 'new.image.json'), '--mode', 'after'], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1); self.assertIn('networkConfig', r.stderr)
        broken = copy.deepcopy(new); broken['NetworkSettings']['Networks'].pop('supabase-supabase-2bvnab')
        (self.tmp / 'broken.json').write_text(json.dumps([broken]))
        r = subprocess.run(['python3', '-I', str(TOOL), 'compare', '--spec', str(self.plan_dir / 'spec.json'), '--inspect', str(self.tmp / 'broken.json'),
                            '--image', str(self.state / 'new.image.json'), '--mode', 'after'], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1); self.assertIn('networks', r.stderr)

    def test_failed_candidate_rolls_back_automatically_to_the_exact_original(self):
        self.sh('01-prepare.sh', check=True)
        st = self.snapshot(); st['fail_start'] = True; self.shim_state.write_text(json.dumps(st))
        r = self.sh('02-switch.sh', env=self.APPROVE); self.assertNotEqual(r.returncode, 0); self.assertIn('automatic rollback', r.stderr)
        self.assertIn('ROLLBACK OK', r.stdout); self.assertNotIn('ROLLBACK ALSO FAILED', r.stderr)   # including its own verification of the original
        st = self.snapshot(); live = st['containers']['dokploy-traefik']
        self.assertEqual(live['Id'], OLD_ID); self.assertEqual(live['Image'], OLD_IMG)
        self.assertEqual(live['HostConfig']['RestartPolicy']['Name'], 'always'); self.assertTrue(live['State']['Running'])
        failed = [k for k in st['containers'] if k.startswith('dokploy-traefik-failed-')]
        self.assertEqual(len(failed), 1); self.assertEqual(st['containers'][failed[0]]['HostConfig']['RestartPolicy']['Name'], 'no')
        self.assertFalse([k for k in st['containers'] if '-prev-' in k])

    def fault(self, cmd, effect=False):
        st = self.snapshot(); st['fail_on'] = [{'cmd': cmd, 'effect': effect}]; self.shim_state.write_text(json.dumps(st))

    def assert_original_restored(self, failed_candidates=0):
        st = self.snapshot(); live = st['containers'].get('dokploy-traefik')
        self.assertIsNotNone(live, list(st['containers']))
        self.assertEqual((live['Id'], live['Image']), (OLD_ID, OLD_IMG))
        self.assertEqual(live['HostConfig']['RestartPolicy']['Name'], 'always'); self.assertTrue(live['State']['Running'])
        self.assertEqual([k for k in st['containers'] if '-prev-' in k], [])
        dk = live['NetworkSettings']['Networks']['dokploy-network']
        self.assertEqual((dk['IPAMConfig'], dk['IPAddress']), ({'IPv4Address': PIN}, PIN), 'the original owns its exact pinned address again')
        self.assertFalse(live['NetworkSettings']['Networks']['supabase-supabase-2bvnab']['IPAMConfig'])
        self.assertEqual(st['holders']['dokploy-network'], {PIN: OLD_ID}, 'no other holder keeps the address')
        failed = [k for k in st['containers'] if '-failed-' in k]
        self.assertEqual(len(failed), failed_candidates)
        for k in failed:
            self.assertEqual(st['containers'][k]['HostConfig']['RestartPolicy']['Name'], 'no'); self.assertFalse(st['containers'][k]['State']['Running'])
        self.assertFalse(any(c[0] in ('rm', 'service') for c in st['calls']), 'nothing is ever deleted')

    def test_failure_before_the_rename_recovers_the_original_in_place(self):
        """The ERR trap is armed before stop/update/rename: PREV does not exist yet, the original must still be recovered."""
        cases = {
            'stop fails, nothing changed': (['stop'], False),
            'stop fails after the container was stopped': (['stop'], True),
            'restart-policy update fails, nothing changed': (['update'], False),
            'restart-policy update fails after restart=no was applied': (['update'], True),
            'rename fails, nothing renamed': (['rename'], False),
            'rename fails after the container was renamed to PREV': (['rename'], True),
        }
        for label, (cmd, effect) in cases.items():
            with self.subTest(label):
                self.reset(); (self.state / 'prepared.ok').unlink(missing_ok=True)
                self.sh('01-prepare.sh', check=True); self.fault(cmd, effect)
                r = self.sh('02-switch.sh', env=self.APPROVE)
                self.assertNotEqual(r.returncode, 0); self.assertIn('automatic rollback', r.stderr); self.assertNotIn('ROLLBACK ALSO FAILED', r.stderr)
                self.assertIn('ROLLBACK OK', r.stdout)
                self.assert_original_restored()
                self.assertNotIn('create', [c[0] for c in self.switch_calls()], 'no candidate may be created before the original is safely renamed')

    def test_failure_after_the_rename_still_recovers(self):
        for label, cmd, failed in (('create fails', ['create'], 0), ('network connect fails', ['network', 'connect'], 1), ('start fails', ['start'], 1)):
            with self.subTest(label):
                self.reset(); (self.state / 'prepared.ok').unlink(missing_ok=True)
                self.sh('01-prepare.sh', check=True); self.fault(cmd)
                r = self.sh('02-switch.sh', env=self.APPROVE)
                self.assertNotEqual(r.returncode, 0); self.assertIn('ROLLBACK OK', r.stdout)
                self.assert_original_restored(failed_candidates=failed)

    def test_switch_state_records_the_phase_and_rollback_is_idempotent(self):
        self.sh('01-prepare.sh', check=True); self.fault(['rename'])
        self.assertNotEqual(self.sh('02-switch.sh', env=self.APPROVE).returncode, 0)
        self.assertIn('PHASE=restart-disabled', (self.state / 'switch.state').read_text())
        before = json.dumps(self.snapshot()['containers'], sort_keys=True)
        self.sh('rollback.sh', check=True)       # second run on an already recovered system changes nothing material
        self.assert_original_restored()
        self.assertEqual(json.loads(before).keys(), self.snapshot()['containers'].keys())


    # ---- pinned address on a swarm-scoped network: release, wait, conflicts and recovery of the kept container ----
    def switch_fails(self, shim_edit, env=None, tries='3'):
        self.sh('01-prepare.sh', check=True)
        st = self.snapshot(); shim_edit(st); self.shim_state.write_text(json.dumps(st))
        e = dict(self.APPROVE, B1_TRAEFIK_IP_WAIT_TRIES=tries, B1_TRAEFIK_ROLLBACK_IP_WAIT_TRIES=tries); e.update(env or {})
        return self.sh('02-switch.sh', env=e)

    def test_prepare_accepts_the_real_double_representation_of_the_original_endpoint(self):
        """VPS evidence: the pinned address shows up in Containers AND in Services.Tasks (same EndpointID, empty ContainerID)."""
        r = self.sh('01-prepare.sh'); self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        seen = json.loads((self.state / 'net.inspect.json').read_text())[0]
        cont = seen['Containers'][OLD_ID]; tasks = [t for sv in seen['Services'].values() for t in sv['Tasks']]
        self.assertEqual(len(tasks), 1); self.assertEqual(tasks[0]['EndpointID'], cont['EndpointID']); self.assertEqual(tasks[0]['ContainerID'], '')
        self.assertIn('mirrored task entry', r.stdout)

    def test_prepare_still_refuses_another_container_or_task_on_the_pinned_address(self):
        for label, edit in (('another task', lambda st: st.update(foreign={'dokploy-network': {PIN: 'other-service'}})),
                            ('another container instead of the original', lambda st: (st['containers'].update(intruder={'Id': 'b' * 64, 'Name': '/intruder', 'State': {'Running': True}}),
                                                                                        st['holders']['dokploy-network'].update({PIN: 'b' * 64})))):
            with self.subTest(label):
                self.reset(); (self.state / 'prepared.ok').unlink(missing_ok=True)
                st = self.snapshot(); edit(st); self.shim_state.write_text(json.dumps(st))
                r = self.sh('01-prepare.sh'); self.assertEqual(r.returncode, 3, r.stdout + r.stderr); self.assertIn('held by something other', r.stderr)
                self.assertFalse((self.state / 'prepared.ok').exists())

    def test_only_prepare_may_ignore_the_original_and_never_after_it_was_disconnected(self):
        prepare, switch, rollback = [(self.plan_dir / n).read_text() for n in ('01-prepare.sh', '02-switch.sh', 'rollback.sh')]
        self.assertIn('--ignore-container "$OLD_ID"', prepare); self.assertNotIn('--ignore-container', switch); self.assertNotIn('--ignore-container', rollback)

    def test_a_residual_endpoint_of_the_original_after_disconnect_is_not_ignored(self):
        """After `network disconnect` the address must be OBSERVED free: even the original's own lingering endpoint is an occupant."""
        r = self.switch_fails(lambda st: st.update(stuck={'dokploy-network': {PIN: 'owner'}}))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('held by: container dokploy-traefik', r.stderr, 'the residual endpoint was reported, not ignored')
        self.assertIn('ROLLBACK OK', r.stdout); self.assert_original_restored()
        self.assertFalse([c for c in self.switch_calls() if c[0] == 'create'], 'no candidate was created while the address was still reported held')

    def test_prepare_refuses_when_someone_else_holds_the_pinned_address(self):
        st = self.snapshot(); st['foreign'] = {'dokploy-network': {PIN: 'other-service'}}; self.shim_state.write_text(json.dumps(st))
        r = self.sh('01-prepare.sh'); self.assertEqual(r.returncode, 3); self.assertIn('held by something other', r.stderr)
        self.assertFalse((self.state / 'prepared.ok').exists())

    def test_probe_never_competes_even_with_a_daemon_that_reserves_at_create(self):
        """Not proven for swarm-scoped networks whether `docker create --ip/-p` reserves the address/ports; the probe must not depend on it."""
        st = self.snapshot(); st['create_reserves_ip'] = True; st['create_reserves_ports'] = True; st['ports_taken'] = ['80/tcp', '443/tcp', '443/udp']
        self.shim_state.write_text(json.dumps(st))
        r = self.sh('01-prepare.sh'); self.assertEqual(r.returncode, 0, r.stderr)
        st = self.snapshot(); self.assertEqual(st['holders']['dokploy-network'], {PIN: OLD_ID})
        self.assertEqual(st['ports_taken'], ['80/tcp', '443/tcp', '443/udp'])
        # control: the OLD probe shape (same --ip / -p as the switch) is rejected by such a daemon, which is exactly what must be avoided
        plan = json.loads((self.plan_dir / 'spec.json').read_text())
        bad = subprocess.run(['docker', 'create', '--name', 'old-design-probe', '--network', 'dokploy-network', '--ip', PIN, '-p', '80:80/tcp', REF],
                             env={'PATH': f'{self.bin}:/usr/bin:/bin', 'SHIM_STATE': str(self.shim_state)}, capture_output=True, text=True)
        self.assertNotEqual(bad.returncode, 0); self.assertIn('already', bad.stderr); self.assertEqual(plan['networkConfig']['dokploy-network']['staticIPv4'], PIN)

    def test_probe_checker_refuses_a_probe_that_could_compete(self):
        self.sh('01-prepare.sh', check=True)
        probe = json.loads((self.state / 'probe.inspect.json').read_text())[0]
        def check(mutated):
            f = self.tmp / 'probe-mut.json'; f.write_text(json.dumps([mutated]))
            return subprocess.run(['python3', '-I', str(TOOL), 'compare', '--spec', str(self.plan_dir / 'spec.json'), '--inspect', str(f),
                                   '--image', str(self.state / 'new.image.json'), '--mode', 'probe'], capture_output=True, text=True)
        self.assertEqual(check(probe).returncode, 0, check(probe).stderr)
        cases = {}
        p1 = copy.deepcopy(probe); p1['HostConfig']['PortBindings'] = {'80/tcp': [{'HostIp': '', 'HostPort': '80'}]}; cases['publishes a port'] = (p1, 'publishes ports')
        p2 = copy.deepcopy(probe); p2['HostConfig']['NetworkMode'] = 'dokploy-network'; cases['network mode'] = (p2, 'attached to a network')
        p3 = copy.deepcopy(probe); p3['NetworkSettings']['Networks'] = {'dokploy-network': {'Aliases': [], 'IPAMConfig': {'IPv4Address': PIN}, 'IPAddress': ''}}
        cases['endpoint with the pinned address'] = (p3, 'attached to a network')
        p4 = copy.deepcopy(probe); p4['HostConfig']['RestartPolicy']['Name'] = 'always'; cases['restart always'] = (p4, 'restart policy')
        p5 = copy.deepcopy(probe); p5['HostConfig']['LogConfig'] = {'Type': 'json-file', 'Config': {'max-size': '1k'}}; cases['different log'] = (p5, 'WOULD NOT PRESERVE')
        p6 = copy.deepcopy(probe); p6['State']['Running'] = True; cases['running'] = (p6, 'stopped container')
        for label, (mut, fragment) in cases.items():
            with self.subTest(label):
                r = check(mut); self.assertEqual(r.returncode, 1); self.assertIn(fragment, r.stderr)

    def test_slow_release_after_disconnect_is_waited_for(self):
        self.sh('01-prepare.sh', check=True)
        st = self.snapshot(); st['slow_release'] = {'dokploy-network': {PIN: 3}}; self.shim_state.write_text(json.dumps(st))
        r = self.sh('02-switch.sh', env=dict(self.APPROVE, B1_TRAEFIK_IP_WAIT_TRIES='10')); self.assertEqual(r.returncode, 0, r.stderr)
        calls = self.snapshot()['calls']; cut = next(i for i, c in enumerate(calls) if c[:2] == ['network', 'disconnect'])
        self.assertGreaterEqual(len([c for c in calls[cut:] if c[:2] == ['network', 'inspect']]), 3, 'it polled until the reservation went away')
        self.assertEqual(self.snapshot()['holders']['dokploy-network'], {PIN: self.snapshot()['containers']['dokploy-traefik']['Id']})

    def test_reservation_that_outlives_the_switch_window_but_not_the_rollback_window(self):
        r = self.switch_fails(lambda st: st.update(slow_release={'dokploy-network': {PIN: 4}}), tries='3',
                              env={'B1_TRAEFIK_IP_WAIT_TRIES': '2', 'B1_TRAEFIK_ROLLBACK_IP_WAIT_TRIES': '10'})
        self.assertNotEqual(r.returncode, 0); self.assertIn('ROLLBACK OK', r.stdout)
        self.assert_original_restored()
        st = self.snapshot(); self.assertFalse([c for c in self.switch_calls() if c[0] == 'create'], 'the candidate was never created')
        reconnect = [c for c in self.switch_calls() if c[:2] == ['network', 'connect']]
        self.assertEqual(reconnect, [['network', 'connect', '--ip', PIN, 'dokploy-network', OLD_ID]], 'the original is re-attached with its exact pinned address')

    def test_reservation_that_never_goes_away_leaves_the_original_intact_and_recoverable(self):
        r = self.switch_fails(lambda st: st.update(stuck={'dokploy-network': {PIN: True}}))
        self.assertNotEqual(r.returncode, 0); self.assertIn('ROLLBACK ALSO FAILED', r.stderr); self.assertIn('ORIGINAL COULD NOT START', r.stderr)
        st = self.snapshot(); live = st['containers']['dokploy-traefik']
        self.assertEqual((live['Id'], live['Image']), (OLD_ID, OLD_IMG)); self.assertFalse(live['State']['Running'])
        self.assertEqual(live['HostConfig']['RestartPolicy']['Name'], 'always')
        self.assertEqual(live['NetworkSettings']['Networks']['dokploy-network']['IPAMConfig'], {'IPv4Address': PIN}, 'endpoint already restored')
        self.assertFalse([c for c in self.switch_calls() if c[0] in ('rm', 'create')])
        # once the cluster lets go of the address, the same generated rollback finishes the job
        st['stuck'] = {}; st['holders']['dokploy-network'] = {}; st['ghost_polls'] = {}; self.shim_state.write_text(json.dumps(st))
        self.sh('rollback.sh', check=True); self.assert_original_restored()

    def test_address_taken_by_another_task_before_the_candidate_starts(self):
        r = self.switch_fails(lambda st: st.update(foreign_on_start='other-service'))
        self.assertNotEqual(r.returncode, 0); self.assertIn('Address already in use', r.stderr)
        self.assertIn('ORIGINAL COULD NOT START', r.stderr)
        st = self.snapshot(); failed = [k for k in st['containers'] if '-failed-' in k]
        self.assertEqual(len(failed), 1, 'the candidate is kept aside, never deleted')
        cand = st['containers'][failed[0]]
        self.assertFalse(cand['State']['Running']); self.assertEqual(cand['HostConfig']['RestartPolicy']['Name'], 'no')
        self.assertNotIn('dokploy-network', cand['NetworkSettings']['Networks'], 'the candidate gave its pinned endpoint back')
        live = st['containers']['dokploy-traefik']; self.assertEqual(live['Id'], OLD_ID); self.assertFalse(live['State']['Running'])
        st['foreign'] = {}; self.shim_state.write_text(json.dumps(st))      # the other task goes away
        self.sh('rollback.sh', check=True); self.assert_original_restored(failed_candidates=1)

    def test_disconnect_failures_recover_the_original_endpoint(self):
        for label, effect in (('disconnect fails, nothing changed', False), ('disconnect fails after the endpoint was removed', True)):
            with self.subTest(label):
                self.reset(); (self.state / 'prepared.ok').unlink(missing_ok=True)
                self.sh('01-prepare.sh', check=True); self.fault(['network', 'disconnect'], effect)
                r = self.sh('02-switch.sh', env=self.APPROVE)
                self.assertNotEqual(r.returncode, 0); self.assertIn('ROLLBACK OK', r.stdout); self.assert_original_restored()
                self.assertFalse([c for c in self.switch_calls() if c[0] == 'create'])

    def test_release_is_explicit_when_stop_does_not_free_the_address(self):
        """sticky_stop: the stopped container keeps its reservation; only `network disconnect` frees it."""
        self.sh('01-prepare.sh', check=True)
        st = self.snapshot(); st['sticky_stop'] = True; self.shim_state.write_text(json.dumps(st))
        self.sh('02-switch.sh', env=self.APPROVE, check=True)
        st = self.snapshot(); self.assertEqual(st['holders']['dokploy-network'], {PIN: st['containers']['dokploy-traefik']['Id']})
        # and the failure path under the same condition still returns the address to the original
        self.reset(sticky_stop=True); (self.state / 'prepared.ok').unlink(missing_ok=True)
        r = self.switch_fails(lambda s: s.update(fail_start=True), tries='3')
        self.assertIn('ROLLBACK OK', r.stdout); self.assert_original_restored(failed_candidates=1)


    # ---- LogConfig and daemon-inherited settings: preservation, pre-flight probe, switch and rollback ----
    ROTATION = {'Type': 'json-file', 'Config': {'max-size': '10m', 'max-file': '3'}}
    SPLUNK = {'Type': 'splunk', 'Config': {'splunk-url': 'https://splunk.example:8088', 'splunk-token': LOG_SECRET}}

    def adopt(self, mutate, **shim):
        """Plan from a different (synthetic) capture and make the simulated daemon hold exactly that container."""
        c = container(self.root); mutate(c)
        self.write('container.json', [c]); shutil.rmtree(self.plan_dir)
        r = self.plan(); self.assertEqual(r.returncode, 0, r.stderr)
        for name in ('prepared.ok', 'switch.state'): (self.state / name).unlink(missing_ok=True)
        self.reset(**shim); st = self.snapshot(); st['containers']['dokploy-traefik'] = c; self.shim_state.write_text(json.dumps(st))
        return c

    def private_text(self, *results):
        return ''.join(r.stdout + r.stderr for r in results) + ''.join(f.read_text() for f in self.plan_dir.iterdir())

    def test_log_configuration_is_preserved_exactly_by_the_switch_and_never_printed(self):
        for label, lc in (('rotation options', self.ROTATION), ('driver carrying a credential', self.SPLUNK)):
            with self.subTest(label):
                self.adopt(lambda c: c['HostConfig'].update(LogConfig=copy.deepcopy(lc)))
                r1 = self.sh('01-prepare.sh', check=True); r2 = self.sh('02-switch.sh', env=self.APPROVE, check=True)
                st = self.snapshot(); new = st['containers']['dokploy-traefik']
                self.assertEqual(new['HostConfig']['LogConfig'], lc, 'the candidate runs with the exact driver and options')
                probe = st['containers'][(self.state / 'probe.name').read_text().strip()]
                self.assertEqual(probe['HostConfig']['LogConfig'], lc)
                create = next(c for c in self.switch_calls() if c[0] == 'create')
                self.assertEqual(create[create.index('--log-driver') + 1], lc['Type'])
                self.assertFalse(LOG_SECRET in self.private_text(r1, r2), 'option values are in neither the output nor the generated scripts')
                self.assertEqual(stat.S_IMODE((self.state / 'log.args').stat().st_mode) & 0o077, 0, 'the only copy of the options is private')

    def test_log_configuration_survives_a_failed_switch_and_its_rollback(self):
        self.adopt(lambda c: c['HostConfig'].update(LogConfig=copy.deepcopy(self.SPLUNK)))
        r = self.switch_fails(lambda st: st.update(fail_start=True), tries='3')
        self.assertIn('ROLLBACK OK', r.stdout); self.assert_original_restored(failed_candidates=1)
        st = self.snapshot()
        self.assertEqual(st['containers']['dokploy-traefik']['HostConfig']['LogConfig'], self.SPLUNK, 'the original keeps its own configuration')
        failed = next(v for k, v in st['containers'].items() if '-failed-' in k)
        self.assertEqual(failed['HostConfig']['LogConfig'], self.SPLUNK)
        self.assertFalse(LOG_SECRET in self.private_text(r))

    def test_preflight_probe_stops_everything_when_the_daemon_would_not_reproduce_the_container(self):
        for label, daemon in (('the daemon injects init', {'Init': True}), ('the daemon injects security options', {'SecurityOpt': ['no-new-privileges']}),
                              ('the daemon injects a ulimit', {'Ulimits': [{'Name': 'nofile', 'Soft': 1, 'Hard': 2}]})):
            with self.subTest(label):
                self.adopt(lambda c: None, daemon_hostconfig=daemon)
                r = self.sh('01-prepare.sh'); self.assertNotEqual(r.returncode, 0)
                self.assertIn('WOULD NOT PRESERVE', r.stderr); self.assertIn('inherited', r.stderr)
                self.assertFalse((self.state / 'prepared.ok').exists())
                self.assertEqual(self.sh('02-switch.sh', env=self.APPROVE).returncode != 0, True, 'the switch refuses to start without a passing prepare')
                self.assertFalse({'stop', 'rename', 'update', 'start'} & {c[0] for c in self.snapshot()['calls']}, 'no downtime was caused')

    def test_hardened_daemon_defaults_are_accepted_when_the_probe_proves_they_match(self):
        hard = {'Init': True, 'SecurityOpt': ['no-new-privileges'], 'Ulimits': [{'Name': 'nofile', 'Soft': 1024, 'Hard': 2048}]}
        self.adopt(lambda c: c['HostConfig'].update(copy.deepcopy(hard)), daemon_hostconfig=copy.deepcopy(hard))
        self.sh('01-prepare.sh', check=True); self.sh('02-switch.sh', env=self.APPROVE, check=True)
        new = self.snapshot()['containers']['dokploy-traefik']
        for k, v in hard.items(): self.assertEqual(new['HostConfig'][k], v)

    def test_an_option_the_daemon_rejects_is_found_before_any_downtime(self):
        self.adopt(lambda c: c['HostConfig'].update(LogConfig=copy.deepcopy(self.ROTATION)), reject_create_with='--log-opt')
        r = self.sh('01-prepare.sh'); self.assertNotEqual(r.returncode, 0); self.assertIn('unsupported option', r.stderr)
        self.assertFalse((self.state / 'prepared.ok').exists())
        self.assertFalse({'stop', 'rename', 'update', 'start'} & {c[0] for c in self.snapshot()['calls']})

    def test_the_probe_is_left_stopped_with_restart_no_and_never_owns_the_pinned_address(self):
        self.sh('01-prepare.sh', check=True); self.sh('02-switch.sh', env=self.APPROVE, check=True)
        st = self.snapshot(); probe = st['containers'][(self.state / 'probe.name').read_text().strip()]
        self.assertFalse(probe['State']['Running']); self.assertEqual(probe['HostConfig']['RestartPolicy']['Name'], 'no')
        self.assertNotIn(probe['Id'], st['holders']['dokploy-network'].values())
        self.assertFalse(any(c[0] in ('rm', 'service') for c in st['calls']), 'the probe is never deleted by the procedure')

    def test_verification_waits_for_providers_to_rebuild_their_routers(self):
        self.sh('01-prepare.sh', check=True)
        st = self.snapshot(); st['routers_lag'] = 3; self.shim_state.write_text(json.dumps(st))
        r = self.sh('02-switch.sh', env=self.APPROVE); self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.snapshot()['routers_lag'], 0, 'it polled until the routers were back instead of rolling back')

    def test_routers_that_never_come_back_still_roll_back(self):
        r = self.switch_fails(lambda st: st.update(routers_lag=4), env={'B1_TRAEFIK_VERIFY_TRIES': '3'})
        self.assertNotEqual(r.returncode, 0); self.assertIn('router baseline not restored', r.stderr); self.assertIn('ROLLBACK OK', r.stdout)
        self.assert_original_restored(failed_candidates=1)

    def test_router_change_after_switch_is_detected_and_rolled_back(self):
        self.sh('01-prepare.sh', check=True)
        st = self.snapshot(); changed = copy.deepcopy(ROUTERS); changed[0]['rule'] = 'Host(`evil.example`)'
        st['routers_after'] = json.dumps(changed); self.shim_state.write_text(json.dumps(st))
        # shim switches the router answer once the candidate is the live container
        shim = SHIM.read_text().replace("out(st['routers'])", "out(st.get('routers_after') if st['containers'].get('dokploy-traefik', {}).get('Id') != 'a' * 64 and 'routers_after' in st else st['routers'])")
        patched = self.tmp / 'shim_patched.py'; patched.write_text(shim); patched.chmod(0o755)
        (self.bin / 'docker').unlink(); (self.bin / 'docker').symlink_to(patched)
        r = self.sh('02-switch.sh', env=self.APPROVE); self.assertNotEqual(r.returncode, 0)
        self.assertIn('ROUTERS CHANGED', r.stderr)
        self.assertEqual(self.snapshot()['containers']['dokploy-traefik']['Id'], OLD_ID)


class Helpers(Base):
    def run_tool(self, *args):
        return subprocess.run(['python3', '-I', str(TOOL), *args], capture_output=True, text=True)

    def test_routers_diff(self):
        a, b = self.tmp / 'a.json', self.tmp / 'b.json'
        a.write_text(json.dumps(ROUTERS)); b.write_text(json.dumps(ROUTERS + [dict(ROUTERS[0], name='new@file')]))
        self.assertEqual(self.run_tool('routers-diff', str(a), str(b)).returncode, 0)
        b.write_text(json.dumps([dict(ROUTERS[0], middlewares=['x@file'])])); self.assertEqual(self.run_tool('routers-diff', str(a), str(b)).returncode, 1)
        b.write_text('[]'); self.assertEqual(self.run_tool('routers-diff', str(a), str(b)).returncode, 1)

    # ---- ip-check: one real endpoint is reported twice (Containers and Services.Tasks); only THAT endpoint may be ignored ----
    IP_OWNER = 'a' * 64                       # the authorised original (full container id)
    EP = '68f01b00ca08' + 'c' * 52            # its full EndpointID (synthetic)
    OTHER = 'b' * 64

    def netdoc(self, containers=None, services=None):
        return {'Name': 'dokploy-network', 'Containers': containers, 'Services': services}

    def real_like(self):
        """What the VPS reported: the same endpoint as a container AND as a task with an empty ContainerID."""
        return self.netdoc({self.IP_OWNER: {'Name': 'dokploy-traefik', 'EndpointID': self.EP, 'IPv4Address': '10.0.1.11/24'}},
                           {'dokploy-traefik': {'VIP': '', 'Tasks': [{'Name': 'dokploy-traefik', 'EndpointID': self.EP, 'EndpointIP': '10.0.1.11/24', 'ContainerID': ''}]}})

    def ipc(self, doc, *extra, ip='10.0.1.11', raw=None):
        f = self.tmp / 'ipc.json'; f.write_text(raw if raw is not None else json.dumps([doc]))
        return self.run_tool('ip-check', str(f), ip, *extra)

    def test_ip_check_ignores_only_the_authorised_endpoint_seen_twice(self):
        own = ('--ignore-container', self.IP_OWNER)
        r = self.ipc(self.real_like(), *own); self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('only the authorised container endpoint was ignored, including 1 mirrored task entry', r.stdout)
        # once the original has been disconnected nothing may be ignored: the very same view is a holder
        r = self.ipc(self.real_like()); self.assertEqual(r.returncode, 1); self.assertIn('dokploy-traefik', r.stderr)
        # the container representation alone, and several mirrors of the same endpoint, are fine
        doc = self.real_like(); doc['Services'] = None; self.assertEqual(self.ipc(doc, *own).returncode, 0)
        doc = self.real_like(); doc['Services']['dokploy-traefik']['Tasks'].append(dict(doc['Services']['dokploy-traefik']['Tasks'][0])); self.assertEqual(self.ipc(doc, *own).returncode, 0)
        # entries on other addresses never matter, nor does a free address
        doc = self.real_like(); doc['Containers'][self.OTHER] = {'Name': 'x', 'EndpointID': 'd' * 64, 'IPv4Address': '10.0.1.12/24'}
        self.assertEqual(self.ipc(doc, *own).returncode, 0); self.assertEqual(self.ipc(doc, ip='10.0.1.99').returncode, 0)

    def test_ip_check_still_refuses_anything_else_holding_the_address(self):
        own = ('--ignore-container', self.IP_OWNER)
        cases = {}
        d = self.real_like(); d['Containers'][self.OTHER] = {'Name': 'intruder', 'EndpointID': 'd' * 64, 'IPv4Address': '10.0.1.11/24'}; cases['another container'] = (d, 'intruder')
        d = self.real_like(); d['Containers'][self.OTHER] = {'Name': 'dokploy-traefik', 'EndpointID': self.EP, 'IPv4Address': '10.0.1.11/24'}
        cases['another container id with the SAME endpoint id and name'] = (d, 'dokploy-traefik')
        d = self.real_like(); d['Services']['other'] = {'VIP': '', 'Tasks': [{'Name': 'other.1', 'EndpointID': 'e' * 64, 'EndpointIP': '10.0.1.11/24', 'ContainerID': ''}]}; cases['another task'] = (d, 'other.1')
        d = self.real_like(); d['Services']['dokploy-traefik']['Tasks'].append({'Name': 'dokploy-traefik', 'EndpointID': 'f' * 64, 'EndpointIP': '10.0.1.11/24', 'ContainerID': ''})
        cases['a task with the same NAME but another endpoint (never deduplicated by name)'] = (d, 'dokploy-traefik')
        d = self.real_like(); d['Services']['dokploy-traefik']['Tasks'][0]['EndpointID'] = self.EP[:12] + 'e' * 52; cases['endpoint id equal only in its first 12 characters'] = (d, 'dokploy-traefik')
        d = self.real_like(); d['Services']['dokploy-traefik']['Tasks'][0]['EndpointID'] = self.EP.upper(); cases['endpoint id differing in case'] = (d, 'dokploy-traefik')
        d = self.real_like(); d['Services']['dokploy-traefik']['Tasks'][0]['ContainerID'] = self.OTHER; cases['same endpoint id but claimed by another container'] = (d, 'dokploy-traefik')
        d = self.real_like(); del d['Services']['dokploy-traefik']['Tasks'][0]['EndpointID']; cases['task without endpoint id'] = (d, 'dokploy-traefik')
        d = self.real_like(); d['Services']['dokploy-traefik']['Tasks'][0]['EndpointID'] = None; cases['task with a null endpoint id'] = (d, 'dokploy-traefik')
        d = self.real_like(); d['Services']['vip'] = {'VIP': '10.0.1.11/24', 'Tasks': []}; cases['a service VIP'] = (d, 'service VIP vip')
        d = self.real_like(); d['Containers'] = {}; cases['task whose container entry is absent (cannot prove it is the original)'] = (d, 'dokploy-traefik')
        for label, (doc, who) in cases.items():
            with self.subTest(label):
                r = self.ipc(doc, *own); self.assertEqual(r.returncode, 1, r.stdout + r.stderr); self.assertIn(who, r.stderr)

    def test_ip_check_handles_missing_or_inconsistent_fields_safely(self):
        own = ('--ignore-container', self.IP_OWNER)
        # the authorised entry cannot prove which endpoint it is: unusable (2), never silently ignored
        for label, mutate in (('missing endpoint id', lambda d: d['Containers'][self.IP_OWNER].pop('EndpointID')),
                              ('empty endpoint id', lambda d: d['Containers'][self.IP_OWNER].update(EndpointID='')),
                              ('short endpoint id', lambda d: d['Containers'][self.IP_OWNER].update(EndpointID='68f01b00ca08')),
                              ('non-string endpoint id', lambda d: d['Containers'][self.IP_OWNER].update(EndpointID=12345)),
                              ('containers is a list', lambda d: d.update(Containers=[])),
                              ('services is a list', lambda d: d.update(Services=[])),
                              ('a container entry is not a map', lambda d: d['Containers'].update({self.OTHER: 'x'})),
                              ('a service entry is not a map', lambda d: d['Services'].update(bad='x')),
                              ('tasks is not a list', lambda d: d['Services']['dokploy-traefik'].update(Tasks={})),
                              ('a task is not a map', lambda d: d['Services']['dokploy-traefik']['Tasks'].append('x'))):
            with self.subTest(label):
                d = self.real_like(); mutate(d); r = self.ipc(d, *own); self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        # missing optional fields on entries that are not on this address simply do not match; unrelated gaps are not holders
        d = self.real_like(); d['Containers'][self.OTHER] = {'Name': 'x'}; d['Services']['dokploy-traefik']['Tasks'].append({'Name': 'y'})
        self.assertEqual(self.ipc(d, *own).returncode, 0)
        d = self.real_like(); d['Services']['dokploy-traefik']['Tasks'][0].pop('ContainerID'); self.assertEqual(self.ipc(d, *own).returncode, 0)
        # no ignore requested: Services/Containers may be absent altogether (free address)
        self.assertEqual(self.ipc({'Name': 'n'}).returncode, 0)
        # unreadable input is never "free"
        for raw in ('', 'not json', '"str"', '[]', 'null'):
            with self.subTest(raw): self.assertEqual(self.ipc(None, raw=raw).returncode, 2)
        self.assertEqual(self.ipc(self.real_like(), ip='999.1.1.1').returncode, 2)

    def test_ip_check_only_accepts_a_full_container_id_to_ignore(self):
        for bad in (self.IP_OWNER[:12], self.IP_OWNER[:63], self.IP_OWNER.upper(), 'dokploy-traefik', self.IP_OWNER + 'a', '', 'a' * 64 + '\n'):
            with self.subTest(bad[:20]):
                r = self.ipc(self.real_like(), '--ignore-container', bad); self.assertEqual(r.returncode, 2); self.assertIn('full 64-hex', r.stderr)
        # a prefix of the real id does not ignore it either (the old behaviour), even when it is a valid-looking full id of ANOTHER container
        r = self.ipc(self.real_like(), '--ignore-container', 'a' * 63 + 'b'); self.assertEqual(r.returncode, 1)

    def test_canary_scan_ignores_info_lines_and_provider_noise_but_not_real_errors(self):
        log = self.tmp / 'c2.log'
        base = 'time=1 level=info msg="Configuration loaded from file: /etc/traefik/traefik.yml"\n'
        log.write_text(base + 'time=2 level=info msg="the yaml: parser is happy, field not found is just text here"\n'
                       'time=3 level=error msg="router app@file: service \\"svc@docker\\" does not exist"\n'
                       'time=4 level=error msg="Provider connection error: Cannot connect to the Docker daemon" providerName=swarm\n')
        self.assertEqual(self.run_tool('scan-canary-log', str(log)).returncode, 0)
        log.write_text(base + 'command traefik error: yaml: unmarshal errors: field fooBar not found in type static.Configuration\n')
        self.assertEqual(self.run_tool('scan-canary-log', str(log)).returncode, 1)
        log.write_text(base + 'time=5 level=fatal msg="could not start"\n'); self.assertEqual(self.run_tool('scan-canary-log', str(log)).returncode, 1)

    def test_canary_scan_and_api_check(self):
        log = self.tmp / 'c.log'
        log.write_text('level=info msg="Configuration loaded from file"\nlevel=error msg="docker provider: Cannot connect"\n'); self.assertEqual(self.run_tool('scan-canary-log', str(log)).returncode, 0)
        log.write_text('level=info msg="Configuration loaded from file"\nlevel=error msg="middleware cleanops-b1: bad tls file"\n'); self.assertEqual(self.run_tool('scan-canary-log', str(log)).returncode, 1)
        log.write_text(''); self.assertEqual(self.run_tool('scan-canary-log', str(log)).returncode, 1)
        self.assertEqual(self.run_tool('api-check', '1.40').returncode, 0); self.assertEqual(self.run_tool('api-check', '1.39').returncode, 1)


if __name__ == '__main__':
    unittest.main()
