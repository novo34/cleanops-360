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
        self.event['pull_request']['base']['sha']='4'*40
        env.update(GITHUB_REF='refs/pull/22/merge',GITHUB_WORKFLOW_SHA='2'*40,GITHUB_SHA='2'*40,
                   GITHUB_WORKFLOW_REF='novo34/cleanops-360/'+runner.R3_WORKFLOW+'@refs/pull/22/merge',GITHUB_RUN_ID='123')
        self.event_path=self.root/'event.json';env['GITHUB_EVENT_PATH']=str(self.event_path)
        self.addCleanup(patch.stopall)
        patch.object(runner,'ROOT',self.root).start()
        patch.dict(os.environ,env,clear=True).start()
        patch.object(runner,'git_bytes',side_effect=self.git_bytes).start()
        self.now=1800000000
        patch.object(runner.time,'time',return_value=self.now).start()
        self.event['review']['submitted_at']=runner.datetime.fromtimestamp(self.now,runner.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        patch.object(runner,'fixture_reference_bytes',side_effect=lambda p:self.candidate[p['tests']]).start()
        patch.object(runner.subprocess,'run',side_effect=self.git_head).start()
        self.refresh_review()

    def git_bytes(self,reference,name,**kwargs):
        if reference=='1'*40:return self.candidate[name]
        if reference==runner.COMPOSITION_REFERENCE:return self.historical[name]
        if reference=='2'*40 and name==runner.R3_WORKFLOW:return self.candidate[name]
        if reference=='cd138d71fb8fd8e9298e17c0f69b83e259ef3eba':return self.candidate[name]
        raise AssertionError('Unexpected Git reference')

    def git_head(self,args,**kwargs):
        if args==['git','--no-replace-objects','rev-list','--parents','-n','1','2'*40]:
            return subprocess.CompletedProcess(args,0,stdout=('2'*40+' '+'4'*40+' '+'1'*40+'\n').encode())
        if 'ls-remote' in args:
            self.assertEqual(args,['git','--no-replace-objects','ls-remote','--exit-code',
                'https://github.com/novo34/cleanops-360.git','refs/heads/main',
                'refs/heads/'+runner.R3_CONTEXT['branch'],'refs/pull/22/merge'])
            return subprocess.CompletedProcess(args,0,stdout=(
                '4'*40+'\trefs/heads/main\n'+'1'*40+'\trefs/heads/'+runner.R3_CONTEXT['branch']+'\n'+'2'*40+'\trefs/pull/22/merge\n').encode())
        self.assertEqual(args,['git','--no-replace-objects','rev-parse','HEAD'])
        return subprocess.CompletedProcess(args,0,stdout=b'1'*40+b'\n')

    def refresh_review(self):
        raw=(self.root/runner.R3_MANIFEST).read_bytes()
        self.event['review']['body']=f"Execute owner-authorized SQL5-R3 candidate {'1'*40} manifest {hashlib.sha256(raw).hexdigest()} workflow {'2'*40} base {'4'*40}; native isolated validation only."
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

    def test_valid_authorization_reaches_only_intercepted_transport_boundary(self):
        class TransportBoundaryReached(BaseException):pass
        self.assertTrue(runner.R3_NATIVE_ENABLED)
        # BaseException escapes main's operational Exception handler. The real
        # loader, Docker, SQL and fixtures are never invoked, even on success.
        with patch.object(runner,'load',side_effect=TransportBoundaryReached) as transport,contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(TransportBoundaryReached):runner.main('sql5-r3')
            transport.assert_called_once_with('b2_original_b1_transport','scripts/pg-test-01.py')
        report=json.loads((self.root/'artifacts/b2-acceptance-r3/report.json').read_text())
        self.assertEqual(report['authorization']['base'],'4'*40)

    def test_base_is_mandatory_exact_and_bound_in_review(self):
        good=json.dumps(self.event)
        for value in [None,'','short','5'*40]:
            with self.subTest(base=value):
                self.event=json.loads(good);self.event['pull_request']['base']['sha']=value;self.write_event()
                self.reject_before_transport()
        self.event=json.loads(good)
        self.event['review']['body']=self.event['review']['body'].replace(' base '+'4'*40,'')
        self.write_event()
        self.assertEqual(self.reject_before_transport(),'NEW_R3_C_M_W_AUTHORIZATION_REQUIRED')

    def test_W_must_have_exact_B_then_C_as_its_only_parents(self):
        for parents in [('2'*40,'1'*40,'4'*40),('2'*40,'5'*40,'1'*40),
                        ('2'*40,'4'*40),('2'*40,'4'*40,'1'*40,'5'*40)]:
            def changed(args,**kwargs):
                if 'rev-list' in args:return subprocess.CompletedProcess(args,0,stdout=(' '.join(parents)+'\n').encode())
                return self.git_head(args,**kwargs)
            with self.subTest(parents=parents),patch.object(runner.subprocess,'run',side_effect=changed):
                self.assertEqual(self.reject_before_transport(),'EXACT_R3_MERGE_PARENTS_REQUIRED')

    def test_current_refs_must_match_all_three_pinned_commits(self):
        good=self.git_head(['git','--no-replace-objects','ls-remote','--exit-code',
            'https://github.com/novo34/cleanops-360.git','refs/heads/main',
            'refs/heads/'+runner.R3_CONTEXT['branch'],'refs/pull/22/merge']).stdout
        variants=[good.replace(value.encode(),b'5'*40) for value in ['1'*40,'2'*40,'4'*40]]
        variants += [b'',b'malformed\n',good.splitlines(True)[0]*3,good+good.splitlines(True)[0]]
        for output in variants:
            def changed(args,**kwargs):
                if 'ls-remote' in args:return subprocess.CompletedProcess(args,0,stdout=output)
                return self.git_head(args,**kwargs)
            with self.subTest(output=output),patch.object(runner.subprocess,'run',side_effect=changed):
                self.assertEqual(self.reject_before_transport(),'CURRENT_R3_REFERENCES_REQUIRED')

    def test_unavailable_refs_fail_without_logging_remote_output(self):
        for failure in [subprocess.CompletedProcess([],1,stdout=b'',stderr=b'synthetic-private-value'),
                        subprocess.TimeoutExpired('git',30),OSError('synthetic-private-value')]:
            def changed(args,**kwargs):
                if 'ls-remote' in args:
                    if isinstance(failure,Exception):raise failure
                    return failure
                return self.git_head(args,**kwargs)
            with self.subTest(failure=type(failure).__name__),patch.object(runner.subprocess,'run',side_effect=changed):
                self.assertEqual(self.reject_before_transport(),'CURRENT_R3_REFERENCES_REQUIRED')
                self.assertNotIn('synthetic-private-value',(self.root/'artifacts/b2-acceptance-r3/report.json').read_text())

    def test_native_flag_is_single_literal_true_in_reviewed_source(self):
        import ast
        tree=ast.parse((ROOT/'scripts/b2-directory-postgres.py').read_bytes())
        assignments=[node for node in ast.walk(tree) if isinstance(node,ast.Assign)
                     and any(isinstance(target,ast.Name) and target.id=='R3_NATIVE_ENABLED' for target in node.targets)]
        self.assertEqual(len(assignments),1)
        self.assertIs(ast.literal_eval(assignments[0].value),True)

    def test_all_native_preconditions_precede_first_transport_import(self):
        import ast
        tree=ast.parse((ROOT/'scripts/b2-directory-postgres.py').read_bytes())
        main=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='main')
        body=next(node for node in main.body if isinstance(node,ast.Try)).body
        self.assertIsInstance(body[0],ast.Assign)
        self.assertEqual(body[0].value.func.id,'preflight')
        self.assertIsInstance(body[1],ast.If)
        self.assertEqual(body[1].body[0].value.func.id,'authorize_r3')
        loads=[node for node in ast.walk(main) if isinstance(node,ast.Call)
               and isinstance(node.func,ast.Name) and node.func.id=='load']
        self.assertTrue(loads)
        self.assertGreater(min(node.lineno for node in loads),body[1].end_lineno)
        calls=[node for node in ast.walk(main) if isinstance(node,ast.Call)
               and isinstance(node.func,ast.Attribute) and node.func.attr in {'docker','sql','fixtures','footprint'}]
        self.assertTrue(calls)
        self.assertGreater(min(node.lineno for node in calls),min(node.lineno for node in loads))

    def test_run_id_cannot_be_missing_or_fabricated(self):
        for value in ['', '0','-1','123x']:
            with self.subTest(run=value),patch.dict(os.environ,{'GITHUB_RUN_ID':value}):
                self.assertEqual(self.reject_before_transport(),'EXACT_R3_RUN_REQUIRED')

    def test_missing_merge_object_rejects_before_transport_even_with_exact_review(self):
        def available(reference,name,**kwargs):
            if reference=='2'*40:
                raise RuntimeError('EXACT_GIT_OBJECT_REQUIRED')
            return self.git_bytes(reference,name)
        with patch.object(runner,'git_bytes',side_effect=available):
            self.assertEqual(self.reject_before_transport(),'EXACT_GIT_OBJECT_REQUIRED')

    def test_observation_permission_cannot_become_native_permission(self):
        digest=hashlib.sha256((self.root/runner.R3_MANIFEST).read_bytes()).hexdigest()
        self.event['review']['body']=f"Observe owner-authorized SQL5-R3 workflow context candidate {'1'*40} manifest {digest}; metadata only, no services or SQL."
        self.write_event()
        self.assertEqual(self.reject_before_transport(),'NEW_R3_C_M_W_AUTHORIZATION_REQUIRED')

    def test_old_commit_and_workflow_permissions_are_not_renewed_by_a_new_review(self):
        good=self.event['review']['body']
        for old in [good.replace('1'*40,'ad6b1975e3d1aa9baac6b467b5e39634b3cbf577'),
                    good.replace('2'*40,'9f2df5c3cf4a15ddc463d564a8823f42dc90139d')]:
            with self.subTest(body=old):
                self.event['review']['body']=old;self.write_event()
                self.assertEqual(self.reject_before_transport(),'NEW_R3_C_M_W_AUTHORIZATION_REQUIRED')

    def test_pending_activation_must_reject_expired_review_before_native_gate(self):
        self.event['review']['submitted_at']='2000-01-01T00:00:00Z';self.write_event()
        self.assertEqual(self.reject_before_transport(),'FRESH_R3_OWNER_REVIEW_REQUIRED')

    def test_pending_activation_must_reject_future_review_before_native_gate(self):
        self.event['review']['submitted_at']='2999-01-01T00:00:00Z';self.write_event()
        self.assertEqual(self.reject_before_transport(),'FRESH_R3_OWNER_REVIEW_REQUIRED')

    def test_pending_activation_must_require_review_timestamp_before_native_gate(self):
        self.event['review'].pop('submitted_at',None);self.write_event()
        self.assertEqual(self.reject_before_transport(),'FRESH_R3_OWNER_REVIEW_REQUIRED')

    def test_UTC_lifetime_boundaries_and_invalid_dates(self):
        for age,accepted in [(0,True),(899,True),(900,True),(900.001,False),(-0.001,False)]:
            with self.subTest(age=age),patch.object(runner.time,'time',return_value=self.now+age):
                if accepted:
                    with patch.object(runner,'load',side_effect=AssertionError('NO_TRANSPORT')) as transport:
                        self.assertEqual(runner.authorize_r3()['authorization']['base'],'4'*40)
                        transport.assert_not_called()
                else:self.assertEqual(self.reject_before_transport(),'FRESH_R3_OWNER_REVIEW_REQUIRED')
        for value in [None,0,'','not-a-date','2027-02-30T00:00:00Z','2027-01-15T08:00:00+00:00',
                      '2027-01-15T08:00:00','2027-01-15T08:00:00Z\n']:
            with self.subTest(timestamp=value):
                self.event['review']['submitted_at']=value;self.write_event()
                self.assertEqual(self.reject_before_transport(),'FRESH_R3_OWNER_REVIEW_REQUIRED')

    def test_fetch_or_provenance_cannot_extend_review_lifetime(self):
        with patch.object(runner.time,'time',side_effect=[self.now,self.now,self.now+901]):
            self.assertEqual(self.reject_before_transport(),'FRESH_R3_OWNER_REVIEW_REQUIRED')

    def test_environment_timestamps_cannot_renew_expired_review(self):
        self.event['review']['submitted_at']='2000-01-01T00:00:00Z';self.write_event()
        with patch.dict(os.environ,{'REVIEW_SUBMITTED_AT':'2027-01-15T08:00:00Z','AUTHORIZATION_EXPIRES_AT':'2999-01-01T00:00:00Z'}):
            self.assertEqual(self.reject_before_transport(),'FRESH_R3_OWNER_REVIEW_REQUIRED')

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
                self.reject_before_transport()
        self.event=json.loads(pristine);self.write_event()

    def test_wrong_or_missing_ci_environment_fails_closed(self):
        for key,value in [('GITHUB_EVENT_NAME','push'),('GITHUB_EVENT_NAME','pull_request_target'),
                          ('GITHUB_EVENT_NAME','issue_comment'),('GITHUB_EVENT_NAME','workflow_dispatch'),
                          ('RUNNER_ENVIRONMENT','self-hosted'),('GITHUB_REPOSITORY_ID','9'),
                          ('GITHUB_ACTOR_ID','9'),('GITHUB_ACTOR','other'),('GITHUB_TRIGGERING_ACTOR','other'),
                          ('GITHUB_RUN_ATTEMPT','2'),('GITHUB_HEAD_REF','feat/b2-users-access'),
                          ('GITHUB_EVENT_PATH','/nonexistent-event'),('GITHUB_ACTIONS','false')]:
            with self.subTest(key=key,value=value),patch.dict(os.environ,{key:value}):
                self.reject_before_transport()

    def test_sensitive_bindings_fail_without_disclosing_values(self):
        for key in ['DATABASE_URL','PGPASSWORD','PGOPTIONS','OPENBAO_TOKEN','DB_HOST','VAULT_TOKEN']:
            with self.subTest(key=key),patch.dict(os.environ,{key:'synthetic-private-value'}):
                self.assertEqual(self.reject_before_transport(),'EXTERNAL_DATABASE_OR_SECRET_BINDING_PRESENT')
                self.assertNotIn('synthetic-private-value',(self.root/'artifacts/b2-acceptance-r3/report.json').read_text())

    def test_missing_event_fields_do_not_infer_authority(self):
        for key in ['review','sender','repository','pull_request']:
            pristine=json.dumps(self.event);self.event.pop(key);self.write_event()
            self.reject_before_transport()
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
                self.reject_before_transport()
        with patch.object(runner,'git_bytes',side_effect=lambda ref,name,**kwargs:b'other workflow' if ref=='2'*40 else self.git_bytes(ref,name)):
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
                self.reject_before_transport()
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
        with patch.object(runner,'git_bytes',side_effect=lambda ref,name,**kwargs:b'wrong' if ref==runner.COMPOSITION_REFERENCE else self.git_bytes(ref,name)):
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

    def test_native_workflow_requires_new_authorization_and_has_single_entrypoint(self):
        text=(ROOT/runner.R3_WORKFLOW).read_text()
        self.assertTrue(runner.R3_NATIVE_ENABLED)
        self.assertIn('R3 capability requires a new exact C/M/W/B review',text)
        self.assertEqual(text.count('python scripts/b2-directory-postgres.py --package sql5-r3'),1)
        self.assertNotIn('pull_request_target:',text);self.assertNotIn('workflow_dispatch:',text)


