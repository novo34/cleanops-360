"""Security regression tests for reviewed-finding boundaries, not application B1."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('review_guard', ROOT/'scripts/check-semgrep-reviewed.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class ReviewGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root/'known.ts').write_text("void import('fixed-package')\n")
        (self.root/'caller.ts').write_text('trusted caller\n')
        (self.root/'worker.mjs').write_text('upstream vendor bytes\n')
        self.finding = {'check_id':'security.import','path':'known.ts',
                        'start':{'line':1,'col':6},'end':{'line':1,'col':29}}
        self.manifest = {'version':1,'engine':'1.177.0','review':'docs/reviews/SEMGREP_STAGING_17.md',
            'context_sha256':{name:guard.digest(self.root/name) for name in ['known.ts','caller.ts']},
            'findings':[{**copy.deepcopy(self.finding),'id':'FP-TEST','classification':'confirmed_false_positive',
                         'source_sha256':guard.digest(self.root/'known.ts'),'justification':'Reviewed literal package'}],
            'vendor_parser_limitation':{'path':'worker.mjs','sha256':guard.digest(self.root/'worker.mjs'),'reason':'Pinned upstream bytes'}}
        self.report = {'version':'1.177.0','results':[copy.deepcopy(self.finding)],'errors':[]}

    def run_guard(self):
        return guard.evaluate(self.report,self.manifest,self.root)

    def test_exact_review_is_visible_in_audit_result(self):
        result=self.run_guard()
        self.assertEqual(result['status'],'PASS')
        self.assertEqual(len(result['reviewed_false_positives']),1)
        self.assertEqual(result['rules_disabled'],[])
        self.assertFalse(result['inline_suppressions_enabled'])

    def test_new_finding_in_existing_file_is_not_suppressed(self):
        extra=copy.deepcopy(self.finding);extra['start']['col']=1
        self.report['results'].append(extra)
        self.assertEqual(self.run_guard()['status'],'FAIL')

    def test_finding_in_new_code_is_not_suppressed(self):
        extra=copy.deepcopy(self.finding);extra['path']='new-code.ts'
        self.report['results'].append(extra)
        self.assertEqual(self.run_guard()['status'],'FAIL')

    def test_other_rule_at_same_location_cannot_reuse_exception(self):
        self.report['results'][0]['check_id']='security.secret'
        with self.assertRaises(ValueError):self.run_guard()

    def test_source_change_expires_exception_even_if_position_is_identical(self):
        (self.root/'known.ts').write_text('void import(request.url)\n')
        with self.assertRaisesRegex(ValueError,'Review expired'):self.run_guard()

    def test_trust_boundary_change_in_caller_expires_exception(self):
        (self.root/'caller.ts').write_text('untrusted caller\n')
        with self.assertRaisesRegex(ValueError,'Review expired'):self.run_guard()

    def test_missing_match_requires_review_cleanup(self):
        self.report['results']=[]
        with self.assertRaisesRegex(ValueError,'Stale exception'):self.run_guard()

    def test_duplicate_manifest_or_report_match_is_rejected(self):
        self.manifest['findings'].append(copy.deepcopy(self.manifest['findings'][0]))
        with self.assertRaisesRegex(ValueError,'duplicate exception'):self.run_guard()
        self.manifest['findings'].pop();self.report['results'].append(copy.deepcopy(self.finding))
        with self.assertRaisesRegex(ValueError,'Duplicate scanner'):self.run_guard()

    def test_unreviewed_scan_error_is_not_turned_into_pass(self):
        self.report['errors']=[{'level':'warn','type':'Syntax error','code':3,'path':'new-code.ts'}]
        with self.assertRaises(ValueError):self.run_guard()

    def test_vendor_warning_requires_exact_reviewed_bytes(self):
        self.report['errors']=[{'level':'warn','type':'Syntax error','code':3,'path':'worker.mjs'}]
        self.assertEqual(self.run_guard()['status'],'PASS')
        (self.root/'worker.mjs').write_text('different vendor code\n')
        with self.assertRaises(ValueError):self.run_guard()

    def test_engine_change_or_incomplete_report_is_rejected(self):
        self.report['version']='future-engine'
        with self.assertRaises(ValueError):self.run_guard()
        self.report.pop('errors')
        with self.assertRaises(ValueError):self.run_guard()

    def test_exception_cannot_omit_file_guard_or_source_digest(self):
        del self.manifest['context_sha256']['known.ts']
        with self.assertRaisesRegex(ValueError,'integrity guard'):self.run_guard()
        self.manifest['context_sha256']['known.ts']=guard.digest(self.root/'known.ts')
        self.manifest['findings'][0]['source_sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'source changed'):self.run_guard()

    def test_path_escape_is_rejected(self):
        self.manifest['context_sha256']['../escape.ts']='0'*64
        with self.assertRaises(ValueError):self.run_guard()

    def test_real_registry_has_exactly_the_four_inherited_production_exceptions(self):
        registry=json.loads((ROOT/'.semgrep/reviewed-findings.json').read_text())
        self.assertEqual(len(registry['findings']),4)
        self.assertEqual(len({guard.identity(row) for row in registry['findings']}),4)
        self.assertTrue(all(row['classification']=='confirmed_false_positive' for row in registry['findings']))
        for name,expected in registry['context_sha256'].items():
            self.assertEqual(guard.digest(ROOT/name),expected,name)

    def test_full_quality_registry_preserves_the_original_17_and_scoped_four(self):
        quality=json.loads((ROOT/'.semgrep/quality-reviewed-findings.json').read_text())
        scoped=json.loads((ROOT/'.semgrep/reviewed-findings.json').read_text())
        self.assertEqual({row['id'] for row in quality['findings']},{f'FP-{i:02}' for i in range(1,18)})
        by_id={row['id']:row for row in quality['findings']}
        for row in scoped['findings']:self.assertEqual(by_id[row['id']],row)
        report={'version':quality['engine'],'results':copy.deepcopy(quality['findings']),'errors':[]}
        self.assertEqual(guard.evaluate(report,quality)['status'],'PASS')
        for name,expected in quality['context_sha256'].items():self.assertEqual(guard.digest(ROOT/name),expected,name)


if __name__=='__main__':
    unittest.main()
