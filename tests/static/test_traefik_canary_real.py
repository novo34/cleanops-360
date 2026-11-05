"""Canary acceptance criterion against the OFFICIAL Traefik binary (no Docker, no VPS, no network access to anything external).

  TRAEFIK_BIN_TARGET=/path/to/traefik-3.7.x  python3 -m unittest tests.static.test_traefik_canary_real

Skipped when the binary is not supplied (CI must not download anything). It runs the same acceptance rule the generated 01-prepare.sh
applies: Traefik must still be ALIVE when the window closes (exit status 124 of `timeout`) and `scan-canary-log` must find no
configuration error. Each scenario was first observed by hand with Traefik 3.7.17; this test pins those observations.
"""
import os, re, shutil, socket, subprocess, tempfile, textwrap, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / 'scripts/traefik-standalone-upgrade.py'
BIN = os.environ.get('TRAEFIK_BIN_TARGET')
WINDOW = 4


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]


@unittest.skipUnless(BIN, 'TRAEFIK_BIN_TARGET (official, checksum-verified Traefik v3.7.x binary) not set')
class RealTraefikCanary(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='canary-real-')); self.addCleanup(shutil.rmtree, self.tmp, True)
        self.dyn = self.tmp / 'dynamic'; self.dyn.mkdir()
        self.dyn.joinpath('ok.yml').write_text('http:\n  middlewares:\n    redirect-to-https:\n      redirectScheme:\n        scheme: https\n        permanent: true\n')

    def static(self, extra='', log=''):
        """Dokploy-shaped traefik.yml: Docker + Swarm providers (no socket), file provider, entrypoints, ACME resolver (never asked for a certificate), insecure API."""
        web, sec, api = free_port(), free_port(), free_port()
        body = textwrap.dedent(f"""\
            global:
              checkNewVersion: false
              sendAnonymousUsage: false
            providers:
              swarm: {{exposedByDefault: false, watch: true, endpoint: "unix:///nonexistent-docker.sock"}}
              docker: {{exposedByDefault: false, watch: true, network: dokploy-network, endpoint: "unix:///nonexistent-docker.sock"}}
              file: {{directory: {self.dyn}, watch: true}}
            entryPoints:
              traefik: {{address: ":{api}"}}
              web: {{address: ":{web}"}}
              websecure: {{address: ":{sec}", http3: {{advertisedPort: {sec}}}}}
            api: {{insecure: true}}
            certificatesResolvers:
              letsencrypt: {{acme: {{email: ops@example.invalid, storage: {self.tmp}/acme.json, httpChallenge: {{entryPoint: web}}}}}}
            """)
        return body + log + extra

    def canary(self, static_text):
        cfg = self.tmp / 'traefik.yml'; cfg.write_text(static_text)
        log = self.tmp / 'canary.log'
        with open(log, 'wb') as out:                     # clean environment: no proxy variables, nothing external is reachable or contacted
            rc = subprocess.run(['timeout', str(WINDOW), BIN, f'--configFile={cfg}'], stdout=out, stderr=subprocess.STDOUT, env={'PATH': '/usr/bin:/bin'}, cwd=self.tmp).returncode
        scan = subprocess.run(['python3', '-I', str(TOOL), 'scan-canary-log', str(log), '--exit-code', str(rc), '--window', str(WINDOW)], capture_output=True, text=True)
        return rc, scan, re.sub(r'\x1b\[[0-9;]*m', '', log.read_text(errors='replace'))

    def test_valid_dokploy_shaped_configuration_is_accepted_although_docker_is_unreachable(self):
        rc, scan, text = self.canary(self.static())
        self.assertEqual(rc, 124, text[:600])                       # still running when the window closed
        self.assertEqual(scan.returncode, 0, scan.stderr)
        self.assertIn('docker/swarm provider cannot reach Docker', scan.stdout); self.assertIn('startup messages in the log: 0', scan.stdout)
        self.assertTrue(text.strip())
        self.assertNotIn(' INF ', text, 'the default level is ERROR: Traefik prints no startup message')
        self.assertFalse([l for l in text.splitlines() if ' ERR ' in l and 'providerName=docker' not in l and 'providerName=swarm' not in l and 'docker' not in l.lower()])

    def test_info_level_adds_traefiks_own_startup_messages(self):
        rc, scan, text = self.canary(self.static(log='log:\n  level: INFO\n'))
        self.assertEqual(rc, 124); self.assertEqual(scan.returncode, 0, scan.stderr)
        self.assertRegex(text, r'INF Traefik version 3\.7\.\d+'); self.assertIn('INF Starting provider *file.Provider', text)
        self.assertNotIn('startup messages in the log: 0', scan.stdout)

    def test_static_configuration_errors_end_the_process_and_are_refused(self):
        base = self.static()
        cases = {'invalid yaml': base + '  this: [unclosed\n',
                 'unknown nested field': base.replace('web: {address:', 'web: {bogusNested: 1, address:', 1),
                 'typo in a known key': base.replace('exposedByDefault', 'exposedByDefalt', 1),
                 'wrong type': base.replace('watch: true', 'watch: notabool', 1),
                 'two entrypoints on one port': re.sub(r'(websecure: \{address: ":)\d+', lambda m: m.group(1) + re.search(r'web: \{address: ":(\d+)', base).group(1), base, count=1)}
        for label, text_cfg in cases.items():
            with self.subTest(label):
                rc, scan, out = self.canary(text_cfg)
                self.assertEqual(rc, 1, out[:400]); self.assertEqual(scan.returncode, 1, scan.stdout + scan.stderr)

    def test_dynamic_configuration_errors_keep_traefik_running_but_are_refused(self):
        bad = {'file with invalid yaml': ('x.yml', 'http:\n  routers:\n    r1: [broken\n'),
               'unknown option inside a middleware': ('mw.yml', 'http:\n  middlewares:\n    bad:\n      redirectScheme:\n        schemeX: https\n'),
               'router whose service does not exist': ('refs.yml', 'http:\n  routers:\n    r2:\n      rule: Host(`example.test`)\n      service: nosuchservice\n')}
        for label, (name, body) in bad.items():
            with self.subTest(label):
                self.dyn.joinpath(name).write_text(body)
                rc, scan, out = self.canary(self.static())
                self.dyn.joinpath(name).unlink()
                self.assertEqual(rc, 124, out[:300]); self.assertEqual(scan.returncode, 1, scan.stdout + scan.stderr)
        with self.subTest('the dynamic directory is missing'):
            shutil.rmtree(self.dyn); rc, scan, out = self.canary(self.static())
            self.assertEqual(rc, 124); self.assertEqual(scan.returncode, 1); self.assertIn('Cannot start the provider', out)

    def test_references_to_the_absent_docker_provider_are_tolerated_but_other_missing_objects_are_not(self):
        self.dyn.joinpath('dockerref.yml').write_text('http:\n  routers:\n    r3:\n      rule: Host(`example.test`)\n      service: svc-app@docker\n')
        rc, scan, out = self.canary(self.static())
        self.assertEqual(rc, 124); self.assertEqual(scan.returncode, 0, scan.stderr); self.assertIn('svc-app@docker', out)
        self.assertIn('reference to an object of the absent docker/swarm provider', scan.stdout)

    def test_known_limit_an_unknown_root_level_key_is_not_rejected_by_traefik_itself(self):
        """Demonstrated with 3.7.17: nested unknown fields are rejected ('field not found'), a root-level one is silently ignored. The canary cannot catch it."""
        rc, scan, out = self.canary(self.static(extra='bogusRootOption:\n  x: 1\n'))
        self.assertEqual(rc, 124); self.assertEqual(scan.returncode, 0, scan.stderr)


if __name__ == '__main__':
    unittest.main()
