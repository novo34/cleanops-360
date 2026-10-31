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

    def test_lock_transition_is_exact_and_preserves_historical_findings(self):
        original = json.loads((ROOT / '.semgrep/reviewed-findings.json').read_text())
        current = guard.load_manifest()
        self.assertEqual(len(original['findings']), 17)
        self.assertEqual([entry for entry in current['findings'] if entry['id'] != guard.B1_IMPORT_ENTRY['id']],
                         [entry for entry in original['findings'] if entry['id'] != 'FP-09'])
        self.assertEqual([entry for entry in current['findings'] if entry['id'] == guard.B1_IMPORT_ENTRY['id']],
                         [guard.B1_IMPORT_ENTRY])
        self.assertEqual(current['retired_finding_reconciliation']['retired'], 'FP-09')
        self.assertEqual(current['reviewed_commit'], original['reviewed_commit'])
        self.assertEqual(current['context_sha256']['package-lock.json'], guard.STAGING_LOCK_TO)
        current['context_sha256']['package-lock.json'] = guard.STAGING_LOCK_FROM
        current.pop('context_reconciliation')
        current.pop('retired_finding_reconciliation')
        current.pop('privileged_import_reconciliation')
        for name in guard.B1_IMPORT_CONTEXT:
            current['context_sha256'].pop(name)
        current['context_sha256']['lib/b1/approved-backend.ts'] = original['context_sha256']['lib/b1/approved-backend.ts']
        current['context_sha256']['lib/b1/runtime.ts'] = original['context_sha256']['lib/b1/runtime.ts']
        current['findings'] = original['findings']
        self.assertEqual(current, original)

    def test_lock_transition_rejects_unapproved_lock_and_manifest(self):
        root = Path(self.temp.name) / 'transition'; (root / '.semgrep').mkdir(parents=True)
        original = (ROOT / '.semgrep/reviewed-findings.json').read_bytes()
        manifest = root / '.semgrep/reviewed-findings.json'; manifest.write_bytes(original)
        (root / 'package-lock.json').write_text('unapproved lock')
        with self.assertRaisesRegex(ValueError, 'unauthorized lock/manifest transition'):
            guard.load_manifest(root)
        (root / 'package-lock.json').write_bytes((ROOT / 'package-lock.json').read_bytes())
        manifest.write_bytes(original + b' ')
        with self.assertRaisesRegex(ValueError, 'unauthorized lock/manifest transition'):
            guard.load_manifest(root)

    def test_real_registry_keeps_sixteen_false_positives_and_one_distinct_accepted_risk(self):
        registry=guard.load_manifest()
        self.assertEqual(len(registry['findings']),17)
        self.assertEqual(len({guard.identity(row) for row in registry['findings']}),17)
        self.assertTrue(all(row['id'] != 'FP-09' for row in registry['findings']))
        self.assertEqual(registry['retired_finding_reconciliation']['replacement_git_blob'], guard.B1_APPROVED_BACKEND_BLOB)
        self.assertEqual(registry['retired_finding_reconciliation']['runtime_git_blob'], guard.B1_RUNTIME_BLOB)
        self.assertEqual(sum(row['classification']=='confirmed_false_positive' for row in registry['findings']),16)
        self.assertEqual([row for row in registry['findings'] if row['classification']==guard.B1_IMPORT_CLASSIFICATION],
                         [guard.B1_IMPORT_ENTRY])
        self.assertEqual(registry['privileged_import_reconciliation']['scope'],
                         'loader_mechanism_only_not_future_integration_content')
        for name,expected in registry['context_sha256'].items():
            self.assertEqual(guard.digest(ROOT/name),expected,name)


class PrivilegedImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in guard.B1_IMPORT_CONTEXT:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / name).read_bytes())
        self.manifest = {'version': 1, 'engine': '1.177.0',
                         'review': 'docs/reviews/SEMGREP_STAGING_17.md',
                         'context_sha256': {}, 'findings': [], 'vendor_parser_limitation': {}}
        guard.reconcile_privileged_b1_import(self.manifest, self.root)
        self.finding = {name: copy.deepcopy(guard.B1_IMPORT_ENTRY[name])
                        for name in ('check_id', 'path', 'start', 'end')}
        self.report = {'version': '1.177.0', 'results': [copy.deepcopy(self.finding)], 'errors': []}

    def run_guard(self):
        return guard.evaluate(self.report, self.manifest, self.root)

    def test_exact_accepted_risk_is_visible_and_never_counted_as_false_positive(self):
        result = self.run_guard()
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(result['reviewed_false_positives'], [])
        self.assertEqual(len(result['accepted_privileged_findings']), 1)
        accepted = result['accepted_privileged_findings'][0]
        self.assertEqual(accepted['classification'], 'accepted_privileged_dynamic_import')
        self.assertEqual(accepted['scope'], 'loader_mechanism_only_not_future_integration_content')
        self.assertEqual(result['rules_disabled'], [])
        self.assertFalse(result['inline_suppressions_enabled'])

    def test_another_finding_in_same_file_is_not_accepted(self):
        other = copy.deepcopy(self.finding)
        other['start']['col'] += 1
        self.report['results'].append(other)
        result = self.run_guard()
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual(len(result['accepted_privileged_findings']), 1)
        self.assertEqual(len(result['unreviewed_findings']), 1)

    def test_report_line_column_file_or_rule_changes_expire_exact_acceptance(self):
        variants = [dict(path='different.ts'), dict(check_id='semgrep.other-rule'),
                    dict(start={'line': 45, 'col': 26}), dict(start={'line': 44, 'col': 25}),
                    dict(end={'line': 45, 'col': 91}), dict(end={'line': 44, 'col': 92})]
        for variant in variants:
            with self.subTest(variant=variant):
                self.report['results'] = [{**copy.deepcopy(self.finding), **variant}]
                with self.assertRaisesRegex(ValueError, 'Stale exception'):
                    self.run_guard()

    def test_manifest_identity_hash_or_classification_cannot_be_redefined(self):
        original = copy.deepcopy(self.manifest['findings'][0])
        variants = [dict(id='OTHER'), dict(path='other.ts'), dict(check_id='other-rule'),
                    dict(start={'line': 45, 'col': 26}), dict(end={'line': 44, 'col': 92}),
                    dict(source_sha256='0' * 64), dict(classification='confirmed_false_positive'),
                    dict(justification='Unreviewed replacement justification')]
        for variant in variants:
            with self.subTest(variant=variant):
                self.manifest['findings'] = [{**copy.deepcopy(original), **variant}]
                with self.assertRaisesRegex(ValueError, 'identity/classification changed'):
                    self.run_guard()

    def test_source_change_expires_acceptance_even_if_import_position_is_unchanged(self):
        path = self.root / self.finding['path']
        path.write_bytes(path.read_bytes() + b'// unreviewed bytes\n')
        with self.assertRaisesRegex(ValueError, 'Review expired'):
            self.run_guard()

    def test_changed_source_cannot_be_laundered_by_replacing_manifest_hash(self):
        path = self.root / self.finding['path']
        path.write_bytes(path.read_bytes() + b'// changed context\n')
        self.manifest['context_sha256'][self.finding['path']] = guard.digest(path)
        with self.assertRaisesRegex(ValueError, 'exact context guard'):
            self.run_guard()

    def test_every_required_producer_context_is_pinned(self):
        for name in guard.B1_IMPORT_CONTEXT:
            with self.subTest(name=name):
                path = self.root / name
                before = path.read_bytes()
                path.write_bytes(before + b'\n')
                with self.assertRaisesRegex(ValueError, 'Review expired'):
                    self.run_guard()
                path.write_bytes(before)

    def test_context_guard_cannot_be_omitted(self):
        for name in guard.B1_IMPORT_CONTEXT:
            with self.subTest(name=name):
                value = self.manifest['context_sha256'].pop(name)
                with self.assertRaisesRegex(ValueError, 'exact context guard'):
                    self.run_guard()
                self.manifest['context_sha256'][name] = value

    def test_reconciliation_rejects_changed_source_duplicate_or_conflicting_context(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate privileged'):
            guard.reconcile_privileged_b1_import(self.manifest, self.root)
        self.manifest['context_sha256'][self.finding['path']] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Conflicting privileged'):
            guard.reconcile_privileged_b1_import(self.manifest, self.root)
        path = self.root / self.finding['path']
        path.write_bytes(path.read_bytes() + b'\n')
        with self.assertRaisesRegex(ValueError, 'review expired'):
            guard.reconcile_privileged_b1_import(self.manifest, self.root)

    def test_missing_or_duplicate_accepted_result_does_not_pass(self):
        self.report['results'] = []
        with self.assertRaisesRegex(ValueError, 'Stale exception'):
            self.run_guard()
        self.report['results'] = [self.finding, self.finding]
        with self.assertRaisesRegex(ValueError, 'Duplicate scanner'):
            self.run_guard()


if __name__=='__main__':
    unittest.main()
