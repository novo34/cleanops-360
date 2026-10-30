"""Offline Compose merge: no daemon operations, credentials or VPS access."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]


class WebCompose(unittest.TestCase):
    def test_private_overlay_preserves_all_other_services_and_web_ingress(self):
        files = [ROOT / 'deploy/staging/compose.yaml', ROOT / 'deploy/staging/compose.openbao.yaml',
                 ROOT / 'deploy/openbao/compose.agent.yaml', ROOT / 'deploy/staging/compose.b1-web.yaml']
        with tempfile.TemporaryDirectory(prefix='b1-compose-') as directory:
            env = dict(os.environ)
            for file in files:
                for name in re.findall(r'\$\{([A-Z_]+):\?', file.read_text()):
                    env[name] = 'fixture'
            env.update(CLEANOPS_COMPOSE_PROJECT='b1-fixture', CLEANOPS_IDENTITY_UID='999', CLEANOPS_IDENTITY_GID='999',
                       CLEANOPS_PG_IMAGE='postgres:16', CLEANOPS_AGENT_IMAGE='openbao:fixture',
                       CLEANOPS_AUTH_ORIGIN='https://fixture.invalid', CLEANOPS_BAO_SUBNET='172.30.60.0/24',
                       CLEANOPS_BAO_PRIVATE_IPV4='172.30.60.10', CLEANOPS_PG_HBA_TARGET='/var/lib/postgresql/data/pg_hba.conf',
                       CLEANOPS_B1_PRIVATE_DIR=directory, COMPOSE_PROFILES='identity-agent,synthetic-custody')
            for name in list(env):
                if name.startswith('CLEANOPS_') and (name.endswith('_FILE') or name.endswith('_DIR')):
                    env[name] = directory if name.endswith('_DIR') else directory + '/fixture'
            Path(directory, 'fixture').write_text('synthetic configuration only')
            def render(paths):
                command = ['docker', 'compose']
                for path in paths:
                    command += ['-f', str(path)]
                result = subprocess.run(command + ['config', '--format', 'json'], env=env, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr.decode())
                return json.loads(result.stdout)
            base = render([files[0]])
            merged = render([files[0], files[-1]])
            for name in ('postgres', 'openbao', 'openbao-agent'):
                self.assertEqual(base['services'][name], merged['services'][name], name)
            for name in ('networks', 'volumes', 'secrets'):
                self.assertEqual(base.get(name), merged.get(name), name)
            web = merged['services']['web']
            private = [v for v in web['volumes'] if v['target'] == '/run/cleanops-b1-private']
            self.assertEqual(len(private), 1)
            self.assertTrue(private[0]['read_only'])
            self.assertFalse(private[0].get('bind', {}).get('create_host_path', False))
            self.assertNotIn('ports', web)
            self.assertEqual(web.pop('pull_policy'), 'never')
            self.assertEqual(web.pop('image'), env['CLEANOPS_STAGING_WEB_IMAGE'])
            # Compose JSON omits zero numeric values (and false booleans).
            # Verify explicit source semantics as well as normalized output.
            self.assertEqual(yaml.safe_load(files[-1].read_text())['services']['web']['ulimits']['core'], {'soft': 0, 'hard': 0})
            self.assertEqual(web['ulimits']['core'].get('soft', 0), 0)
            self.assertEqual(web['ulimits']['core'].get('hard', 0), 0)
            web['volumes'].remove(private[0])
            del web['ulimits']
            self.assertEqual(base['services']['web'], web)

            # Model the operative pre-binding web, preserving a local Dokploy label.
            operative = json.loads(json.dumps(base))
            operative['services']['openbao']['ulimits']['core'] = {'soft': 0, 'hard': 0}
            del operative['services']['openbao-agent']
            del operative['networks']['identity_bao']
            del operative['volumes']['identity_agent_sink']
            operative['services']['web']['volumes'] = []
            operative['services']['web']['networks'].pop('identity_bao')
            operative['services']['web']['labels'] = {'traefik.local-preserved': 'fixture'}
            operative_path = Path(directory, 'operative.json')
            operative_path.write_text(json.dumps(operative))
            before = render([operative_path])
            reconciled = render([operative_path, files[2], files[-1]])
            for name in ('postgres', 'openbao'):
                self.assertEqual(before['services'][name], reconciled['services'][name])
            self.assertEqual(reconciled['services']['web']['labels'], before['services']['web']['labels'])
            self.assertEqual(set(reconciled['services']['web']['networks']), {'private', 'identity_bao'})
            self.assertEqual(len(reconciled['services']['web']['volumes']), 2)
            self.assertTrue(reconciled['volumes']['identity_agent_sink']['external'])

    def test_overlay_requires_an_explicit_private_package(self):
        env = {k: v for k, v in os.environ.items() if k != 'CLEANOPS_B1_PRIVATE_DIR'}
        result = subprocess.run(['docker', 'compose', '-f', str(ROOT / 'deploy/staging/compose.b1-web.yaml'), 'config'],
                                env=env, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'CLEANOPS_B1_PRIVATE_DIR', result.stderr)


if __name__ == '__main__':
    unittest.main()
