"""Authorization gates only: never import a SQL fixture or invoke Docker/SQL."""
import importlib.util
import contextlib
import io
import json
import hashlib
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


def event_context(number=12, branch='feat/b2-users-access', review=False):
    """Synthetic unit-test data only; never exported to an execution workflow."""
    owner={'login':'novo34','id':17856013}
    repo={'full_name':'novo34/cleanops-360','id':1412999204,'fork':False,'owner':owner}
    event={'action':'submitted' if review else 'synchronize','repository':repo,'sender':owner,
           'pull_request':{'number':number,'state':'open','head':{'repo':repo,'ref':branch,'sha':'1'*40},
                           'base':{'repo':repo,'ref':'main'}}}
    if review:event['review']={'id':1,'user':owner,'state':'commented','commit_id':'1'*40,'body':''}
    env={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','GITHUB_REPOSITORY':repo['full_name'],
         'GITHUB_REPOSITORY_ID':str(repo['id']),'GITHUB_ACTOR':'novo34','GITHUB_ACTOR_ID':'17856013',
         'GITHUB_TRIGGERING_ACTOR':'novo34','GITHUB_RUN_ATTEMPT':'1',
         'GITHUB_HEAD_REF':branch,'GITHUB_EVENT_NAME':'pull_request_review' if review else 'pull_request'}
    return event,env


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
        event,env=event_context()
        event_path=self.root/'event.json';event_path.write_text(json.dumps(event))
        env['GITHUB_EVENT_PATH']=str(event_path)
        patch.dict(os.environ,env,clear=True).start()

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

    def test_historical_scopes_cannot_execute_changed_harness_under_old_approvals(self):
        destination=self.root/'scripts/b2-directory-postgres.py';destination.parent.mkdir(exist_ok=True)
        shutil.copyfile(ROOT/'scripts/b2-directory-postgres.py',destination)
        for scope in ['directory','access','users','combined']:
            with self.subTest(scope=scope),patch.object(runner,'authorize_composition',return_value={}),patch.object(runner,'load',side_effect=AssertionError('NO_TRANSPORT')) as transport,contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(runner.main(scope),1);transport.assert_not_called()
                report=json.loads((self.root/f'artifacts/b2-{scope}/report.json').read_text())
                self.assertEqual(report['checks'][0]['detail'],'HISTORICAL_APPROVAL_DOES_NOT_AUTHORIZE_NEW_HARNESS')

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


