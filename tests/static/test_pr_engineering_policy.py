"""Exercise the canonical base verifier; no workflows, services or second parser."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('engineering', ROOT / 'scripts/check-pr-engineering-policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def body():
    text = '\n\n'.join('## ' + section for section in policy.SECTIONS) + '\n\n'
    text += '\n\n'.join('**' + field + '** Evidencia concreta revisada en archivos canónicos del candidato.' for field in policy.FIELDS)
    text += '\n\n' + '\n'.join('- [x] ' + check for check in policy.CHECKS)
    return text


class EngineeringPolicy(unittest.TestCase):
    def test_positive_and_negative_structure(self):
        self.assertEqual(policy.validate(body()), [])
        self.assertTrue(policy.validate(body().replace('- [x]', '- [ ]', 1)))
        self.assertTrue(policy.validate(''))
        self.assertTrue(policy.validate(body().replace('Evidencia concreta revisada en archivos canónicos del candidato.', 'pendiente')))

    def test_hidden_or_duplicate_evidence_fails(self):
        self.assertTrue(policy.validate(body() + '\n\n**' + policy.FIELDS[0] + '** Otro campo duplicado con evidencia.'))
        self.assertTrue(policy.validate('```\n' + body() + '\n```'))
        self.assertTrue(policy.validate('> ' + body().replace('\n', '\n> ')))

    def test_event_cli_pass_fail_and_invalid_event(self):
        with tempfile.TemporaryDirectory() as directory:
            event = Path(directory) / 'event.json'
            for payload, expected in [({'pull_request': {'body': body()}}, 0),
                                      ({'pull_request': {'body': ''}}, 1), ({}, 2)]:
                event.write_text(json.dumps(payload))
                with patch('sys.argv', ['check-pr-engineering-policy.py', '--event', str(event)]), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(policy.main(), expected)

    def test_workflow_trusts_base_and_keeps_read_only_permissions(self):
        workflow = (ROOT / '.github/workflows/engineering-policy.yml').read_text()
        self.assertIn('ref: refs/heads/${{ github.event.pull_request.base.ref }}', workflow)
        self.assertIn('contents: read', workflow)
        self.assertIn('persist-credentials: false', workflow)
        self.assertNotIn('pull_request.head', workflow)
        self.assertIn('python3 scripts/check-pr-engineering-policy.py --event', workflow)


if __name__ == '__main__':
    unittest.main()
