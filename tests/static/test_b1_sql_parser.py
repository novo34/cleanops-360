import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]

@unittest.skipUnless(importlib.util.find_spec('pglast'), 'pglast is installed in CI; no local parser execution')
class PostgreSQL16GrammarTests(unittest.TestCase):
    def parser(self):
        spec = importlib.util.spec_from_file_location('parser', ROOT/'scripts/parse-b1-sql.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_all_73_declarations_and_original_out_parameter_grammar(self):
        report = self.parser().inspect(ROOT/'docs/proposals/b1-consolidated-sql/revisions/03/schema.review.sql')
        self.assertEqual(report['functionDeclarations'], 73)
        self.assertEqual(report['errors'], [])
        # Pinned pglast6.16 parses the original RETURNS TABLE/RETURN NEXT directly.
        # Require zero parser-only rewrites; retain all malformed-body negative tests.
        self.assertEqual(report['parserAdaptations'], [])

    def test_previously_native_failed_candidates_are_rejected(self):
        report = self.parser().inspect(ROOT/'docs/proposals/b1-consolidated-sql/revisions/02/schema.review.sql')
        self.assertIn('auth_api.consume_email_otp', [e['scope'] for e in report['errors']])

    def test_collects_multiple_errors_and_does_not_hide_bad_out_body(self):
        source = """CREATE FUNCTION public.a() RETURNS void LANGUAGE plpgsql AS $a$ BEGIN IF THEN RETURN; END IF; END $a$;
CREATE FUNCTION public.b() RETURNS TABLE(ok boolean) LANGUAGE plpgsql AS $b$ BEGIN IF THEN RETURN NEXT; END IF; END $b$;"""
        with tempfile.TemporaryDirectory(dir=ROOT) as temp:
            path = Path(temp)/'invalid.sql'
            path.write_text(source)
            report = self.parser().inspect(path)
        self.assertEqual(len(report['errors']), 2)