class R3MergeObjectAvailabilityTests(unittest.TestCase):
    def test_heads_and_tags_fetch_does_not_fetch_merge_but_exact_ref_fetch_preserves_C(self):
        # Local Git objects only, no GitHub event, network, SQL or transport.
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);origin=root/'origin.git';checkout=root/'checkout'
            identity=dict(os.environ,GIT_AUTHOR_NAME='Static test',GIT_AUTHOR_EMAIL='static@example.invalid',
                          GIT_COMMITTER_NAME='Static test',GIT_COMMITTER_EMAIL='static@example.invalid')
            def git(where,*args,data=None,check=True):
                return subprocess.run(['git','--no-replace-objects',*args],cwd=where,input=data,
                                      capture_output=True,check=check,env=identity)
            git(root,'init','--bare',str(origin));git(root,'init',str(checkout))
            blob=git(origin,'hash-object','-w','--stdin',data=b'workflow fixture only\n').stdout.strip()
            tree=git(origin,'mktree',data=b'100644 blob '+blob+b'\tworkflow.yml\n').stdout.strip().decode()
            base=git(origin,'commit-tree',tree,'-m','base').stdout.strip().decode()
            candidate=git(origin,'commit-tree',tree,'-p',base,'-m','candidate').stdout.strip().decode()
            workflow=git(origin,'commit-tree',tree,'-p',base,'-p',candidate,'-m','merge').stdout.strip().decode()
            git(origin,'update-ref','refs/heads/main',base)
            git(origin,'update-ref','refs/heads/'+runner.R3_CONTEXT['branch'],candidate)
            git(origin,'update-ref','refs/pull/22/merge',workflow)
            git(checkout,'remote','add','origin',str(origin))
            git(checkout,'fetch','--no-tags','origin','+refs/heads/*:refs/remotes/origin/*','+refs/tags/*:refs/tags/*')
            git(checkout,'checkout','--detach',candidate)
            self.assertNotEqual(git(checkout,'cat-file','-e',workflow+'^{commit}',check=False).returncode,0)
            # Exercise the real helper, allowing its existing exact path only.
            path=runner.R3_WORKFLOW
            with patch.object(runner,'ROOT',checkout):
                with self.assertRaisesRegex(RuntimeError,'EXACT_GIT_OBJECT_REQUIRED'):
                    runner.git_bytes(workflow,path)
            git(checkout,'fetch','--no-tags','origin','refs/pull/22/merge')
            self.assertEqual(git(checkout,'show',workflow+':workflow.yml').stdout,b'workflow fixture only\n')
            self.assertEqual(git(checkout,'rev-parse','HEAD').stdout.strip().decode(),candidate)


