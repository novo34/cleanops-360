"""Runs scripts/traefik-sandbox-check.py against official Traefik binaries when their paths are supplied.

  TRAEFIK_BIN_TARGET=/path/traefik-3.7.17  python3 -m unittest discover -s tests/static -p test_traefik_sandbox.py
Skipped otherwise (CI has no binary and tests must not download anything).
"""
import json, os, subprocess, unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/traefik-sandbox-check.py'


class Sandbox(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('TRAEFIK_BIN_TARGET'), 'TRAEFIK_BIN_TARGET (official, checksum-verified v3.7.x binary) not set')
    def test_target_version_passes_every_forwardauth_invariant(self):
        r = subprocess.run(['python3', '-I', str(SCRIPT), '--traefik', os.environ['TRAEFIK_BIN_TARGET'], '--json'], capture_output=True, text=True, timeout=120)
        result = json.loads(r.stdout)
        self.assertTrue(result['passed'], json.dumps(result, indent=2))
        self.assertTrue(result['observations']['version'].startswith('3.7.'))
        self.assertEqual(result['observations']['error_lines'], [])


if __name__ == '__main__':
    unittest.main()