class R3ContractTests(unittest.TestCase):
    """Real artifact bytes; synthetic event and Git boundary, never native transport."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.candidate={}
        for name in runner.R3_FILES | {runner.R3_MANIFEST}:
            raw=(ROOT/name).read_bytes();self.candidate[name]=raw
            destination=self.root/name;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw)
        # Obtain provenance from actual immutable Git objects, never from the
        # changed working harness or a second embedded copy of that harness.
        self.historical={name:subprocess.check_output(
            ['git','--no-replace-objects','show',runner.COMPOSITION_REFERENCE+':'+name],cwd=ROOT)
            for name in runner.COMPOSITION_FILES | {runner.COMPOSITION_MANIFEST}}
        self.event,env=event_context(22,runner.R3_CONTEXT['branch'],review=True)
        env.update(GITHUB_REF='refs/pull/22/merge',GITHUB_WORKFLOW_SHA='2'*40,GITHUB_SHA='2'*40,
                   GITHUB_WORKFLOW_REF='novo34/cleanops-360/'+runner.R3_WORKFLOW+'@refs/pull/22/merge',GITHUB_RUN_ID='123')
        self.event_path=self.root/'event.json';env['GITHUB_EVENT_PATH']=str(self.event_path)
        self.addCleanup(patch.stopall)
        patch.object(runner,'ROOT',self.root).start()
        patch.dict(os.environ,env,clear=True).start()
        patch.object(runner,'git_bytes',side_effect=self.git_bytes).start()
        patch.object(runner,'fixture_reference_bytes',side_effect=lambda p:self.candidate[p['tests']]).start()
        patch.object(runner.subprocess,'run',side_effect=self.git_head).start()
        self.refresh_review()

    def git_bytes(self,reference,name):
        if reference=='1'*40:return self.candidate[name]
        if reference==runner.COMPOSITION_REFERENCE:return self.historical[name]
        if reference=='2'*40 and name==runner.R3_WORKFLOW:return self.candidate[name]
        if reference=='cd138d71fb8fd8e9298e17c0f69b83e259ef3eba':return self.candidate[name]
        raise AssertionError('Unexpected Git reference')

    def git_head(self,args,**kwargs):
        self.assertEqual(args,['git','--no-replace-objects','rev-parse','HEAD'])
        return subprocess.CompletedProcess(args,0,stdout=b'1'*40+b'\n')

    def refresh_review(self):
        raw=(self.root/runner.R3_MANIFEST).read_bytes()
        self.event['review']['body']=f"Execute owner-authorized SQL5-R3 candidate {'1'*40} manifest {hashlib.sha256(raw).hexdigest()} workflow {'2'*40}; native isolated validation only."
        self.write_event()

    def write_event(self):self.event_path.write_text(json.dumps(self.event))

    def reject_before_transport(self):
        with patch.object(runner,'load',side_effect=AssertionError('NO_TRANSPORT_OR_FIXTURE')) as transport,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.main('sql5-r3'),1)
            transport.assert_not_called()
        report=json.loads((self.root/'artifacts/b2-acceptance-r3/report.json').read_text())
        self.assertEqual(report['cleanup'],'SKIP');self.assertEqual(report['result'],'FAIL')
        return report['checks'][0]['detail']

    def test_positive_exact_bundle_and_real_guards_with_synthetic_review(self):
        self.assertTrue(runner.preflight(scope='sql5-r3'))
        result=runner.authorize_r3()
        self.assertEqual(result['tests'],runner.R3_FIXTURE)
        self.assertEqual(result['authorization']['candidate'],'1'*40)
        self.assertEqual(len(runner.R3_FILES),34)
        with patch.dict(os.environ,{'GITHUB_HEAD_REF':''}):
            self.assertTrue(runner.preflight(scope='sql5-r3'))

    def test_valid_authorization_still_cannot_activate_native_in_this_delivery(self):
        self.assertFalse(runner.R3_NATIVE_ENABLED)
        self.assertEqual(self.reject_before_transport(),'R3_NATIVE_ACTIVATION_REQUIRED')

    def test_all_context_mutations_fail_before_transport(self):
        changes=[('repository.id',9),('repository.full_name','other/repo'),('repository.owner.id',9),
                 ('sender.login','other'),('pull_request.number',12),('pull_request.state','closed'),
                 ('pull_request.head.ref','main'),('pull_request.head.repo.fork',True),
                 ('pull_request.base.ref','staging'),('review.user.id',9),('review.commit_id','3'*40),
                 ('review.state','approved'),('review.id',0),('action','edited')]
        pristine=json.dumps(self.event)
        for path,value in changes:
            with self.subTest(path=path):
                self.event=json.loads(pristine);target=self.event;parts=path.split('.')
                for part in parts[:-1]:target=target[part]
                target[parts[-1]]=value;self.write_event()
                self.assertNotEqual(self.reject_before_transport(),'R3_NATIVE_ACTIVATION_REQUIRED')
        self.event=json.loads(pristine);self.write_event()

    def test_wrong_or_missing_ci_environment_fails_closed(self):
        for key,value in [('GITHUB_EVENT_NAME','push'),('GITHUB_EVENT_NAME','pull_request_target'),
                          ('GITHUB_EVENT_NAME','issue_comment'),('GITHUB_EVENT_NAME','workflow_dispatch'),
                          ('RUNNER_ENVIRONMENT','self-hosted'),('GITHUB_REPOSITORY_ID','9'),
                          ('GITHUB_ACTOR_ID','9'),('GITHUB_ACTOR','other'),('GITHUB_TRIGGERING_ACTOR','other'),
                          ('GITHUB_RUN_ATTEMPT','2'),('GITHUB_HEAD_REF','feat/b2-users-access'),
                          ('GITHUB_EVENT_PATH','/nonexistent-event'),('GITHUB_ACTIONS','false')]:
            with self.subTest(key=key,value=value),patch.dict(os.environ,{key:value}):
                self.assertNotEqual(self.reject_before_transport(),'R3_NATIVE_ACTIVATION_REQUIRED')

    def test_sensitive_bindings_fail_without_disclosing_values(self):
        for key in ['DATABASE_URL','PGPASSWORD','PGOPTIONS','OPENBAO_TOKEN','DB_HOST','VAULT_TOKEN']:
            with self.subTest(key=key),patch.dict(os.environ,{key:'synthetic-private-value'}):
                self.assertEqual(self.reject_before_transport(),'EXTERNAL_DATABASE_OR_SECRET_BINDING_PRESENT')
                self.assertNotIn('synthetic-private-value',(self.root/'artifacts/b2-acceptance-r3/report.json').read_text())

    def test_missing_event_fields_do_not_infer_authority(self):
        for key in ['review','sender','repository','pull_request']:
            pristine=json.dumps(self.event);self.event.pop(key);self.write_event()
            self.assertNotEqual(self.reject_before_transport(),'R3_NATIVE_ACTIVATION_REQUIRED')
            self.event=json.loads(pristine);self.write_event()

    def test_new_review_does_not_accept_historical_or_partial_approval(self):
        good=self.event['review']['body']
        for body in ['@codex review','Execute owner-authorized SQL5-R2 0eb651f3cfce5733726ca1d122e09bd1d0162c26; native isolated validation only.',
                     good.replace('1'*40,'3'*40),good.replace('2'*40,'3'*40),good+'\n']:
            with self.subTest(body=body):
                self.event['review']['body']=body;self.write_event()
                self.assertEqual(self.reject_before_transport(),'NEW_R3_C_M_W_AUTHORIZATION_REQUIRED')
        self.event['review']['body']=good;self.write_event()

    def test_checkout_and_workflow_references_must_match(self):
        with patch.object(runner.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout=b'3'*40)):
            self.assertEqual(self.reject_before_transport(),'EXACT_R3_CHECKOUT_REQUIRED')
        for key,value in [('GITHUB_REF','refs/heads/main'),('GITHUB_WORKFLOW_REF','novo34/cleanops-360/other.yml@refs/pull/22/merge'),
                          ('GITHUB_SHA','3'*40),('GITHUB_WORKFLOW_SHA','short')]:
            with self.subTest(key=key),patch.dict(os.environ,{key:value}):
                self.assertNotEqual(self.reject_before_transport(),'R3_NATIVE_ACTIVATION_REQUIRED')
        with patch.object(runner,'git_bytes',side_effect=lambda ref,name:b'other workflow' if ref=='2'*40 else self.git_bytes(ref,name)):
            self.assertEqual(self.reject_before_transport(),'EXACT_R3_WORKFLOW_BYTES_REQUIRED')

    def test_manifest_missing_extra_schema_hash_and_json_errors(self):
        path=self.root/runner.R3_MANIFEST;original=path.read_bytes();value=json.loads(original)
        variants=[]
        v=json.loads(original);v['files'].pop(runner.R3_SQL);variants.append(v)
        v=json.loads(original);v['files']['extra.sql']='0'*64;variants.append(v)
        v=json.loads(original);v['ownerApproved']=True;variants.append(v)
        v=json.loads(original);v['scope']='persistent';variants.append(v)
        v=json.loads(original);v['historicalReferences']['compositionCommit']='3'*40;variants.append(v)
        v=json.loads(original);v['files'][runner.R3_SQL]='0'*64;variants.append(v)
        v=json.loads(original);v['files'][runner.R3_SQL]=None;variants.append(v)
        for variant in variants:
            with self.subTest(variant=variant.get('scope')):
                raw=json.dumps(variant).encode();path.write_bytes(raw);self.candidate[runner.R3_MANIFEST]=raw;self.refresh_review()
                self.assertNotEqual(self.reject_before_transport(),'R3_NATIVE_ACTIVATION_REQUIRED')
        path.write_text('{"files":{},"files":{}}');self.refresh_review()
        self.assertEqual(self.reject_before_transport(),'DUPLICATE_JSON_KEY')
        path.write_bytes(original);self.candidate[runner.R3_MANIFEST]=original;self.refresh_review()

    def test_mutated_missing_and_symlink_bundle_files_are_rejected(self):
        for name in [runner.R3_SQL,runner.R3_FIXTURE,'scripts/b2-directory-postgres.py',runner.R3_WORKFLOW]:
            path=self.root/name;original=path.read_bytes();path.write_bytes(original+b'\n')
            self.assertEqual(self.reject_before_transport(),'EXACT_R3_BUNDLE_BYTES_REQUIRED');path.write_bytes(original)
        path=self.root/runner.R3_SQL;raw=path.read_bytes();path.unlink()
        self.assertEqual(self.reject_before_transport(),'BUNDLE_FILE_REQUIRED')
        destination=self.root/'target';destination.write_bytes(raw);path.symlink_to(destination)
        self.assertEqual(self.reject_before_transport(),'BUNDLE_SYMLINK_FORBIDDEN')
        with self.assertRaisesRegex(RuntimeError,'INVALID_BUNDLE_PATH'):runner.artifact_bytes('../outside')

    def test_new_bundle_approval_cannot_erase_historical_provenance(self):
        with patch.object(runner,'git_bytes',side_effect=lambda ref,name:b'wrong' if ref==runner.COMPOSITION_REFERENCE else self.git_bytes(ref,name)):
            self.assertEqual(self.reject_before_transport(),'IMMUTABLE_HISTORICAL_MANIFEST_REQUIRED')
        original=self.historical['scripts/b2-directory-postgres.py'];self.historical['scripts/b2-directory-postgres.py']=b'changed historical harness'
        self.assertEqual(self.reject_before_transport(),'EXACT_HISTORICAL_BYTES_REQUIRED')
        self.historical['scripts/b2-directory-postgres.py']=original

    def test_even_rehashed_dependency_change_is_not_a_permitted_harness_change(self):
        name='docs/proposals/b2-integration/combined-tests.review.py'
        path=self.root/name;raw=path.read_bytes()+b'\n';path.write_bytes(raw);self.candidate[name]=raw
        manifest_path=self.root/runner.R3_MANIFEST;manifest=json.loads(manifest_path.read_bytes());manifest['files'][name]=hashlib.sha256(raw).hexdigest()
        raw=json.dumps(manifest).encode();manifest_path.write_bytes(raw);self.candidate[runner.R3_MANIFEST]=raw;self.refresh_review()
        self.assertEqual(self.reject_before_transport(),'UNEXPECTED_DEPENDENCY_CHANGE')

    def test_rehashed_security_values_cannot_expand_this_repair(self):
        name='lib/b1/security-values.json';path=self.root/name
        raw=path.read_bytes()+b'\n';path.write_bytes(raw);self.candidate[name]=raw
        manifest_path=self.root/runner.R3_MANIFEST;manifest=json.loads(manifest_path.read_bytes());manifest['files'][name]=hashlib.sha256(raw).hexdigest()
        raw=json.dumps(manifest).encode();manifest_path.write_bytes(raw);self.candidate[runner.R3_MANIFEST]=raw;self.refresh_review()
        self.assertEqual(self.reject_before_transport(),'UNEXPECTED_FIXED_DEPENDENCY_CHANGE')

    def test_malformed_approved_fixture_fails_ast_without_import(self):
        name=runner.R3_FIXTURE;raw=b'def run(:\n';(self.root/name).write_bytes(raw);self.candidate[name]=raw
        manifest_path=self.root/runner.R3_MANIFEST;manifest=json.loads(manifest_path.read_bytes());manifest['files'][name]=hashlib.sha256(raw).hexdigest()
        raw=json.dumps(manifest).encode();manifest_path.write_bytes(raw);self.candidate[runner.R3_MANIFEST]=raw;self.refresh_review()
        self.assertEqual(self.reject_before_transport(),'SyntaxError')

    def test_legacy_scopes_do_not_inherit_r3_branch_or_review(self):
        for scope in ['directory','access','users','combined','unknown']:
            with self.subTest(scope=scope),self.assertRaises(RuntimeError):runner.preflight(scope=scope)


class R3SqlArtifactTests(unittest.TestCase):
    OLD="coalesce(method->>'ciphertext','') !~ '^(?:[a-f0-9]{2}){29,512}$'"
    NEW="(length(coalesce(method->>'ciphertext','')) NOT BETWEEN 58 AND 1024 OR length(coalesce(method->>'ciphertext','')) % 2 <> 0 OR coalesce(method->>'ciphertext','') !~ '^[a-f0-9]+$')"

    def test_actual_historical_twenty_artifacts_and_full_new_bundle(self):
        historical=runner.git_bytes(runner.COMPOSITION_REFERENCE,runner.COMPOSITION_MANIFEST)
        self.assertEqual(hashlib.sha256(historical).hexdigest(),runner.COMPOSITION_MANIFEST_SHA)
        old=json.loads(historical);self.assertEqual(set(old['artifacts'].values()),runner.COMPOSITION_FILES)
        for key,name in old['artifacts'].items():
            raw=runner.git_bytes(runner.COMPOSITION_REFERENCE,name)
            self.assertEqual(hashlib.sha256(raw).hexdigest(),old['sha256'][key])
            if name!='scripts/b2-directory-postgres.py':self.assertEqual(raw,(ROOT/name).read_bytes())
        manifest=json.loads((ROOT/runner.R3_MANIFEST).read_bytes())
        self.assertEqual(set(manifest['files']),runner.R3_FILES)
        for name,digest in manifest['files'].items():self.assertEqual(hashlib.sha256((ROOT/name).read_bytes()).hexdigest(),digest)
        with self.assertRaisesRegex(RuntimeError,'EXACT_GIT_REFERENCE_REQUIRED'):runner.git_bytes('main',runner.R3_SQL)
        with self.assertRaisesRegex(RuntimeError,'EXACT_GIT_REFERENCE_REQUIRED'):runner.git_bytes('1'*40,'../outside')

    def test_candidate_is_exact_literal_single_change_preserving_entire_rest(self):
        base=(ROOT/'docs/proposals/b2-invitations/005-invitation-acceptance.r2.review.sql').read_text()
        candidate=(ROOT/runner.R3_SQL).read_text()
        self.assertEqual(base.count(self.OLD),1)
        self.assertEqual(candidate,base.replace(self.OLD,self.NEW))
        self.assertEqual(candidate.count('COMMIT;'),1)
        self.assertTrue(candidate.rstrip().endswith('COMMIT;'))
        for mutation in [candidate+candidate,candidate+'SELECT 1;',candidate.replace(self.NEW,self.NEW[:-3]),candidate[:-100]]:
            self.assertNotEqual(mutation,base.replace(self.OLD,self.NEW))

    def test_length_parity_and_hex_predicate_preserves_intended_regex_language(self):
        import re
        # Python models the intended language; this does NOT validate PostgreSQL's
        # bounded-quantifier implementation, catalog or runtime expression.
        values=['a'*n for n in range(1100)]+['','AB'*29,'g0'*29,'00'*29+'\n','00'*512,'0f'*29,'0f'*513]
        for value in values:
            intended=bool(re.fullmatch(r'(?:[a-f0-9]{2}){29,512}',value))
            repaired=58<=len(value)<=1024 and len(value)%2==0 and bool(re.fullmatch(r'[a-f0-9]+',value))
            self.assertEqual(repaired,intended,len(value))

    def test_javascript_dollar_apostrophe_corruption_reproduces_historical_hash(self):
        if not shutil.which('node'):self.skipTest('Node unavailable: JS replacement regression NOT_VALIDATED')
        base=(ROOT/'docs/proposals/b2-invitations/005-invitation-acceptance.r2.review.sql').read_text()
        script="const fs=require('fs'),c=require('crypto');const [b,o,n]=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify([c.createHash('sha256').update(b.replace(o,n)).digest('hex'),b.replace(o,()=>n)]))"
        result=subprocess.run(['node','-e',script],input=json.dumps([base,self.OLD,self.NEW]),text=True,capture_output=True,check=True)
        historical,safe=json.loads(result.stdout)
        self.assertEqual(historical,'14f1f9ba932e1f3f88e8fcbfa9226378ad801618abec532301bac40a8e63d62b')
        self.assertEqual(safe,(ROOT/runner.R3_SQL).read_text())

    def test_fixture_only_rebinds_candidate_path_from_immutable_r3(self):
        raw=(ROOT/runner.R3_FIXTURE).read_bytes()
        restored=raw.replace(b'005-invitation-acceptance.r3-candidate.review.sql',b'005-invitation-acceptance.r3.review.sql')
        self.assertEqual(hashlib.sha256(restored).hexdigest(),'02b5922a9b02ed0c0a4c93009fb455e3b7f75ce9e68e1f8429a66ff23cc6c68a')
        import ast
        ast.parse(raw)  # Syntax only: NEVER import or call run(b).

    def test_lexical_integrity_includes_quoted_function_bodies_not_native_parse(self):
        import re
        spec=importlib.util.spec_from_file_location('existing_sql_lexer',ROOT/'scripts/review-b1-consolidated.py')
        lexer=importlib.util.module_from_spec(spec);spec.loader.exec_module(lexer)
        base=(ROOT/'docs/proposals/b2-invitations/005-invitation-acceptance.r2.review.sql').read_text()
        sql=(ROOT/runner.R3_SQL).read_text();items=lexer.statements(sql);old=lexer.statements(base)
        self.assertEqual(items[0],['BEGIN']);self.assertEqual(items[-1],['COMMIT'])
        self.assertEqual(sum(item==['COMMIT'] for item in items),1)
        self.assertEqual(len(items),len(old))
        self.assertEqual([x for x in items if lexer.classify(x)[0]=='acl'],[x for x in old if lexer.classify(x)[0]=='acl'])
        for item in items:
            for token in item:
                match=re.match(r'^\$[A-Za-z_0-9]*\$',token)
                if match:
                    body=token[len(match[0]):-len(match[0])]
                    lexer.statements(body+';')  # Quoting/dollar delimiters, not PL/pgSQL grammar.
        with self.assertRaises(ValueError):lexer.statements(sql.replace('END $fn$;','END $broken$;',1))

    def test_available_pg16_parser_or_explicit_skip(self):
        if importlib.util.find_spec('pglast') is None:self.skipTest('pglast absent: PostgreSQL/PLpgSQL grammar NOT_VALIDATED')
        spec=importlib.util.spec_from_file_location('existing_pg_parser',ROOT/'scripts/parse-b1-sql.py')
        parser=importlib.util.module_from_spec(spec);spec.loader.exec_module(parser)
        self.assertEqual(parser.get_postgresql_version()[0],16)
        self.assertEqual(parser.inspect(ROOT/runner.R3_SQL)['errors'],[])

    def test_native_workflow_branch_is_explicitly_closed_and_has_single_entrypoint(self):
        text=(ROOT/runner.R3_WORKFLOW).read_text()
        self.assertIn('(false && github.event.pull_request.number == 22',text)
        self.assertIn('if: ${{ false }}',text)
        self.assertEqual(text.count('python scripts/b2-directory-postgres.py --package sql5-r3'),1)
        self.assertNotIn('pull_request_target:',text);self.assertNotIn('workflow_dispatch:',text)


if __name__=='__main__':unittest.main()
