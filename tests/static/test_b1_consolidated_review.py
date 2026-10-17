import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('review', ROOT / 'scripts/review-b1-consolidated.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)

class ConsolidatedReviewTests(unittest.TestCase):
    def test_generated_diff_and_inventory_are_reproducible(self):
        for name, expected in review.build().items():
            self.assertEqual((review.TARGET / name).read_bytes(), expected.encode())

    def test_lexer_preserves_literals_and_dollar_bodies(self):
        text = "-- removed\nSELECT 'a;--b', 'it''s literal'; DO $fn$ BEGIN RAISE NOTICE 'x;'; END $fn$; /* nested /* comment */ */"
        parsed = review.statements(text)
        self.assertEqual(len(parsed), 2)
        self.assertEqual(parsed[0], ['SELECT', "'a;--b'", ',', "'it''s literal'"])
        self.assertEqual(parsed[1], ['DO', "$fn$ BEGIN RAISE NOTICE 'x;'; END $fn$"])
        self.assertNotEqual(review.statements("SELECT 'a b';"), review.statements("SELECT 'a  b';"))

    def test_malformed_or_unterminated_artifacts_fail_closed(self):
        for value in ['SELECT 1', "SELECT 'missing;", 'DO $body$ missing;', '/* missing']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                review.statements(value)

    def test_extra_grant_or_disabled_rls_cannot_be_reviewed_as_the_pinned_candidate(self):
        manifest_path = Path('docs/proposals/b1-consolidated-sql/manifest.json')
        manifest = json.loads((ROOT / manifest_path).read_text())
        for extra in ['GRANT cleanops_auth_broker TO cleanops_runtime;', 'ALTER TABLE app.sessions DISABLE ROW LEVEL SECURITY;']:
            with tempfile.TemporaryDirectory(prefix='cleanops-review-only-') as directory:
                root = Path(directory)
                for path in [manifest_path] + [Path(s['path']) for s in manifest['sources']] + [Path(manifest['candidate']['path'])]:
                    target = root / path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes((ROOT / path).read_bytes())
                target = root / manifest['candidate']['path']
                target.write_bytes(target.read_bytes() + extra.encode())
                # Even changing the review manifest cannot bless an unreviewed SQL artifact.
                manifest['candidate'].update(review.hashes(target.read_bytes()))
                (root / manifest_path).write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, 'candidate hash mismatch'):
                    review.build(root)

if __name__ == '__main__':
    unittest.main()
