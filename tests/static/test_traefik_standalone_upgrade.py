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
            'NetworkSettings': {'Networks': {'dokploy-network': {'Aliases': ['dokploy-traefik', 'aaaaaaaaaaaa'], 'IPAMConfig': None},
                                             'supabase-supabase-2bvnab': {'Aliases': ['aaaaaaaaaaaa'], 'IPAMConfig': None}}}}


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
        for n in ('dokploy-network', 'supabase-supabase-2bvnab'):
            self.write(f'{n}.json', [{'Name': n}])

    def write(self, name, data):
        (self.inputs / name).write_text(json.dumps(data))

    def plan(self, version='3.7.17', digest=DIGEST, out=None):
        out = out or self.tmp / 'plan'
        return subprocess.run(['python3', '-I', str(TOOL), 'plan', '--container', str(self.inputs / 'container.json'), '--image', str(self.inputs / 'image.json'),
                               '--network', str(self.inputs / 'dokploy-network.json'), str(self.inputs / 'supabase-supabase-2bvnab.json'),
                               '--target-version', version, '--target-digest', digest, '--out', str(out)], capture_output=True, text=True)


class Planning(Base):
    def test_generates_exact_reviewable_scripts(self):
        r = self.plan(); self.assertEqual(r.returncode, 0, r.stderr)
        spec = json.loads((self.tmp / 'plan/spec.json').read_text())
        self.assertEqual((spec['sourceVersion'], spec['targetVersion'], spec['newRef']), ('3.6.7', '3.7.17', REF))
        switch = (self.tmp / 'plan/02-switch.sh').read_text()
        for needle in ('--restart always', '--network dokploy-network', '-p 80:80/tcp', '-p 443:443/tcp', '-p 443:443/udp',
                       'target=/var/run/docker.sock,readonly', 'type=bind,source=', 'docker network connect supabase-supabase-2bvnab "$OLD"',
                       'docker stop -t 30', 'docker update --restart=no', 'docker rename "$OLD" "$PREV"', 'trap '):
            self.assertIn(needle, switch)
        for name in ('01-prepare.sh', '02-switch.sh', '03-verify.sh', 'rollback.sh'):
            text = (self.tmp / 'plan' / name).read_text()
            subprocess.run(['bash', '-n', str(self.tmp / 'plan' / name)], check=True)
            for forbidden in ('service update', 'docker service', 'docker rm', ' rm -', 'prune', '--privileged', 'docker exec "$OLD" sh', 'latest'):
                self.assertNotIn(forbidden, text, f'{name} contains {forbidden!r}')
        # -v is never used: --mount refuses to create a missing host path
        self.assertNotIn(' -v ', switch)

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
        self.refuses(lambda c, i: c['NetworkSettings']['Networks']['dokploy-network'].update(Aliases=['dokploy-traefik', 'extra.alias', 'aaaaaaaaaaaa']), 'aliases')
        self.refuses(lambda c, i: c['NetworkSettings']['Networks']['dokploy-network'].update(IPAMConfig={'IPv4Address': '10.0.0.9'}), 'static IP')
        self.refuses(lambda c, i: c['Config'].update(Cmd=['--api.insecure=true']), 'no explicit flags')
        self.refuses(lambda c, i: c['HostConfig'].update(Privileged=True), 'Privileged')
        self.refuses(lambda c, i: c['HostConfig']['RestartPolicy'].update(Name='unless-stopped'), 'restart policy')
        self.refuses(lambda c, i: c['Config'].update(Image='traefik:v3.6.25'), 'inventory confirmed')

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
            images={OLD_IMG: image(OLD_IMG, 'traefik:v3.6.7'), REF: image(NEW_IMG, REF)}, **extra)
        self.shim_state.write_text(json.dumps(st))

    def sh(self, name, *, env=None, check=False):
        e = {'PATH': f'{self.bin}:/usr/bin:/bin', 'SHIM_STATE': str(self.shim_state), 'B1_TRAEFIK_STATE_DIR': str(self.state),
             'B1_TRAEFIK_TOOL': str(TOOL), 'B1_TRAEFIK_POLL_SECONDS': '0', 'HOME': str(self.tmp)}
        e.update(env or {})
        r = subprocess.run(['bash', str(self.plan_dir / name)], env=e, capture_output=True, text=True, timeout=120)
        if check:
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r

    def snapshot(self):
        return json.loads(self.shim_state.read_text())

    APPROVE = {'B1_TRAEFIK_APPROVAL_REF': 'OWNER-2026-11-04:b1-traefik', 'B1_TRAEFIK_VERSION_GUARD_ACK': 'yes'}

    def test_prepare_is_non_mutating_and_makes_a_private_backup(self):
        r = self.sh('01-prepare.sh', check=True); self.assertIn('Nothing was changed', r.stdout)
        verbs = [c[0] for c in self.snapshot()['calls']]
        self.assertFalse({'stop', 'rename', 'create', 'start', 'update'} & set(verbs), verbs)
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
        order = [next(i for i, c in enumerate(calls) if c[0] == v and (v != 'network' or True)) for v in ('stop', 'rename', 'create', 'network', 'start')]
        self.assertEqual(order, sorted(order), 'stop -> rename -> create -> network connect -> start')
        self.assertFalse(any(c[0] in ('rm', 'service') or c[:2] == ['system', 'prune'] for c in calls))
        new, prev = st['containers']['dokploy-traefik'], next(v for k, v in st['containers'].items() if k.startswith('dokploy-traefik-prev-'))
        self.assertEqual(prev['Id'], OLD_ID); self.assertEqual(prev['HostConfig']['RestartPolicy']['Name'], 'no'); self.assertFalse(prev['State']['Running'])
        self.assertNotEqual(new['Id'], OLD_ID); self.assertTrue(new['State']['Running'])
        old = container(self.root)
        self.assertEqual(new['HostConfig']['PortBindings'], old['HostConfig']['PortBindings'])
        self.assertEqual(sorted((m['Source'], m['Destination'], m['RW']) for m in new['Mounts']), sorted((m['Source'], m['Destination'], m['RW']) for m in old['Mounts']))
        self.assertEqual(set(new['NetworkSettings']['Networks']), set(old['NetworkSettings']['Networks']))
        self.assertEqual(new['HostConfig']['RestartPolicy']['Name'], 'always'); self.assertEqual(new['Config']['Image'], REF)
        # a later read-only verification passes and compare rejects a dropped network
        self.sh('03-verify.sh', check=True)
        broken = copy.deepcopy(new); broken['NetworkSettings']['Networks'].pop('supabase-supabase-2bvnab')
        (self.tmp / 'broken.json').write_text(json.dumps([broken]))
        r = subprocess.run(['python3', '-I', str(TOOL), 'compare', '--spec', str(self.plan_dir / 'spec.json'), '--inspect', str(self.tmp / 'broken.json'),
                            '--image', str(self.state / 'new.image.json'), '--mode', 'after'], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1); self.assertIn('networks', r.stderr)

    def test_failed_candidate_rolls_back_automatically_to_the_exact_original(self):
        self.sh('01-prepare.sh', check=True)
        st = self.snapshot(); st['fail_start'] = True; self.shim_state.write_text(json.dumps(st))
        r = self.sh('02-switch.sh', env=self.APPROVE); self.assertNotEqual(r.returncode, 0); self.assertIn('automatic rollback', r.stderr)
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
                verbs = [c[0] for c in self.snapshot()['calls']]
                self.assertNotIn('create', verbs, 'no candidate may be created before the original is safely renamed')

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

    def test_canary_scan_and_api_check(self):
        log = self.tmp / 'c.log'
        log.write_text('level=info msg="Configuration loaded from file"\nlevel=error msg="docker provider: Cannot connect"\n'); self.assertEqual(self.run_tool('scan-canary-log', str(log)).returncode, 0)
        log.write_text('level=info msg="Configuration loaded from file"\nlevel=error msg="middleware cleanops-b1: bad tls file"\n'); self.assertEqual(self.run_tool('scan-canary-log', str(log)).returncode, 1)
        log.write_text(''); self.assertEqual(self.run_tool('scan-canary-log', str(log)).returncode, 1)
        self.assertEqual(self.run_tool('api-check', '1.40').returncode, 0); self.assertEqual(self.run_tool('api-check', '1.39').returncode, 1)


if __name__ == '__main__':
    unittest.main()