class R3WorkflowFetchTests(unittest.TestCase):
    def test_exact_SHA_acquisition_uses_fixed_repository_and_preserves_checkout(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source';checkout=root/'checkout'
            source.mkdir();checkout.mkdir()
            real_run=subprocess.run;calls=[]
            def git(where,*args):
                return real_run(['git','--no-replace-objects',*args],cwd=where,check=True,capture_output=True)
            git(source,'init');path=source/runner.R3_WORKFLOW;path.parent.mkdir(parents=True)
            path.write_bytes(b'name: static workflow fixture\n');git(source,'add','.')
            git(source,'-c','user.name=Static test','-c','user.email=static@example.invalid','commit','-m','C')
            candidate=git(source,'rev-parse','HEAD').stdout.strip()
            git(checkout,'init');git(checkout,'fetch','--no-tags',str(source),candidate.decode())
            git(checkout,'checkout','--detach',candidate.decode())
            git(source,'-c','user.name=Static test','-c','user.email=static@example.invalid','commit','--allow-empty','-m','W')
            workflow=git(source,'rev-parse','HEAD').stdout.strip().decode()
            def local_only(args,**kwargs):
                calls.append(args)
                self.assertEqual(args[:2],['git','--no-replace-objects'])
                if 'fetch' in args:
                    self.assertEqual(args[-2:],['https://github.com/novo34/cleanops-360.git',workflow])
                    self.assertIn('--no-write-fetch-head',args);self.assertIn('--no-recurse-submodules',args)
                    self.assertIn('--no-auto-maintenance',args)
                    args=args[:-2]+[str(source),workflow]  # Substitute only the network boundary.
                return real_run(args,**kwargs)
            with patch.object(runner,'ROOT',checkout),patch.dict(os.environ,{'GITHUB_WORKFLOW_SHA':workflow}),patch.object(runner.subprocess,'run',side_effect=local_only):
                self.assertEqual(runner.git_bytes(workflow,runner.R3_WORKFLOW,fetch_workflow=True),path.read_bytes())
                self.assertEqual(sum('fetch' in args for args in calls),1)
                calls.clear()
                self.assertEqual(runner.git_bytes(workflow,runner.R3_WORKFLOW,fetch_workflow=True),path.read_bytes())
                self.assertFalse(any('fetch' in args for args in calls))
            self.assertEqual(git(checkout,'rev-parse','HEAD').stdout.strip(),candidate)
            self.assertEqual(git(checkout,'for-each-ref','refs/heads','refs/remotes').stdout,b'')

    def test_fetch_failure_timeout_or_wrong_object_never_verifies(self):
        workflow='2'*40
        bad='synthetic-private-value'
        failures=[subprocess.CompletedProcess([],1,stdout=b'',stderr=bad.encode()),
                  subprocess.TimeoutExpired('git',60,stderr=bad.encode()),OSError(bad)]
        with patch.dict(os.environ,{'GITHUB_WORKFLOW_SHA':workflow}):
            for failure in failures:
                sequence=[subprocess.CompletedProcess([],1),failure]
                with self.subTest(failure=type(failure).__name__),patch.object(runner.subprocess,'run',side_effect=sequence):
                    with self.assertRaisesRegex(RuntimeError,'^EXACT_R3_WORKFLOW_FETCH_FAILED$'):
                        runner.git_bytes(workflow,runner.R3_WORKFLOW,fetch_workflow=True)
            for code,output in [(1,b''),(0,b'3'*40),(0,b'')]:
                sequence=[subprocess.CompletedProcess([],1),subprocess.CompletedProcess([],0),
                          subprocess.CompletedProcess([],code,stdout=output)]
                with self.subTest(code=code,output=output),patch.object(runner.subprocess,'run',side_effect=sequence):
                    with self.assertRaisesRegex(RuntimeError,'^EXACT_R3_WORKFLOW_OBJECT_REQUIRED$'):
                        runner.git_bytes(workflow,runner.R3_WORKFLOW,fetch_workflow=True)

    def test_fetch_cannot_select_mutable_ref_other_SHA_or_other_file(self):
        with patch.dict(os.environ,{'GITHUB_WORKFLOW_SHA':'2'*40}),patch.object(runner.subprocess,'run',side_effect=AssertionError('NO_FETCH')):
            for reference,name in [('refs/pull/22/merge',runner.R3_WORKFLOW),('3'*40,runner.R3_WORKFLOW),('2'*40,runner.R3_SQL)]:
                with self.subTest(reference=reference,name=name),self.assertRaises(RuntimeError):
                    runner.git_bytes(reference,name,fetch_workflow=True)


class ActionsCondition:
    """Evaluate this workflow's small expression subset, never Python eval.

    This verifies Boolean routing under fixtures, not GitHub's actual W/ref.
    YAML syntax is checked separately with the available YAML parser.
    """
    def __init__(self,text,context):
        import re
        text=text.strip()
        if text.startswith('${{'):text=text[3:-2].strip()
        pattern=r"'(?:[^']|'')*'|&&|\|\||==|!=|[(),]|[A-Za-z_][A-Za-z_0-9.]*|[0-9]+"
        matches=list(re.finditer(pattern,text));self.tokens=[];at=0
        for match in matches:
            if text[at:match.start()].strip():raise ValueError('Unsupported condition')
            self.tokens.append(match.group());at=match.end()
        if text[at:].strip():raise ValueError('Unsupported condition')
        self.at=0;self.context=context

    def take(self,token):
        if self.at<len(self.tokens) and self.tokens[self.at]==token:self.at+=1;return True
        return False

    def atom(self):
        if self.take('('):
            value=self.expression();assert self.take(')');return value
        token=self.tokens[self.at];self.at+=1
        if token.startswith("'"):return token[1:-1].replace("''", "'")
        if token in ('true','false'):return token=='true'
        if token.isdigit():return int(token)
        if self.take('('):
            args=[]
            if not self.take(')'):
                while True:
                    args.append(self.expression())
                    if self.take(')'):break
                    assert self.take(',')
            if token=='format':return args[0].format(*args[1:])
            if token=='startsWith':return isinstance(args[0],str) and args[0].startswith(args[1])
            if token=='endsWith':return isinstance(args[0],str) and args[0].endswith(args[1])
            raise ValueError('Unsupported function')
        value=self.context
        for part in token.split('.'):value=value.get(part) if isinstance(value,dict) else None
        return value

    def comparison(self):
        value=self.atom()
        for op in ('==','!='):
            if self.take(op):
                other=self.atom();return value==other if op=='==' else value!=other
        return value

    def conjunction(self):
        value=self.comparison()
        while self.take('&&'):
            other=self.comparison();value=other if value else value
        return value

    def expression(self):
        value=self.conjunction()
        while self.take('||'):
            other=self.conjunction();value=value if value else other
        return value

    def evaluate_value(self):
        value=self.expression();assert self.at==len(self.tokens);return value

    def evaluate(self):return bool(self.evaluate_value())


class R3DiagnosticTests(unittest.TestCase):
    """Execute only the inline collector against synthetic data in tempdir.

    Never submit a GitHub review, import a native fixture or run transport.
    The sole subprocess is intercepted and must be a read-only Git HEAD query.
    """
    PREFIX='Observe owner-authorized SQL5-R3 workflow context candidate '

    @classmethod
    def setUpClass(cls):
        import re,textwrap,ast
        cls.workflow=(ROOT/runner.R3_WORKFLOW).read_text()
        cls.job_condition=' '.join(re.search(r'    if: >-\n((?:      .*\n)+)',cls.workflow).group(1).split())
        start=cls.workflow.index('      - name: Observe owner-authorized R3 workflow context without services')
        block=cls.workflow[start:cls.workflow.index('      - name: Verify exact approved dependencies',start)]
        cls.step_condition=next(line.strip()[4:] for line in block.splitlines() if line.strip().startswith('if:'))
        cls.code=textwrap.dedent(block.split("          python - <<'PY'\n",1)[1].rsplit('          PY',1)[0])
        cls.tree=ast.parse(cls.code)
        # Reject an accidental process/API import before executing test code.
        allowed={'hashlib','json','os','pathlib','re','subprocess'}
        for node in ast.walk(cls.tree):
            if isinstance(node,ast.Import):assert all(n.name in allowed for n in node.names)
            if isinstance(node,ast.ImportFrom):assert node.module in allowed
            if isinstance(node,ast.Call):
                name=node.func.id if isinstance(node.func,ast.Name) else node.func.attr if isinstance(node.func,ast.Attribute) else ''
                assert name not in {'eval','exec','__import__','load','connect','docker','sql','main','preflight','system','popen','Popen'}
                if isinstance(node.func,ast.Attribute) and isinstance(node.func.value,ast.Name):
                    if node.func.value.id=='os':raise AssertionError('No OS execution API permitted')
                    if node.func.value.id=='subprocess':
                        assert node.func.attr=='run'
                        assert ast.literal_eval(node.args[0])==['git','--no-replace-objects','rev-parse','HEAD']

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        for name in [runner.R3_MANIFEST,runner.R3_WORKFLOW]:
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,p)
        self.event,self.env=event_context(22,runner.R3_CONTEXT['branch'],review=True)
        self.event=json.loads(json.dumps(self.event))
        self.event_path=self.root/'event.json'
        self.env.update(GITHUB_EVENT_PATH=str(self.event_path),GITHUB_REPOSITORY_OWNER='novo34',
                        GITHUB_REF='refs/pull/22/merge',GITHUB_SHA='2'*40,GITHUB_WORKFLOW_SHA='3'*40,
                        GITHUB_WORKFLOW_REF='novo34/cleanops-360/'+runner.R3_WORKFLOW+'@refs/pull/22/merge',GITHUB_RUN_ID='123')
        digest=hashlib.sha256((self.root/runner.R3_MANIFEST).read_bytes()).hexdigest()
        self.event['review']['body']=self.PREFIX+'1'*40+f' manifest {digest}; metadata only, no services or SQL.'

    def context(self,event=None,env=None):
        event=self.event if event is None else event;env=self.env if env is None else env
        return {'github':{'event':event,'event_name':env.get('GITHUB_EVENT_NAME'),
                'repository':env.get('GITHUB_REPOSITORY'),'repository_id':env.get('GITHUB_REPOSITORY_ID'),
                'repository_owner':env.get('GITHUB_REPOSITORY_OWNER'),'actor':env.get('GITHUB_ACTOR'),
                'actor_id':env.get('GITHUB_ACTOR_ID'),'triggering_actor':env.get('GITHUB_TRIGGERING_ACTOR'),
                'run_attempt':int(env.get('GITHUB_RUN_ATTEMPT','0')),'ref':env.get('GITHUB_REF')}}

    def eligible(self,event=None,env=None):
        return ActionsCondition(self.job_condition,self.context(event,env)).evaluate()

    def collect(self,event=None,env=None,checkout=None):
        event=self.event if event is None else event;env=self.env if env is None else env
        self.event_path.write_text(json.dumps(event))
        def git_only(args,**kwargs):
            self.assertEqual(args,['git','--no-replace-objects','rev-parse','HEAD'])
            self.assertTrue(kwargs['check']);self.assertTrue(kwargs['capture_output'])
            return subprocess.CompletedProcess(args,0,stdout=(checkout or '1'*40)+'\n')
        output=io.StringIO()
        with contextlib.chdir(self.root),patch.dict(os.environ,env,clear=True),patch.object(subprocess,'run',side_effect=git_only) as commands,patch.object(runner,'load',side_effect=AssertionError('NO_NATIVE_TRANSPORT')) as transport,contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as stopped:exec(compile(self.tree,'workflow-diagnostic-inline','exec'),{'__name__':'__main__'})
            transport.assert_not_called()
        path=self.root/'artifacts/b2-acceptance-r3/workflow-context.json'
        report=json.loads(path.read_text()) if path.is_file() else None
        return stopped.exception.code,report,output.getvalue(),commands.call_count

    def test_synthetic_positive_keeps_C_event_and_W_distinct(self):
        self.assertTrue(self.eligible())
        self.assertTrue(ActionsCondition(self.step_condition,self.context()).evaluate())
        code,report,stdout,count=self.collect();self.assertEqual(code,0);self.assertEqual(count,1)
        self.assertEqual(report['result'],'OBSERVED');self.assertEqual(report['checkoutCommit'],'1'*40)
        self.assertEqual(report['reviewCommit'],'1'*40);self.assertEqual(report['event']['sha'],'2'*40)
        self.assertEqual(report['workflow']['sha'],'3'*40);self.assertEqual(report['nativeRefContract'],'MISMATCH')
        self.assertEqual(report['nativeExecution'],'NOT_INVOKED')
        self.assertEqual(json.loads(stdout),report)

    def test_synthetic_merge_match_and_different_real_workflow_ref(self):
        env=dict(self.env,GITHUB_WORKFLOW_SHA='2'*40)
        self.assertEqual(self.collect(env=env)[1]['nativeRefContract'],'MATCH')
        env['GITHUB_WORKFLOW_REF']='novo34/cleanops-360/'+runner.R3_WORKFLOW+'@refs/heads/main'
        code,report,_,_=self.collect(env=env);self.assertEqual(code,0)
        self.assertEqual(report['workflow']['ref'],env['GITHUB_WORKFLOW_REF'])
        self.assertEqual(report['nativeRefContract'],'MISMATCH')

    def test_job_and_runtime_reject_wrong_event_actor_or_scope(self):
        mutations=[('action','edited'),('sender.id',9),('review.user.id',9),('review.user.login','bot'),
                   ('review.state','approved'),('review.commit_id','4'*40),('pull_request.number',12),
                   ('pull_request.state','closed'),('pull_request.base.ref','staging'),
                   ('pull_request.base.repo.id',9),('pull_request.head.repo.id',9),
                   ('pull_request.head.repo.full_name','other/repo'),('pull_request.head.repo.fork',True),
                   ('pull_request.head.ref','feat/b2-users-access')]
        for name,value in mutations:
            with self.subTest(field=name):
                e=json.loads(json.dumps(self.event));target=e;parts=name.split('.')
                for part in parts[:-1]:target=target[part]
                target[parts[-1]]=value
                self.assertFalse(self.eligible(e));code,report,stdout,count=self.collect(e)
                self.assertEqual(code,1);self.assertEqual(report['result'],'FAIL');self.assertEqual(count,0)
                self.assertEqual(set(report),{'schemaVersion','scope','result','reason'})

    def test_environment_reruns_and_unrelated_repository_are_rejected(self):
        values=[('GITHUB_EVENT_NAME','push'),('GITHUB_EVENT_NAME','pull_request_target'),
                ('GITHUB_EVENT_NAME','workflow_dispatch'),('GITHUB_REPOSITORY','other/repo'),
                ('GITHUB_REPOSITORY_ID','9'),('GITHUB_REPOSITORY_OWNER','other'),
                ('GITHUB_ACTOR','bot'),('GITHUB_ACTOR_ID','9'),('GITHUB_TRIGGERING_ACTOR','bot'),
                ('GITHUB_RUN_ATTEMPT','2'),('GITHUB_REF','refs/heads/main')]
        for key,value in values:
            with self.subTest(key=key):
                env=dict(self.env,**{key:value});self.assertFalse(self.eligible(env=env))
                code,_,_,count=self.collect(env=env);self.assertEqual(code,1);self.assertEqual(count,0)
        for key,value in [('RUNNER_ENVIRONMENT','self-hosted'),('GITHUB_ACTIONS','false'),('GITHUB_HEAD_REF','main')]:
            self.assertEqual(self.collect(env=dict(self.env,**{key:value}))[0],1)

    def test_exact_review_manifest_body_is_required_not_just_job_prefix(self):
        original=self.event['review']['body']
        for body in [original.replace(' manifest ',' manifest '+'0'*64+' '),original+' ',
                     '@codex review','Execute owner-authorized SQL5-R2 0eb651f3cfce5733726ca1d122e09bd1d0162c26; native isolated validation only.',
                     'Execute owner-authorized SQL5-R3 candidate '+'1'*40+' manifest '+'0'*64+' workflow '+'2'*40+'; native isolated validation only.']:
            self.event['review']['body']=body
            code,report,_,count=self.collect();self.assertEqual(code,1);self.assertEqual(count,0)
            self.assertEqual(report['result'],'FAIL')
        self.event['review']['body']=original

    def test_missing_context_or_fabricated_references_never_fall_back(self):
        for key in ['GITHUB_WORKFLOW_SHA','GITHUB_WORKFLOW_REF','GITHUB_SHA','GITHUB_RUN_ID']:
            env=dict(self.env);env.pop(key);self.assertEqual(self.collect(env=env)[0],1)
        for key,value in [('GITHUB_WORKFLOW_SHA','main'),('GITHUB_SHA','short'),('GITHUB_RUN_ID','0'),
                          ('GITHUB_WORKFLOW_REF','other/repo/workflow.yml@refs/heads/main'),
                          ('GITHUB_WORKFLOW_REF','novo34/cleanops-360/'+runner.R3_WORKFLOW+'@refs/heads/arbitrary')]:
            self.assertEqual(self.collect(env=dict(self.env,**{key:value}))[0],1)
        self.assertEqual(self.collect(checkout='4'*40)[0],1)

    def test_changed_workflow_or_manifest_is_rejected(self):
        path=self.root/runner.R3_WORKFLOW;raw=path.read_bytes();path.write_bytes(raw+b'\n')
        self.assertEqual(self.collect()[0],1);path.write_bytes(raw)
        path=self.root/runner.R3_MANIFEST;raw=path.read_bytes();path.write_bytes(raw+b'\n')
        self.assertEqual(self.collect()[0],1);path.write_bytes(raw)

    def test_secret_values_and_payload_are_never_emitted(self):
        env=dict(self.env,OPENBAO_TOKEN='SYNTHETIC_PRIVATE_DO_NOT_EMIT',DATABASE_URL='SYNTHETIC_PRIVATE_DO_NOT_EMIT')
        code,report,stdout,_=self.collect(env=env);self.assertEqual(code,0)
        self.assertNotIn('SYNTHETIC_PRIVATE_DO_NOT_EMIT',stdout+json.dumps(report))
        self.assertNotIn('body',report);self.assertNotIn('user',report)
        self.event['review']['body']='SYNTHETIC_PRIVATE_DO_NOT_EMIT'
        code,report,stdout,_=self.collect(env=env);self.assertEqual(code,1)
        self.assertNotIn('SYNTHETIC_PRIVATE_DO_NOT_EMIT',stdout+json.dumps(report))

    def test_symlink_inputs_are_rejected_without_metadata(self):
        path=self.root/runner.R3_MANIFEST;raw=path.read_bytes();path.unlink()
        target=self.root/'outside-manifest';target.write_bytes(raw);path.symlink_to(target)
        code,report,_,count=self.collect();self.assertEqual(code,1);self.assertEqual(count,0)
        self.assertEqual(report['result'],'FAIL')

    def test_R2_native_R3_and_diagnostic_routes_are_disjoint(self):
        import re
        r2,_=event_context();r2['review']={'commit_id':'1'*40,'user':{'login':'novo34','id':17856013},
            'body':'Execute owner-authorized SQL5-R2 0eb651f3cfce5733726ca1d122e09bd1d0162c26; native isolated validation only.'}
        r2['pull_request']['head']['sha']='1'*40
        self.assertTrue(self.eligible(r2))
        self.assertFalse(ActionsCondition(self.step_condition,self.context(r2)).evaluate())
        native=json.loads(json.dumps(self.event));native['pull_request']['base']['sha']='4'*40
        native['review']['body']='Execute owner-authorized SQL5-R3 candidate '+'1'*40+' manifest '+'0'*64+' workflow '+'2'*40+' base '+'4'*40+'; native isolated validation only.'
        self.assertTrue(self.eligible(native))
        self.assertFalse(ActionsCondition(self.step_condition,self.context(native)).evaluate())
        for name in ['Verify exact approved dependencies and hosted scope without SQL','Verify exact SQL5-R2 approval before isolated PG16 execution']:
            at=self.workflow.index('      - name: '+name);block=self.workflow[at:].split('      - name:',2)[1]
            condition=next(l.strip()[4:] for l in block.splitlines() if l.strip().startswith('if:'))
            self.assertFalse(ActionsCondition(condition,self.context()).evaluate())
            self.assertTrue(ActionsCondition(condition,self.context(r2)).evaluate())
        at=self.workflow.index('      - name: R3 canonical entrypoint');block=self.workflow[at:].split('      - name:',2)[1]
        condition=next(l.strip()[4:] for l in block.splitlines() if l.strip().startswith('if:'))
        self.assertFalse(ActionsCondition(condition,self.context()).evaluate())
        self.assertTrue(ActionsCondition(condition,self.context(native)).evaluate())
        self.assertFalse(ActionsCondition(condition,self.context(r2)).evaluate())
        self.assertTrue(runner.R3_NATIVE_ENABLED)

    def test_prepared_native_route_rejects_ordinary_and_old_reviews(self):
        good=json.loads(json.dumps(self.event));good['pull_request']['base']['sha']='4'*40
        good['review']['body']='Execute owner-authorized SQL5-R3 candidate '+'1'*40+' manifest '+'0'*64+' workflow '+'2'*40+' base '+'4'*40+'; native isolated validation only.'
        self.assertTrue(self.eligible(good))
        for body in ['@codex review','LGTM','',good['review']['body'].replace(' base '+'4'*40,''),
                     good['review']['body'].replace('4'*40,'5'*40)]:
            event=json.loads(json.dumps(good));event['review']['body']=body
            with self.subTest(body=body):self.assertFalse(self.eligible(event))
        for key,value in [('GITHUB_ACTOR','other'),('GITHUB_ACTOR_ID','9'),('GITHUB_RUN_ATTEMPT','2'),
                          ('GITHUB_EVENT_NAME','push'),('GITHUB_TRIGGERING_ACTOR','other')]:
            with self.subTest(key=key):self.assertFalse(self.eligible(good,dict(self.env,**{key:value})))

    def test_artifact_routing_distinguishes_R2_diagnostic_and_native_reports(self):
        block=self.workflow[self.workflow.index('      - name: Preserve sanitized evidence'):]
        expressions={line.strip().split(': ',1)[0]:line.strip().split(': ',1)[1]
                     for line in block.splitlines() if line.strip().startswith(('name: ${{','path: ${{'))}
        native=json.loads(json.dumps(self.event));native['review']['body']='Execute owner-authorized SQL5-R3 candidate '
        r2=json.loads(json.dumps(self.event));r2['pull_request']['number']=12
        for event,name,path in [(self.event,'b2-r3-workflow-context','artifacts/b2-acceptance-r3/workflow-context.json'),
            (native,'b2-acceptance-r3-pg16-sanitized','artifacts/b2-acceptance-r3/report.json'),
            (r2,'b2-acceptance-r2-pg16-sanitized','artifacts/b2-acceptance-r2/report.json')]:
            with self.subTest(name=name):
                self.assertEqual(ActionsCondition(expressions['name'],self.context(event)).evaluate_value(),name)
                self.assertEqual(ActionsCondition(expressions['path'],self.context(event)).evaluate_value(),path)


if __name__=='__main__':unittest.main()
