"""Authorization gates only: never import a SQL fixture or invoke Docker/SQL."""
import importlib.util
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


if __name__=='__main__':unittest.main()
