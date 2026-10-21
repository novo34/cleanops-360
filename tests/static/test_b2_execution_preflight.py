"""Authorization gates only: never import a SQL fixture or invoke Docker/SQL."""
import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('b2_preflight',ROOT/'scripts/b2-directory-postgres.py')
runner=importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        paths=list(runner.APPROVED)+[
            'docs/implementation/b2/directory-authorization.json',
            'docs/implementation/b1/consolidated-test-14/AUTHORIZATION.json',
            'docs/implementation/b1/consolidated-test-13/AUTHORIZATION.json',
            'docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql',
            'scripts/pg11-rbac-matrix.py']
        for scope,package in runner.PACKAGES.items():paths.extend([package['sql'],package['tests'],f'docs/implementation/b2/{scope}-authorization.json'])
        for name in paths:
            destination=self.root/name;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,destination)
        self.addCleanup(patch.stopall)
        patch.object(runner,'ROOT',self.root).start()
        patch.object(runner,'fixture_reference_bytes',side_effect=lambda package:subprocess.check_output(['git','show',package['fixtureReference']+':'+package['tests']],cwd=ROOT)).start()
        patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','GITHUB_REPOSITORY':'novo34/cleanops-360','GITHUB_HEAD_REF':'feat/b2-users-access'},clear=True).start()

    def test_exact_individual_records_and_prior_authorizations_match(self):
        self.assertTrue(runner.preflight())
        for scope in runner.PACKAGES:self.assertEqual(runner.authorize_package(scope),runner.PACKAGES[scope])

    def test_external_binding_fails_without_disclosing_its_value(self):
        for name in ['DATABASE_URL','PGOPTIONS','PGPASSWORD','OPENBAO_TOKEN']:
            with patch.dict(os.environ,{name:'synthetic-private-value'}):
                with self.assertRaisesRegex(RuntimeError,'EXTERNAL_DATABASE_OR_SECRET_BINDING_PRESENT'):runner.preflight()

    def test_modified_candidate_or_prior_sql_never_passes(self):
        for path in ['docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql',runner.PACKAGES['access']['sql'],runner.PACKAGES['users']['tests']]:
            candidate=self.root/path;before=candidate.read_bytes();candidate.write_bytes(before+b'\n')
            with self.assertRaises(RuntimeError):
                runner.preflight()
                runner.authorize_package('access');runner.authorize_package('users')
            candidate.write_bytes(before)

    def test_one_package_record_cannot_authorize_the_other_or_another_commit(self):
        path=self.root/'docs/implementation/b2/users-authorization.json'
        path.write_bytes((self.root/'docs/implementation/b2/access-authorization.json').read_bytes())
        with self.assertRaisesRegex(RuntimeError,'EXACT_SELECTED_PACKAGE_AUTHORIZATION_REQUIRED'):runner.authorize_package('users')

    def test_self_hosted_or_other_branch_is_rejected_before_loading_transport(self):
        for change in [{'RUNNER_ENVIRONMENT':'self-hosted'},{'GITHUB_HEAD_REF':'main'},{'GITHUB_REPOSITORY':'other/repository'}]:
            with patch.dict(os.environ,change):
                with self.assertRaisesRegex(RuntimeError,'HOSTED_CI_SCOPE_REQUIRED'):runner.preflight()

    def test_individual_approvals_do_not_authorize_composition_or_import_transport(self):
        path=self.root/'docs/proposals/b2-integration/AUTHORIZATION.review.json'
        path.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(ROOT/'docs/proposals/b2-integration/AUTHORIZATION.review.json',path)
        with self.assertRaisesRegex(RuntimeError,'EXPLICIT_COMPOSITION_APPROVAL_REQUIRED'):
            runner.authorize_composition()
        with patch.object(runner,'load',side_effect=AssertionError('TRANSPORT_MUST_NOT_LOAD')) as transport, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.main('combined'),1)
            transport.assert_not_called()
        report=json.loads((self.root/'artifacts/b2-combined/report.json').read_text())
        self.assertEqual(report['result'],'FAIL')
        self.assertEqual(report['cleanup'],'SKIP')
        self.assertEqual(report['checks'][0]['detail'],'EXPLICIT_COMPOSITION_APPROVAL_REQUIRED')

    def test_composition_scope_cannot_expand_from_individual_approval(self):
        path=self.root/'docs/proposals/b2-integration/AUTHORIZATION.review.json'
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps({'ownerApproved':True,'referenceCommit':'1'*40,'scope':'persistent'}))
        with self.assertRaisesRegex(RuntimeError,'EXACT_COMPOSITION_SCOPE_REQUIRED'):
            runner.authorize_composition()

    def test_composition_requires_exact_artifact_set_and_bytes_even_with_approval(self):
        path=self.root/'docs/proposals/b2-integration/AUTHORIZATION.review.json'
        path.parent.mkdir(parents=True,exist_ok=True)
        owner=json.loads((ROOT/'docs/proposals/b2-integration/AUTHORIZATION.review.json').read_text())
        owner.update(ownerApproved=True,referenceCommit='1'*40)
        for name in owner['artifacts'].values():
            destination=self.root/name;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,destination)
        owner['sha256'][next(iter(owner['sha256']))]='0'*64
        path.write_text(json.dumps(owner))
        with patch.object(runner,'fixture_reference_bytes',side_effect=lambda package:(ROOT/package['tests']).read_bytes()), patch.object(runner.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout=b'not historical bytes')):
            with self.assertRaisesRegex(RuntimeError,'EXACT_COMPOSITION_BYTES_REQUIRED'):
                runner.authorize_composition()
        owner['artifacts']['extra']='unreviewed.sql';owner['sha256']['extra']='0'*64
        path.write_text(json.dumps(owner))
        with self.assertRaisesRegex(RuntimeError,'EXACT_COMPOSITION_ARTIFACTS_REQUIRED'):
            runner.authorize_composition()


class InvitationApprovalTests(unittest.TestCase):
    def test_sql5_missing_or_false_record_never_imports_transport(self):
        for script,record in [('b2-acceptance-postgres.review.py','invitation-acceptance-authorization.json'),('b2-acceptance-r2-postgres.review.py','invitation-acceptance-r2-authorization.json')]:
            spec=importlib.util.spec_from_file_location('sql5_preflight',ROOT/'scripts'/script)
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            with tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary)
                with patch.object(module,'ROOT',root),patch.object(module.subprocess,'run',side_effect=AssertionError('no transport before approval')):
                    with self.assertRaisesRegex(RuntimeError,'EXACT_SQL5_OWNER_APPROVAL_REQUIRED'):module.authorize()
                    path=root/'docs/implementation/b2'/record
                    path.parent.mkdir(parents=True);path.write_text(json.dumps({'ownerApproved':False}))
                    with self.assertRaisesRegex(RuntimeError,'EXACT_SQL5_OWNER_APPROVAL_REQUIRED'):module.authorize()

    def test_sql4_missing_or_false_record_never_authorizes_execution(self):
        spec=importlib.util.spec_from_file_location('sql4_preflight',ROOT/'scripts/b2-invitations-postgres.review.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            with patch.object(module,'ROOT',root):
                with self.assertRaisesRegex(RuntimeError,'EXACT_SQL4_OWNER_APPROVAL_REQUIRED'):module.authorize()
                path=root/'docs/implementation/b2/invitation-administration-authorization.json'
                path.parent.mkdir(parents=True);path.write_text(json.dumps({'ownerApproved':False}))
                with self.assertRaisesRegex(RuntimeError,'EXACT_SQL4_OWNER_APPROVAL_REQUIRED'):module.authorize()


if __name__=='__main__':unittest.main()
