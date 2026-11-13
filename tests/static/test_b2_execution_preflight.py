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
# R3 positives use its canonical immutable snapshot, even after an R4 commit.
R3_SNAPSHOT='8559870130a47833ab13f7cd677ccf38dd8450c4'
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
        self.git_binary=shutil.which('git');self.assertIsNotNone(self.git_binary)
        paths=list(runner.APPROVED)+[
            'docs/implementation/b2/directory-authorization.json',
            'docs/implementation/b1/consolidated-test-14/AUTHORIZATION.json',
            'docs/implementation/b1/consolidated-test-13/AUTHORIZATION.json',
            'docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql',
            'scripts/pg11-rbac-matrix.py']
        for scope,package in runner.PACKAGES.items():paths.extend([package['sql'],package['tests'],f'docs/implementation/b2/{scope}-authorization.json'])
        for name in paths:
            destination=self.root/name;destination.parent.mkdir(parents=True,exist_ok=True)
            # Stage exact committed bytes rather than CRLF-converted Windows files.
            destination.write_bytes(subprocess.check_output([self.git_binary,'--no-replace-objects','show',R3_SNAPSHOT+':'+name],cwd=ROOT))
        self.addCleanup(patch.stopall)
        patch.object(runner,'ROOT',self.root).start()
        patch.object(runner,'fixture_reference_bytes',side_effect=lambda package:subprocess.check_output([self.git_binary,'--no-replace-objects','show',package['fixtureReference']+':'+package['tests']],cwd=ROOT)).start()
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
            destination=self.root/name;destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes(subprocess.check_output([self.git_binary,'--no-replace-objects','show',R3_SNAPSHOT+':'+name],cwd=ROOT))
        owner['sha256'][next(iter(owner['sha256']))]='0'*64
        path.write_text(json.dumps(owner))
        with patch.object(runner,'fixture_reference_bytes',side_effect=lambda package:(self.root/package['tests']).read_bytes()), patch.object(runner.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout=b'not historical bytes')):
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
            # Preserve canonical provenance without changing runtime hash validation.
            raw=subprocess.check_output(['git','--no-replace-objects','show',R3_SNAPSHOT+':'+name],cwd=ROOT);self.candidate[name]=raw
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

    def test_R4_working_harness_cannot_reuse_historical_R3_manifest(self):
        (self.root/'scripts/b2-directory-postgres.py').write_bytes((ROOT/'scripts/b2-directory-postgres.py').read_bytes())
        self.assertEqual(self.reject_before_transport(),'EXACT_R3_BUNDLE_BYTES_REQUIRED')

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
        destination=self.root/'target';destination.write_bytes(raw)
        try:path.symlink_to(destination)
        except OSError as error:
            if getattr(error,'winerror',None)==1314:
                self.skipTest('Windows symlink privilege unavailable; native symlink guard NOT_VALIDATED')
            raise
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
            if name!='scripts/b2-directory-postgres.py':self.assertEqual(raw,subprocess.check_output(['git','--no-replace-objects','show',R3_SNAPSHOT+':'+name],cwd=ROOT))
        manifest=json.loads((ROOT/runner.R3_MANIFEST).read_bytes())
        self.assertEqual(set(manifest['files']),runner.R3_FILES)
        for name,digest in manifest['files'].items():self.assertEqual(hashlib.sha256(subprocess.check_output(['git','--no-replace-objects','show',R3_SNAPSHOT+':'+name],cwd=ROOT)).hexdigest(),digest)
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
        raw=subprocess.check_output(['git','--no-replace-objects','show',R3_SNAPSHOT+':'+runner.R3_FIXTURE],cwd=ROOT)
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
        self.assertNotIn('pull_request_target:',text)
        native=text.split('  acceptance-r2:',1)[1].split('  aud031-reservation-probe:',1)[0]
        self.assertIn("github.event_name == 'pull_request_review'",native)


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
        pattern=r"'(?:[^']|'')*'|&&|\|\||==|!=|[(),]|[A-Za-z_][A-Za-z_0-9.-]*|[0-9]+"
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
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(subprocess.check_output(['git','--no-replace-objects','show',R3_SNAPSHOT+':'+name],cwd=ROOT))
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
        target=self.root/'outside-manifest';target.write_bytes(raw)
        try:path.symlink_to(target)
        except OSError as error:
            if getattr(error,'winerror',None)==1314:self.skipTest('Windows symlink privilege unavailable: NOT_VALIDATED')
            raise
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



class Aud031ContractTests(unittest.TestCase):
    """Synthetic authorization only; native transport and SQL are never loaded."""
    git_bytes=R3ContractTests.git_bytes
    write_event=R3ContractTests.write_event

    def setUp(self):
        self.real_run=subprocess.run;self.real_git_bytes=runner.git_bytes
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.candidate={}
        for name in runner.AUD031_FILES | {runner.AUD031_MANIFEST}:
            raw=subprocess.check_output(['git','--no-replace-objects','show','HEAD:'+name],cwd=ROOT)
            self.candidate[name]=raw
            path=self.root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
        self.committed_candidate=dict(self.candidate)
        self.historical={name:subprocess.check_output(['git','--no-replace-objects','show',runner.COMPOSITION_REFERENCE+':'+name],cwd=ROOT) for name in runner.COMPOSITION_FILES | {runner.COMPOSITION_MANIFEST}}
        self.previous_sources={name:subprocess.check_output(['git','--no-replace-objects','show','735b7fc59ea261183e1cf0a801b49b6e0ca81f65:'+name],cwd=ROOT) for name in ('scripts/b2-directory-postgres.py',runner.R3_WORKFLOW)}
        self.context={**runner.AUD031_CONTEXT,'pullRequest':23} # synthetic, never production context
        self.event,env=event_context(23,self.context['branch'],review=True)
        self.event['pull_request']['base']['sha']='4'*40
        env.update(GITHUB_REF='refs/pull/23/merge',GITHUB_WORKFLOW_SHA='2'*40,GITHUB_SHA='2'*40,GITHUB_WORKFLOW_REF='novo34/cleanops-360/'+runner.R3_WORKFLOW+'@refs/pull/23/merge',GITHUB_RUN_ID='123')
        self.event_path=self.root/'event.json';env['GITHUB_EVENT_PATH']=str(self.event_path)
        self.now=1800000000
        self.event['review']['submitted_at']=runner.datetime.fromtimestamp(self.now,runner.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        self.addCleanup(patch.stopall)
        patch.object(runner,'ROOT',self.root).start()
        patch.object(runner,'AUD031_CONTEXT',self.context).start()
        patch.dict(os.environ,env,clear=True).start()
        patch.object(runner.time,'time',return_value=self.now).start()
        patch.object(runner,'git_bytes',side_effect=self.git_bytes).start()
        patch.object(runner,'fixture_reference_bytes',side_effect=lambda p:self.candidate[p['tests']]).start()
        patch.object(runner.subprocess,'run',side_effect=self.git_head).start()
        self.manifest=json.loads(self.candidate[runner.AUD031_MANIFEST])
        self.manifest.update(context=self.context,contractApproved=True,executionAuthorized=True)
        self.refresh_review()

    def git_head(self,args,**kwargs):
        if 'rev-list' in args:return subprocess.CompletedProcess(args,0,stdout=('2'*40+' '+'4'*40+' '+'1'*40+'\n').encode())
        if 'ls-remote' in args:
            self.assertEqual(args[-3:],['refs/heads/main','refs/heads/'+self.context['branch'],'refs/pull/23/merge'])
            return subprocess.CompletedProcess(args,0,stdout=('4'*40+'\trefs/heads/main\n'+'1'*40+'\trefs/heads/'+self.context['branch']+'\n'+'2'*40+'\trefs/pull/23/merge\n').encode())
        self.assertEqual(args,['git','--no-replace-objects','rev-parse','HEAD'])
        return subprocess.CompletedProcess(args,0,stdout=b'1'*40+b'\n')

    def refresh_review(self):
        raw=(json.dumps(self.manifest,indent=2)+'\n').encode()
        (self.root/runner.AUD031_MANIFEST).write_bytes(raw);self.candidate[runner.AUD031_MANIFEST]=raw
        self.event['review']['body']=f"Execute owner-authorized SQL5-AUD031 candidate {'1'*40} manifest {hashlib.sha256(raw).hexdigest()} workflow {'2'*40} base {'4'*40}; native isolated validation only."
        self.write_event()

    def reject_before_transport(self):
        with patch.object(runner,'load',side_effect=AssertionError('NO_NATIVE_TRANSPORT')) as transport,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.main('sql5-aud031'),1);transport.assert_not_called()
        report=json.loads((self.root/'artifacts/b2-acceptance-aud031/report.json').read_text())
        self.assertEqual(report['cleanup'],'SKIP');self.assertEqual(report['result'],'FAIL')
        return report['checks'][0]['detail']

    def test_exact_synthetic_review_still_requires_trusted_reservation_before_transport(self):
        selected=runner.authorize_r3('sql5-aud031')
        self.assertEqual(selected['tests'],runner.AUD031_FIXTURE)
        self.assertEqual(selected['authorization']['base'],'4'*40)
        self.assertIs(runner.AUD031_NATIVE_ENABLED,True)
        self.assertIn('AUD031_TRUSTED_RESERVATION_REQUIRED',self.reject_before_transport())

    def test_disabling_capability_still_stops_before_receipt_or_transport(self):
        with patch.object(runner,'AUD031_NATIVE_ENABLED',False):
            self.assertEqual(self.reject_before_transport(),'AUD031_NATIVE_ACTIVATION_REQUIRED')

    def test_writer_reads_candidate_objects_without_loading_candidate_files(self):
        source='9'*40
        def head(args,**kwargs):
            result=self.git_head(args,**kwargs)
            if args[-2:]==['rev-parse','HEAD']:result.stdout=source.encode()+b'\n'
            return result
        # Candidate code on disk is never needed by the data-only reader.
        (self.root/runner.AUD031_FIXTURE).write_text('raise AssertionError("CANDIDATE_EXECUTED")\n')
        with patch.object(runner.subprocess,'run',side_effect=head), patch.object(runner,'artifact_bytes',side_effect=AssertionError('NO_CANDIDATE_WORKTREE')), patch.object(runner,'load',side_effect=AssertionError('NO_IMPORT')):
            selected=runner.authorize_r3('sql5-aud031',trusted_source_sha=source)
        self.assertEqual(selected['authorization']['candidate'],'1'*40)
        self.assertEqual(selected['authorization']['runId'],'123')

    def test_writer_source_is_AUD031_only_and_requires_exact_SHA_before_git(self):
        with patch.object(runner.subprocess,'run',side_effect=AssertionError('NO_GIT')):
            for source in ('main','',True,1,'A'*40,'1'*39):
                with self.subTest(source=source), self.assertRaisesRegex(RuntimeError,'AUD031_EXACT_TRUSTED_SOURCE_REQUIRED'):
                    runner.authorize_r3('sql5-aud031',trusted_source_sha=source)
            with self.assertRaisesRegex(RuntimeError,'AUD031_EXACT_TRUSTED_SOURCE_REQUIRED'):
                runner.authorize_r3('sql5-r3',trusted_source_sha='9'*40)

    def test_writer_acquires_real_W_before_reading_candidate_objects(self):
        calls=[]
        def read(reference,name,**kwargs):
            calls.append((reference,name,kwargs))
            return self.git_bytes(reference,name,**kwargs)
        with patch.object(runner,'git_bytes',side_effect=read):
            runner.authorize_r3('sql5-aud031',trusted_source_sha='1'*40)
        self.assertEqual(calls[0],('2'*40,runner.R3_WORKFLOW,{'fetch_workflow':True}))
        self.assertEqual(calls[1],('1'*40,runner.AUD031_MANIFEST,{}))

    def test_writer_rejects_keys_and_external_bindings_before_git(self):
        with patch.object(runner.subprocess,'run',side_effect=AssertionError('NO_GIT')):
            for key in ('NATIVE_AUTH_KEY','CLEANOPS_AUD031_NATIVE_PRIVATE_KEY','PGPASSWORD','DATABASE_URL'):
                with self.subTest(key=key), patch.dict(os.environ,{key:'synthetic-private-value'}):
                    with self.assertRaises(RuntimeError) as caught:
                        runner.authorize_r3('sql5-aud031',trusted_source_sha='9'*40)
                    self.assertNotIn('synthetic-private-value',str(caught.exception))

    def test_writer_rejects_wrong_source_and_source_drift(self):
        for drift in (False,True):
            count=0
            def head(args,**kwargs):
                nonlocal count
                result=self.git_head(args,**kwargs)
                if args[-2:]==['rev-parse','HEAD']:
                    count+=1
                    result.stdout=(('9'*40 if drift and count==1 else '8'*40)+'\n').encode()
                return result
            with self.subTest(drift=drift), patch.object(runner.subprocess,'run',side_effect=head):
                with self.assertRaisesRegex(RuntimeError,'AUD031_UNCHANGED_TRUSTED_SOURCE_REQUIRED' if drift else 'EXACT_R3_CHECKOUT_REQUIRED'):
                    runner.authorize_r3('sql5-aud031',trusted_source_sha='9'*40)

    def test_writer_retains_candidate_hash_checks_and_pending_flags(self):
        original=self.candidate[runner.AUD031_FIXTURE]
        self.candidate[runner.AUD031_FIXTURE]=original+b'\n'
        with self.assertRaisesRegex(RuntimeError,'EXACT_R3_BUNDLE_BYTES_REQUIRED'):
            runner.authorize_r3('sql5-aud031',trusted_source_sha='1'*40)
        self.candidate[runner.AUD031_FIXTURE]=original
        self.manifest['executionAuthorized']=False;self.refresh_review()
        with self.assertRaisesRegex(RuntimeError,'AUD031_EXACT_OWNER_APPROVAL_REQUIRED'):
            runner.authorize_r3('sql5-aud031',trusted_source_sha='1'*40)

    def test_writer_checks_TTL_after_reading_data(self):
        def read(reference,name,**kwargs):
            result=self.git_bytes(reference,name,**kwargs)
            if name==runner.AUD031_FIXTURE:runner.time.time.return_value=self.now+901
            return result
        with patch.object(runner,'git_bytes',side_effect=read), self.assertRaisesRegex(RuntimeError,'FRESH_R3_OWNER_REVIEW_REQUIRED'):
            runner.authorize_r3('sql5-aud031',trusted_source_sha='1'*40)

    def test_writer_real_git_objects_leave_HEAD_on_P_and_never_execute_C(self):
        def git(*args):
            return self.real_run(['git','--no-replace-objects',*args],cwd=self.root,capture_output=True,check=True)
        git('init')
        def commit(tree,message):
            return git('-c','user.name=Static test','-c','user.email=static@example.invalid','commit-tree',tree,'-m',message).stdout.strip().decode()
        git('add','.')
        source_tree=git('write-tree').stdout.strip().decode()
        source=commit(source_tree,'P fixture')
        marker=self.root/'candidate-executed'
        malicious=('from pathlib import Path\nPath('+repr(str(marker))+').write_text("executed")\n').encode()
        for name in ('scripts/b2-directory-postgres.py',runner.AUD031_FIXTURE):
            self.candidate[name]=malicious;(self.root/name).write_bytes(malicious)
            self.manifest['files'][name]=hashlib.sha256(malicious).hexdigest()
        self.refresh_review()
        git('add','.')
        tree=git('write-tree').stdout.strip().decode()
        candidate=commit(tree,'C fixture')
        self.assertNotEqual(source,candidate)
        self.assertNotEqual(source_tree,tree)
        for name in ('scripts/b2-directory-postgres.py',runner.AUD031_FIXTURE,runner.AUD031_MANIFEST):
            self.assertNotEqual(git('show',source+':'+name).stdout,git('show',candidate+':'+name).stdout)
        git('update-ref','--no-deref','HEAD',source)
        for name in ('scripts/b2-directory-postgres.py',runner.AUD031_FIXTURE):(self.root/name).unlink()
        self.event['review']['commit_id']=candidate;self.event['pull_request']['head']['sha']=candidate
        self.event['review']['body']=self.event['review']['body'].replace('1'*40,candidate);self.write_event()
        def process(args,**kwargs):
            if args[-2:]==['rev-parse','HEAD'] or 'show' in args:
                return self.real_run(args,**kwargs)
            result=self.git_head(args,**kwargs)
            result.stdout=result.stdout.replace(b'1'*40,candidate.encode())
            return result
        def read(reference,name,**kwargs):
            if reference==candidate:return self.real_git_bytes(reference,name,**kwargs)
            return self.git_bytes(reference,name,**kwargs)
        with patch.object(runner.subprocess,'run',side_effect=process), patch.object(runner,'git_bytes',side_effect=read), patch.object(runner,'load',side_effect=AssertionError('NO_NATIVE_IMPORT')):
            result=runner.authorize_r3('sql5-aud031',trusted_source_sha=source)
        self.assertEqual(result['authorization']['candidate'],candidate)
        self.assertEqual(git('rev-parse','HEAD').stdout.strip().decode(),source)
        self.assertFalse(marker.exists())
        # Accidentally reading P instead of C must reject the real candidate
        # authorization, even though HEAD correctly remains on P.
        def wrong_source(reference,name,**kwargs):
            if reference==candidate:return self.real_git_bytes(source,name,**kwargs)
            return self.git_bytes(reference,name,**kwargs)
        with patch.object(runner.subprocess,'run',side_effect=process), patch.object(runner,'git_bytes',side_effect=wrong_source), self.assertRaisesRegex(RuntimeError,'NEW_R3_C_M_W_AUTHORIZATION_REQUIRED'):
            runner.authorize_r3('sql5-aud031',trusted_source_sha=source)

    def reader_fixture(self):
        authorization=runner.authorize_r3('sql5-aud031')['authorization']
        reservation={'ref':runner.aud031_reservation_ref(authorization),'candidate':authorization['candidate'],
                     'reservationTarget':runner.AUD031_RESERVATION_TARGET,'runId':authorization['runId'],'reviewId':authorization['reviewId']}
        receipt={'schemaVersion':1,'authorization':authorization,'reservation':reservation,'writerSourceSha':runner.AUD031_WRITER['sourceSha']}
        owner={'login':'novo34','id':17856013}
        path='novo34/cleanops-360/'+runner.R3_WORKFLOW+'@'+runner.AUD031_WRITER['workflowSha']
        run={'id':123,'run_attempt':1,'event':'pull_request_review','path':runner.R3_WORKFLOW,
             'head_branch':self.context['branch'],'status':'in_progress','conclusion':None,
             'head_sha':'1'*40,'repository':{'id':1412999204,'full_name':'novo34/cleanops-360'},
             'actor':owner,'triggering_actor':dict(owner),
             'referenced_workflows':[{'path':path,'sha':runner.AUD031_WRITER['workflowSha']}]}
        timestamp=self.event['review']['submitted_at']
        base={'run_id':123,'run_attempt':1,'head_sha':'1'*40,'started_at':timestamp}
        writer=dict(base,id=11,name=runner.AUD031_WRITER['writerJob'],status='completed',conclusion='success',completed_at=timestamp,
                    steps=[{'name':runner.AUD031_WRITER['stepName'],'status':'completed','conclusion':'success'}])
        reader=dict(base,id=12,name=runner.AUD031_WRITER['readerJob'],status='in_progress',conclusion=None)
        return authorization,receipt,run,{'total_count':2,'jobs':[writer,reader]}

    def reader_call(self,authorization,receipt,run,jobs,*,main=False):
        raw=receipt if isinstance(receipt,str) else json.dumps(receipt)
        prefix='/repos/novo34/cleanops-360/actions/runs/123'
        def get(path):
            if path==prefix:return run
            self.assertEqual(path,prefix+'/attempts/1/jobs?per_page=100')
            return jobs
        with patch.dict(os.environ,{'AUD031_NATIVE_RECEIPT':raw,'GITHUB_JOB':runner.AUD031_WRITER['readerJob']}),patch.object(runner,'aud031_readonly_run_json',side_effect=get),patch.object(runner,'reserve_aud031',side_effect=AssertionError('READER_CANNOT_WRITE')):
            if main:
                with patch.object(runner,'load',side_effect=RuntimeError('TEST_STOP_BEFORE_TRANSPORT')) as load,contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(runner.main('sql5-aud031'),1)
                    self.assertEqual(load.call_count,1)
                report=json.loads((self.root/'artifacts/b2-acceptance-aud031/report.json').read_text())
                self.assertEqual(report['checks'][0]['detail'],'TEST_STOP_BEFORE_TRANSPORT')
                return report['reservation']
            with patch.object(runner,'load',side_effect=AssertionError('NO_TRANSPORT')):
                return runner.verify_aud031_receipt(authorization)

    def test_reader_verifies_closed_wiring_run_attempt_and_successful_writer(self):
        auth,receipt,run,jobs=self.reader_fixture()
        self.assertEqual(self.reader_call(auth,receipt,run,jobs),receipt['reservation'])
        # API head_sha may denote C or its exact W merge; neither is a new authorization.
        run['head_sha']='2'*40
        for job in jobs['jobs']:job['head_sha']='2'*40
        self.assertEqual(self.reader_call(auth,receipt,run,jobs),receipt['reservation'])

    def test_reader_accepts_only_exact_dormant_dependencies_of_pinned_writer(self):
        auth,receipt,run,jobs=self.reader_fixture()
        path='novo34/cleanops-360/'+runner.R3_WORKFLOW+'@'
        for revision in ('ecbcfe360858404ccf84f1100a27d40f46599fd3','9a4c8b90a159f2853f040dc5597042c17408da00'):
            run['referenced_workflows'].append({'path':path+revision,'sha':revision})
        self.assertEqual(self.reader_call(auth,receipt,run,jobs),receipt['reservation'])
        for field,value in (('path','foreign'),('sha','8'*40)):
            changed=json.loads(json.dumps(run));changed['referenced_workflows'][1][field]=value
            with self.subTest(field=field),self.assertRaisesRegex(RuntimeError,'AUD031_IMMUTABLE_WRITER_REQUIRED'):
                self.reader_call(auth,receipt,changed,jobs)
        # A dormant definition alone cannot substitute for the selected T.
        run['referenced_workflows']=run['referenced_workflows'][1:]
        with self.assertRaisesRegex(RuntimeError,'AUD031_IMMUTABLE_WRITER_REQUIRED'):
            self.reader_call(auth,receipt,run,jobs)

    def test_reader_main_reaches_only_mocked_transport_after_proof(self):
        auth,receipt,run,jobs=self.reader_fixture()
        self.assertEqual(self.reader_call(auth,receipt,run,jobs,main=True),receipt['reservation'])

    def test_reader_main_rejects_App_key_before_any_git_or_transport(self):
        with patch.dict(os.environ,{'NATIVE_AUTH_KEY':'synthetic-private-key'}),patch.object(runner.subprocess,'run',side_effect=AssertionError('NO_GIT')) as git,patch.object(runner,'load',side_effect=AssertionError('NO_TRANSPORT')) as load,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.main('sql5-aud031'),1);git.assert_not_called();load.assert_not_called()
        report=json.loads((self.root/'artifacts/b2-acceptance-aud031/report.json').read_text())
        self.assertEqual(report['checks'][0]['detail'],'AUD031_WITHOUT_APP_KEY_REQUIRED')
        self.assertNotIn('synthetic-private-key',json.dumps(report))

    def test_reader_failed_producer_proof_never_loads_native_transport(self):
        auth,receipt,run,jobs=self.reader_fixture()
        jobs['jobs'][0]['conclusion']='cancelled'
        with patch.dict(os.environ,{'AUD031_NATIVE_RECEIPT':json.dumps(receipt),'GITHUB_JOB':runner.AUD031_WRITER['readerJob']}),patch.object(runner,'AUD031_NATIVE_ENABLED',True),patch.object(runner,'aud031_readonly_run_json',side_effect=[run,jobs]),patch.object(runner,'load',side_effect=AssertionError('NO_TRANSPORT')) as load,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.main('sql5-aud031'),1);load.assert_not_called()
        report=json.loads((self.root/'artifacts/b2-acceptance-aud031/report.json').read_text())
        self.assertEqual(report['checks'][0]['detail'],'AUD031_CONFIRMED_WRITER_REQUIRED')

    def test_reader_rejects_malformed_oversized_duplicate_and_mismatched_data(self):
        auth,original,run,jobs=self.reader_fixture()
        exact='AUD031_EXACT_RECEIPT_REQUIRED'
        cases=[('', 'AUD031_TRUSTED_RESERVATION_REQUIRED'),('{',exact),('x'*16385,exact),
               ('{"schemaVersion":1,"schemaVersion":1}',exact)]
        mutations=[(lambda r:r.update(schemaVersion=True),exact),(lambda r:r.update(extra=True),exact),
                   (lambda r:r.update(writerSourceSha='8'*40),exact),
                   (lambda r:r['authorization'].update(attempt=True),'AUD031_RESERVATION_IDENTITY_REQUIRED'),
                   (lambda r:r['authorization'].update(runId='456'),exact),
                   (lambda r:r['authorization'].update(manifestSha256='0'*64),exact),
                   (lambda r:r['reservation'].update(ref='refs/tags/other'),exact),
                   (lambda r:r['reservation'].update(reviewId=True),exact),
                   (lambda r:r['reservation'].update(reservationTarget='1'*40),exact),
                   (lambda r:r['reservation'].update(extra=True),exact)]
        for mutation,error in mutations:
            receipt=json.loads(json.dumps(original));mutation(receipt);cases.append((receipt,error))
        for index,(receipt,error) in enumerate(cases):
            with self.subTest(index=index),patch.object(runner,'aud031_readonly_run_json',side_effect=AssertionError('NO_API')):
                raw=receipt if isinstance(receipt,str) else json.dumps(receipt)
                with patch.dict(os.environ,{'AUD031_NATIVE_RECEIPT':raw,'GITHUB_JOB':runner.AUD031_WRITER['readerJob']}),self.assertRaisesRegex(RuntimeError,'^'+error+'$'):
                    runner.verify_aud031_receipt(auth)

    def test_reader_rejects_wrong_job_private_key_or_changed_wiring_before_lookup(self):
        auth,receipt,run,jobs=self.reader_fixture()
        env={'AUD031_NATIVE_RECEIPT':json.dumps(receipt),'GITHUB_JOB':runner.AUD031_WRITER['readerJob']}
        for change in ({'GITHUB_JOB':'acceptance-r2'},{'NATIVE_AUTH_KEY':'synthetic-private-key'}):
            with patch.dict(os.environ,dict(env,**change)),patch.object(runner,'aud031_readonly_run_json',side_effect=AssertionError('NO_API')),self.assertRaises(RuntimeError):
                runner.verify_aud031_receipt(auth)
        original=self.candidate[runner.R3_WORKFLOW];self.candidate[runner.R3_WORKFLOW]=original+b'\n'
        with patch.dict(os.environ,env),patch.object(runner,'aud031_readonly_run_json',side_effect=AssertionError('NO_API')),self.assertRaisesRegex(RuntimeError,'AUD031_TRUSTED_READER_WIRING_REQUIRED'):
            runner.verify_aud031_receipt(auth)

    def test_reader_rejects_run_or_immutable_workflow_mismatch(self):
        auth,receipt,original,jobs=self.reader_fixture()
        changes=[lambda r:r.update(id=456),lambda r:r.update(run_attempt=2),lambda r:r.update(run_attempt=True),
                 lambda r:r.update(event='workflow_dispatch'),lambda r:r.update(head_sha='8'*40),
                 lambda r:r.update(status='completed',conclusion='cancelled'),lambda r:r['repository'].update(id=1),
                 lambda r:r['actor'].update(id=1),lambda r:r['triggering_actor'].update(login='other'),
                 lambda r:r.update(referenced_workflows=[]),lambda r:r['referenced_workflows'][0].update(sha='8'*40),
                 lambda r:r['referenced_workflows'].append(dict(r['referenced_workflows'][0])),
                 lambda r:r['referenced_workflows'].append({'path':'other','sha':'8'*40})]
        for index,change in enumerate(changes):
            run=json.loads(json.dumps(original));change(run)
            with self.subTest(index=index),self.assertRaises(RuntimeError):self.reader_call(auth,receipt,run,jobs)

    def test_reader_rejects_foreign_workflow_path_despite_matching_run_and_jobs(self):
        auth,receipt,original,jobs=self.reader_fixture()
        for path in (None,'.github/workflows/b1-staging-synthetic.yml',runner.R3_WORKFLOW+'@other','./'+runner.R3_WORKFLOW):
            run=dict(original,path=path)
            with self.subTest(path=path),self.assertRaisesRegex(RuntimeError,'AUD031_TRUSTED_RUN_REQUIRED'):
                self.reader_call(auth,receipt,run,jobs)
        run=dict(original,head_branch='other-branch')
        with self.assertRaisesRegex(RuntimeError,'AUD031_TRUSTED_RUN_REQUIRED'):
            self.reader_call(auth,receipt,run,jobs)

    def test_reader_rejects_incomplete_ambiguous_or_failed_jobs_and_steps(self):
        auth,receipt,run,original=self.reader_fixture()
        changes=[lambda j:j.update(total_count=101),lambda j:j.update(total_count=1),
                 lambda j:j['jobs'][0].update(status='in_progress'),
                 lambda j:j['jobs'][0].update(conclusion='cancelled'),lambda j:j['jobs'][0].update(run_id=456),
                 lambda j:j['jobs'][0].update(run_attempt=2),lambda j:j['jobs'][0].update(head_sha='8'*40),
                 lambda j:j['jobs'][0].update(steps=[]),lambda j:j['jobs'][0]['steps'][0].update(conclusion='skipped'),
                 lambda j:j['jobs'][1].update(status='completed'),lambda j:j['jobs'][1].update(id=11),
                 lambda j:j['jobs'][0].update(started_at='2000-01-01T00:00:00Z'),
                 lambda j:j['jobs'][0].update(completed_at='2999-01-01T00:00:00Z'),
                 lambda j:j['jobs'][0].update(completed_at='invalid')]
        for index,change in enumerate(changes):
            jobs=json.loads(json.dumps(original));change(jobs)
            with self.subTest(index=index),self.assertRaises(RuntimeError):self.reader_call(auth,receipt,run,jobs)
        jobs=json.loads(json.dumps(original))
        jobs['jobs'].append(dict(jobs['jobs'][0],id=13))
        jobs['total_count']=3
        with self.assertRaisesRegex(RuntimeError,'^AUD031_CONFIRMED_WRITER_REQUIRED$'):
            self.reader_call(auth,receipt,run,jobs)

    def test_reader_lookup_must_not_extend_TTL_or_ignore_reference_changes(self):
        auth,receipt,run,jobs=self.reader_fixture()
        env={'AUD031_NATIVE_RECEIPT':json.dumps(receipt),'GITHUB_JOB':runner.AUD031_WRITER['readerJob']}
        prefix='/repos/novo34/cleanops-360/actions/runs/123'
        def get(path):
            if path==prefix:return run
            runner.time.time.return_value=self.now+901
            return jobs
        with patch.dict(os.environ,env),patch.object(runner,'aud031_readonly_run_json',side_effect=get),self.assertRaisesRegex(RuntimeError,'FRESH_R3_OWNER_REVIEW_REQUIRED'):
            runner.verify_aud031_receipt(auth)
        runner.time.time.return_value=self.now
        def moved(path):
            if path==prefix:return run
            self.event['pull_request']['base']['sha']='8'*40;self.write_event()
            return jobs
        with patch.dict(os.environ,env),patch.object(runner,'aud031_readonly_run_json',side_effect=moved),self.assertRaises(RuntimeError):
            runner.verify_aud031_receipt(auth)

    def test_unconfigured_production_context_rejects_before_transport(self):
        with patch.object(runner,'AUD031_CONTEXT',{**self.context,'pullRequest':None}):
            self.assertIn('AUD031_REVIEW_CONTEXT_NOT_CONFIGURED',self.reject_before_transport())

    def test_pending_flags_and_non_boolean_values_never_authorize(self):
        for field in ('contractApproved','executionAuthorized'):
            for value in (False,None,1,'true'):
                with self.subTest(field=field,value=value):
                    self.manifest[field]=value;self.refresh_review()
                    self.assertIn('AUD031_EXACT_OWNER_APPROVAL_REQUIRED',self.reject_before_transport())
            self.manifest[field]=True

    def test_R3_reviews_and_reused_C_M_W_B_are_not_R4_authority(self):
        body=self.event['review']['body']
        for changed in (body.replace('SQL5-AUD031','SQL5-R3'),body.replace('1'*40,'3'*40),body.replace('2'*40,'3'*40),body.replace('4'*40,'3'*40),body.replace('manifest ','manifest f')):
            with self.subTest(body=changed):
                self.event['review']['body']=changed;self.write_event()
                self.assertIn('NEW_R3_C_M_W_AUTHORIZATION_REQUIRED',self.reject_before_transport())

    def test_old_PR_branch_or_actor_and_expired_review_reject(self):
        good=json.dumps(self.event)
        mutations=[(lambda e:e['pull_request'].update(number=22),'HOSTED_CI_SCOPE_REQUIRED'),
                   (lambda e:e['pull_request']['head'].update(ref=runner.R3_CONTEXT['branch']),'HOSTED_CI_SCOPE_REQUIRED'),
                   (lambda e:e['review']['user'].update(id=123),'EXACT_OWNER_REVIEW_REQUIRED'),
                   (lambda e:e['pull_request']['head']['repo'].update(fork=True),'HOSTED_CI_SCOPE_REQUIRED'),
                   (lambda e:e['review'].update(submitted_at='2020-01-01T00:00:00Z'),'FRESH_R3_OWNER_REVIEW_REQUIRED')]
        for index,(change,error) in enumerate(mutations):
            self.event=json.loads(good);change(self.event);self.write_event()
            with self.subTest(index=index):self.assertEqual(self.reject_before_transport(),error)

    def test_modified_candidate_and_rehashed_historical_dependency_reject(self):
        for name in (runner.AUD031_SQL,runner.R3_SQL):
            with self.subTest(name=name):
                original=self.candidate[name];changed=original+b'\n-- synthetic mutation\n'
                (self.root/name).write_bytes(changed)
                self.assertIn('EXACT_R3_BUNDLE_BYTES_REQUIRED',self.reject_before_transport())
                self.candidate[name]=changed;self.manifest['files'][name]=hashlib.sha256(changed).hexdigest();self.refresh_review()
                if name==runner.R3_SQL:self.assertIn('UNEXPECTED_FIXED_DEPENDENCY_CHANGE',self.reject_before_transport())
                else:self.assertIn('AUD031_TRUSTED_RESERVATION_REQUIRED',self.reject_before_transport())
                (self.root/name).write_bytes(original);self.candidate[name]=original;self.manifest['files'][name]=hashlib.sha256(original).hexdigest();self.refresh_review()

    def test_real_manifest_capability_hashes_do_not_replace_exact_owner_review(self):
        manifest=json.loads(self.committed_candidate[runner.AUD031_MANIFEST])
        self.assertIs(manifest['contractApproved'],True);self.assertIs(manifest['executionAuthorized'],True)
        self.assertEqual(manifest['context']['pullRequest'],23)
        self.assertEqual(manifest['context'],runner.AUD031_CONTEXT)
        self.assertEqual(set(manifest['files']),runner.AUD031_FILES)
        for name,digest in manifest['files'].items():
            raw=self.committed_candidate[name]
            self.assertEqual(hashlib.sha256(raw).hexdigest(),digest,name)

    def test_expiry_cleanup_has_index_and_one_captured_cutoff_per_function(self):
        sql=self.candidate[runner.AUD031_SQL].decode()
        self.assertIn('CREATE INDEX invitation_acceptance_attempt_expiry ON identity_private.invitation_acceptance_attempts(expires_at);',sql)
        self.assertEqual(sql.count('WHERE expires_at<=cleanup_cutoff;'),2)
        self.assertNotIn('WHERE expires_at<=clock_timestamp()',sql)
        for name in ('identity_private.invitation_attempt_denied','auth_api.invitation_link_material'):
            body=sql.split('CREATE FUNCTION '+name+'(',1)[1].split('END $fn$;',1)[0]
            self.assertIn('cleanup_cutoff timestamptz;',body)
            self.assertEqual(body.count('cleanup_cutoff:=clock_timestamp();'),1)

    def test_candidate_fixture_and_SQL_boundary_are_static_only(self):
        import ast
        sql=(ROOT/runner.AUD031_SQL).read_text(encoding='utf-8')
        fixture=(ROOT/runner.AUD031_FIXTURE).read_bytes();ast.parse(fixture)
        self.assertIn('key_hash bytea,corr uuid',sql)
        self.assertIn('IDEMPOTENCY_MISMATCH',sql)
        self.assertIn('FOR UPDATE',sql)
        self.assertIn('accept_key_digest=CASE WHEN id=c.id THEN key_hash',sql)
        self.assertIn('AUD031_FRESH_INSTALL_REQUIRED',sql)
        for label in ('AUD031-rollback-key-and-audit','AUD031-legacy-null-denies-both','AUD031-expired-consumed-denies-both','AUD031-other-key-conflict','AUD031-effective-execute-roles','AUD031-no-extra-grantees','AUD031-revoked-capability-denies-consumption','AUD031-first-consumption-no-B1-session'):
            self.assertIn(label,fixture.decode())
        self.assertIn('different-key-race',fixture.decode())
        self.assertIn('tenant-B-same-key',fixture.decode())

    def test_push_PR_open_and_R3_review_cannot_start_R4_job(self):
        source=(ROOT/runner.R3_WORKFLOW).read_text(encoding='utf-8')
        self.assertNotIn('pull_request_target:',source)
        self.assertNotIn('\n  push:',source)
        self.assertNotIn('\n  pull_request:',source)
        route=source.split('(false && github.event_name',1)[1].split('    # R3 capability',1)[0]
        self.assertIn('github.event.pull_request.number == 23',route)
        self.assertIn('SQL5-AUD031',route)
        step=source.split('- name: AUD031 canonical entrypoint',1)[1].split('- name:',1)[0]
        self.assertIn('if: inputs.native_reservation != true && inputs.reservation_probe != true && github.event.pull_request.number == 23',step)
        # Even an exact synthetic owner review must stop before transport import.
        self.assertIn('AUD031_TRUSTED_RESERVATION_REQUIRED',self.reject_before_transport())

    def test_R3_harness_controls_and_workflow_routes_are_unchanged(self):
        import ast
        old=ast.parse(self.previous_sources['scripts/b2-directory-postgres.py'])
        current=ast.parse((ROOT/'scripts/b2-directory-postgres.py').read_bytes())
        def r3_assignments(tree):
            return [ast.dump(n) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id.startswith('R3_') for t in n.targets)]
        self.assertEqual(r3_assignments(current),r3_assignments(old))
        historical=self.previous_sources[runner.R3_WORKFLOW].decode()
        current=(ROOT/runner.R3_WORKFLOW).read_text()
        self.assertEqual(current.split('  acceptance-r2:',1)[1].split('(false && github.event_name',1)[0],historical.split('  acceptance-r2:',1)[1].split('(false && github.event_name',1)[0])
        self.assertEqual(current.split('    # R3 capability',1)[1].split('      - name: Preserve sanitized evidence',1)[0],historical.split('    # R3 capability',1)[1].split('      - name: AUD031 canonical entrypoint',1)[0])

    def test_workflow_R4_entrypoint_is_scoped_and_old_route_remains_disabled(self):
        source=(ROOT/runner.R3_WORKFLOW).read_text(encoding='utf-8')
        self.assertIn('(false && github.event_name',source)
        step=source.split('- name: AUD031 canonical entrypoint',1)[1].split('- name:',1)[0]
        self.assertNotIn('if: false &&',step)
        self.assertEqual(source.count('--package sql5-aud031'),1)
        self.assertEqual(source.count('jobs:'),1)
        import re
        condition=' '.join(re.search(r'    if: >-\n((?:      .*\n)+)',source).group(1).split())
        context=R3DiagnosticTests.context(self,self.event,dict(os.environ,GITHUB_REPOSITORY_OWNER='novo34'))
        self.assertFalse(ActionsCondition(condition,context).evaluate())
        self.assertTrue(ActionsCondition(next(line.strip()[4:] for line in step.splitlines() if line.strip().startswith('if:')),context).evaluate())

class Aud031ExclusiveReservationTests(unittest.TestCase):
    """Real local Git exclusivity; NOT GitHub API/protection validation."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.repo=Path(self.temp.name)/'ledger.git'
        subprocess.run(['git','init','--bare',str(self.repo)],check=True,capture_output=True)
        def git(*args,data=None):
            return subprocess.run(['git','--git-dir='+str(self.repo),*args],input=data,capture_output=True)
        self.git=git
        tree=git('mktree',data=b'').stdout.strip().decode()
        env=dict(os.environ,GIT_AUTHOR_NAME='Test',GIT_AUTHOR_EMAIL='test@fixture.invalid',GIT_COMMITTER_NAME='Test',GIT_COMMITTER_EMAIL='test@fixture.invalid')
        commit=subprocess.check_output(['git','--git-dir='+str(self.repo),'commit-tree',tree,'-m','synthetic'],env=env).strip().decode()
        self.auth=dict(candidate=commit,manifestSha256='a'*64,workflow='b'*40,base='c'*40,reviewId=23,reviewBodySha256='d'*64,runId='123',attempt=1)
        # Copy only the existing approved commit object; never fetch a remote or run its code.
        anchor=subprocess.check_output(['git','cat-file','commit',runner.AUD031_RESERVATION_TARGET],cwd=ROOT)
        self.assertEqual(self.git('hash-object','-t','commit','-w','--stdin',data=anchor).stdout.strip().decode(),runner.AUD031_RESERVATION_TARGET)

    def create(self,ref,sha):
        result=self.git('update-ref',ref,sha,'0'*40)
        return (201,{'ref':ref,'object':{'sha':sha,'type':'commit'}}) if result.returncode==0 else (422,{'denialClass':'REFERENCE_ALREADY_EXISTS' if b'reference already exists' in result.stderr else 'OTHER_HTTP_ERROR'})

    def test_real_git_race_has_one_winner_and_later_runs_stay_denied(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        barrier=Barrier(2)
        def attempt(run):
            barrier.wait(timeout=10)
            try:return runner.reserve_aud031(dict(self.auth,runId=str(run)),self.create)
            except RuntimeError:return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(attempt,(123,124)))
        self.assertEqual(sum(r is not None for r in results),1)
        winner=next(r for r in results if r)
        # No finalizer removes the reservation after success/failure/cancellation.
        self.assertEqual(self.git('rev-parse',winner['ref']).stdout.strip().decode(),runner.AUD031_RESERVATION_TARGET)
        self.assertEqual(winner['candidate'],self.auth['candidate'])
        self.assertEqual(winner['reservationTarget'],runner.AUD031_RESERVATION_TARGET)
        for run in ('125','126'):
            with self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
                runner.reserve_aud031(dict(self.auth,runId=run),self.create)

    def test_fixed_target_preserves_original_digest_and_candidate_identity(self):
        import copy
        original=copy.deepcopy(self.auth)
        receipts=[]
        for field,replacement in [(None,None),('candidate','1'*40),('manifestSha256','2'*64),('workflow','3'*40),('base','4'*40)]:
            auth=dict(self.auth) if field is None else dict(self.auth,**{field:replacement})
            receipt=runner.reserve_aud031(auth,self.create)
            identity={'repository':'novo34/cleanops-360','pullRequest':23,'scope':runner.AUD031_SCOPE,'ownerId':17856013,
                      **{k:auth[k] for k in ('candidate','manifestSha256','workflow','base','reviewId','reviewBodySha256')}}
            expected='refs/tags/cleanops-native-auth/aud031/'+hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':')).encode()).hexdigest()
            self.assertEqual(receipt['ref'],expected)
            self.assertEqual(receipt['candidate'],auth['candidate'])
            self.assertEqual(receipt['reservationTarget'],runner.AUD031_RESERVATION_TARGET)
            self.assertEqual(self.git('rev-parse',expected).stdout.strip().decode(),runner.AUD031_RESERVATION_TARGET)
            receipts.append(receipt)
            with self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
                runner.reserve_aud031(dict(auth,runId='999'),self.create)
        self.assertEqual(len({r['ref'] for r in receipts}),5)
        self.assertEqual(self.auth,original)

    def test_only_exact_fixed_target_and_confirmed_201_can_win(self):
        target='4c625d2fb1f654fdfcabb751a4f63e5234fd9154'
        self.assertEqual(runner.AUD031_RESERVATION_TARGET,target)
        calls=[]
        def response(ref,sha):
            calls.append((ref,sha))
            return {'ref':ref,'object':{'type':'commit','sha':target}}
        def create(ref,sha):return 201,response(ref,sha)
        receipt=runner.reserve_aud031(self.auth,create)
        self.assertNotEqual(self.auth['candidate'],target)
        self.assertEqual(calls[0][1],target)
        for status in (True,200,403,409,422,500):
            with self.subTest(status=status),self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
                runner.reserve_aud031(self.auth,lambda ref,sha:(status,response(ref,sha)))
        for wrong in (self.auth['candidate'],'f'*40,None):
            with self.subTest(wrong=wrong),self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
                runner.reserve_aud031(self.auth,lambda ref,sha:(201,{'ref':ref,'object':{'type':'commit','sha':wrong}}))
        for body in ({'ref':receipt['ref']+'0','object':{'type':'commit','sha':target}},
                     {'ref':receipt['ref'],'object':{'type':'tag','sha':target}}):
            with self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
                runner.reserve_aud031(self.auth,lambda ref,sha:(201,body))
        with self.assertRaisesRegex(RuntimeError,'IDENTITY_REQUIRED'):
            runner.reserve_aud031(dict(self.auth,reservationTarget=self.auth['candidate']),create)

    def test_two_confirmed_creations_still_fail_exclusivity(self):
        exercise,_=self.probe_function()
        def api(method,path,payload=None):
            self.assertEqual(method,'POST')
            return 201,{'ref':payload['ref'],'object':{'type':'commit','sha':payload['sha']}}
        output=io.StringIO()
        with contextlib.redirect_stdout(output),self.assertRaisesRegex(RuntimeError,'EXCLUSIVITY_FAILED'):
            exercise(api,runner.reserve_aud031,self.auth,runner.AUD031_RESERVATION_TARGET)
        self.assertEqual(output.getvalue().count('confirmed=True; http=201; denial=NONE'),2)

    def test_preservation_rejects_candidate_or_other_commit_instead_of_fixed_target(self):
        exercise,_=self.probe_function()
        for wrong in (self.auth['candidate'],'f'*40):
            auth=dict(self.auth,reviewId=400 if wrong==self.auth['candidate'] else 401)
            def api(method,path,payload=None):
                if method=='POST':return self.create(payload['ref'],payload['sha'])
                if method in ('PATCH','DELETE'):return 422,{'rulesetDenied':True}
                return 200,{'object':{'sha':wrong}}
            with self.assertRaisesRegex(RuntimeError,'RESERVATION_NOT_PRESERVED'):
                exercise(api,runner.reserve_aud031,auth,runner.AUD031_RESERVATION_TARGET)

    def test_writer_cli_has_no_local_or_wrong_package_execution_path(self):
        env={k:v for k,v in os.environ.items() if not k.startswith(('GITHUB_','CLEANOPS_','PG','DATABASE_','NATIVE_AUTH_'))}
        for package in ('sql5-aud031','sql5-r3'):
            result=subprocess.run([shutil.which('python') or 'python','-I','-B',str(ROOT/'scripts/b2-directory-postgres.py'),
                                   '--package',package,'--aud031-writer-source','9'*40],
                                  cwd=ROOT,env=env,capture_output=True,timeout=15)
            self.assertNotEqual(result.returncode,0)
            self.assertNotIn(b'AUD031_WRITER_PREFLIGHT_ONLY',result.stdout)
            if package=='sql5-aud031':
                self.assertEqual(result.stdout.splitlines(),[b'FAIL AUD031_WRITER_PREFLIGHT; no reservation or SQL'])

    def test_probe_pins_published_bytes_and_default_candidate_behavior_is_preserved(self):
        import ast,re
        job=(ROOT/runner.R3_WORKFLOW).read_text().split('  aud031-reservation-probe:',1)[1].split('  aud031-probe-caller:',1)[0]
        pinned=re.search(r'^          ref: ([0-9a-f]{40})$',job,re.M).group(1)
        expected=re.search(r"hashlib.sha256\(source.read_bytes\(\)\).hexdigest\(\)!='([0-9a-f]{64})'",job).group(1)
        published=subprocess.check_output(['git','show',pinned+':scripts/b2-directory-postgres.py'],cwd=ROOT)
        self.assertEqual(hashlib.sha256(published).hexdigest(),expected)
        candidate=ast.parse((ROOT/'scripts/b2-directory-postgres.py').read_bytes())
        published_tree=ast.parse(published)
        guard=ast.dump(ast.parse("if scope=='sql5-aud031':\n report['reservation'] = verify_aud031_receipt(selected['authorization'])").body[0])
        identity=next(n for n in candidate.body if isinstance(n,ast.FunctionDef) and n.name=='aud031_reservation_ref')
        secret_guard=ast.dump(ast.parse("if scope=='sql5-aud031' and os.environ.get('NATIVE_AUTH_KEY'):\n raise RuntimeError('AUD031_WITHOUT_APP_KEY_REQUIRED')").body[0])
        class DefaultReaderProjection(ast.NodeTransformer):
            count=0
            writer_branches=0
            reader_selectors=0
            receipt_functions=0
            writer_configs=0
            identity_inlined=0
            native_key_guards=0
            native_capabilities=0
            def visit_Assign(self,node):
                if any(isinstance(t,ast.Name) and t.id=='AUD031_NATIVE_ENABLED' for t in node.targets):
                    assert isinstance(node.value,ast.Constant) and node.value.value is True
                    node.value=ast.Constant(value=False);self.native_capabilities+=1
                if any(isinstance(t,ast.Name) and t.id=='AUD031_WRITER' for t in node.targets):
                    assert isinstance(node.value,ast.Dict)
                    self.writer_configs+=1;return None
                return self.generic_visit(node)
            def visit_FunctionDef(self,node):
                if node.name in ('aud031_reservation_ref','aud031_readonly_run_json','verify_aud031_receipt'):
                    self.receipt_functions+=1;return None
                if node.name=='reserve_aud031':
                    assert ast.dump(node.body[1])==ast.dump(ast.parse('ref = aud031_reservation_ref(authorization)').body[0])
                    assert ast.dump(identity.body[-1])==ast.dump(ast.parse('return ref').body[0])
                    node.body[1:2]=identity.body[:-1]
                    self.identity_inlined+=1
                if node.name!='authorize_r3':return self.generic_visit(node)
                self.assert_signature(node)
                # Evaluate only the new optional writer mode as None. All
                # statements on the default/R3 path must remain bytecode AST
                # equivalent to the published implementation after projection.
                node.args.kwonlyargs=[];node.args.kw_defaults=[]
                kept=[];candidate_assignment=None
                for statement in node.body:
                    if isinstance(statement,ast.If) and ast.dump(statement.test)==ast.dump(ast.parse('trusted_source_sha is not None',mode='eval').body):
                        self.writer_branches+=1;continue
                    if isinstance(statement,ast.Assign) and len(statement.targets)==1 and isinstance(statement.targets[0],ast.Name):
                        name=statement.targets[0].id
                        if name=='read_bundle':
                            expected=ast.parse('read_bundle = artifact_bytes if trusted_source_sha is None else lambda name: git_bytes(candidate, name)').body[0]
                            assert ast.dump(statement)==ast.dump(expected)
                            self.reader_selectors+=1
                            continue
                        if name=='candidate':candidate_assignment=statement;continue
                        if name=='workflow':
                            assert candidate_assignment is not None
                            kept.append(candidate_assignment)
                    kept.append(statement)
                node.body=kept
                return self.generic_visit(node)
            @staticmethod
            def assert_signature(node):
                assert [x.arg for x in node.args.kwonlyargs]==['trusted_source_sha']
                assert len(node.args.kw_defaults)==1 and ast.literal_eval(node.args.kw_defaults[0]) is None
            def visit_Call(self,node):
                if isinstance(node.func,ast.Name) and node.func.id=='read_bundle':node.func.id='artifact_bytes'
                return self.generic_visit(node)
            def visit_IfExp(self,node):
                if ast.dump(node.test)==ast.dump(ast.parse('trusted_source_sha is None',mode='eval').body):
                    assert isinstance(node.body,ast.Name) and node.body.id=='candidate'
                    assert isinstance(node.orelse,ast.Name) and node.orelse.id=='trusted_source_sha'
                    return node.body
                return self.generic_visit(node)
            def visit_If(self,node):
                if ast.dump(node)==secret_guard:
                    self.native_key_guards+=1;return None
                if ast.dump(node)==guard:
                    self.count+=1;return None
                if ast.dump(node.test)==ast.dump(ast.parse("__name__ == '__main__'",mode='eval').body):
                    original=published_tree.body[-1]
                    assert len(node.body)==6
                    assert all(ast.dump(x)==ast.dump(y) for x,y in zip(node.body[:2],original.body[:2]))
                    assert ast.dump(node.body[-1])==ast.dump(ast.parse('sys.exit(main(args.package))').body[0])
                    # The CLI branch is separately exercised in a subprocess;
                    # its default still invokes the exact existing main path.
                    node.body=original.body
                    return node
                return self.generic_visit(node)
        removed=DefaultReaderProjection();normalized=removed.visit(candidate)
        self.assertEqual(removed.count,1)
        self.assertEqual(removed.writer_branches,3)
        self.assertEqual(removed.reader_selectors,1)
        self.assertEqual(removed.receipt_functions,3)
        self.assertEqual(removed.writer_configs,1)
        self.assertEqual(removed.identity_inlined,1)
        self.assertEqual(removed.native_key_guards,1)
        self.assertEqual(removed.native_capabilities,1)
        # Installed probe remains immutable. Full AST equality covers its
        # reservation primitive, main, R3 checks and every other default path.
        self.assertEqual(ast.dump(normalized),ast.dump(published_tree))
        self.assertIn(runner.AUD031_RESERVATION_TARGET,published.decode())

    def test_error_ambiguity_timeout_and_retry_fail_closed(self):
        for status,body in [(200,{}),(201,{}),(409,{}),(422,{}),(500,{})]:
            with self.subTest(status=status),self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
                runner.reserve_aud031(self.auth,lambda ref,sha:(status,body))
        def lost_response(ref,sha):
            self.create(ref,sha)
            raise TimeoutError('private diagnostic')
        with self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
            runner.reserve_aud031(self.auth,lost_response)
        with self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
            runner.reserve_aud031(self.auth,self.create)
        with self.assertRaisesRegex(RuntimeError,'IDENTITY_REQUIRED'):
            runner.reserve_aud031(dict(self.auth,attempt=2),self.create)

    def test_unprotected_deletion_demonstrates_required_server_protection(self):
        receipt=runner.reserve_aud031(self.auth,self.create)
        # Modifying the value cannot grant another exclusive creation.
        other=self.git('hash-object','-w','--stdin',data=b'tampered').stdout.strip().decode()
        self.assertEqual(self.git('update-ref',receipt['ref'],other).returncode,0)
        with self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
            runner.reserve_aud031(dict(self.auth,runId='124'),self.create)
        # A plain ref is mutable: do NOT mistake local Git for protected GitHub.
        self.assertEqual(self.git('update-ref','-d',receipt['ref']).returncode,0)
        replay=runner.reserve_aud031(dict(self.auth,runId='124'),self.create)
        self.assertEqual(replay['ref'],receipt['ref'])

    def test_process_exit_failure_or_cancellation_never_releases_consumption(self):
        import sys
        program="""import importlib.util,json,os,subprocess,sys
spec=importlib.util.spec_from_file_location('auth',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
a=json.loads(sys.argv[3])
def create(ref,sha):
 r=subprocess.run(['git','--git-dir='+sys.argv[2],'update-ref',ref,sha,'0'*40],capture_output=True)
 return (201,{'ref':ref,'object':{'sha':sha,'type':'commit'}}) if r.returncode==0 else (422,{})
m.reserve_aud031(a,create)
os._exit(int(sys.argv[4]))
"""
        for exit_code in (0,1,130):
            auth=dict(self.auth,reviewId=1000+exit_code)
            child=subprocess.run([sys.executable,'-B','-c',program,str(ROOT/'scripts/b2-directory-postgres.py'),str(self.repo),json.dumps(auth),str(exit_code)],capture_output=True)
            self.assertEqual(child.returncode,exit_code)
            with self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED'):
                runner.reserve_aud031(dict(auth,runId='999'),self.create)

    def probe_function(self):
        import ast, concurrent.futures, threading, textwrap
        workflow=(ROOT/runner.R3_WORKFLOW).read_text()
        job=workflow.split('  aud031-reservation-probe:',1)[1].split('  aud031-probe-caller:',1)[0]
        probe=job.split('- name: Synthetic App reservation probe only',1)[1]
        script=textwrap.dedent(probe.split("python -I - <<'PY'\n",1)[1].rsplit('\n          PY',1)[0])
        tree=ast.parse(script)
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='exercise')
        namespace={'concurrent':concurrent,'threading':threading,'hashlib':hashlib,'mark':lambda stage:None}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'<trusted-probe-test>','exec'),namespace)
        return namespace['exercise'],job

    def test_reusable_probe_consumes_canonical_reservation_without_native_import(self):
        exercise,job=self.probe_function()
        methods=[]
        def api(method,path,payload=None):
            methods.append(method)
            if method=='POST':return self.create(payload['ref'],payload['sha'])
            if method in ('PATCH','DELETE'):return 422,{'rulesetDenied':True}
            self.assertIn('/git/ref/tags/',path)
            ref=path.split('/git/ref/',1)[1]
            sha=self.git('rev-parse','refs/'+ref).stdout.strip().decode()
            return 200,{'object':{'sha':sha}}
        exercise(api,runner.reserve_aud031,self.auth,runner.AUD031_RESERVATION_TARGET)
        self.assertEqual(methods.count('PATCH'),1);self.assertEqual(methods.count('DELETE'),1)
        self.assertNotIn('contents: write',job)
        self.assertRegex(job,r'(?m)^          ref: [0-9a-f]{40}$')
        self.assertNotIn('secrets: inherit',job)
        self.assertNotIn('github.event.pull_request.head.sha',job)
        self.assertNotIn('python scripts/b2-directory-postgres.py',job)

    def test_probe_rejects_unconfirmed_protection_and_network_failures(self):
        exercise,_=self.probe_function()
        def api(method,path,payload=None):
            if method=='POST':return self.create(payload['ref'],payload['sha'])
            return 200,{}
        with self.assertRaisesRegex(RuntimeError,'PROTECTION_DENIAL_NOT_CONFIRMED'):
            exercise(api,runner.reserve_aud031,self.auth,runner.AUD031_RESERVATION_TARGET)
        def offline(*args):raise TimeoutError('must never escape as success')
        with self.assertRaisesRegex(RuntimeError,'EXCLUSIVITY_FAILED'):
            exercise(offline,runner.reserve_aud031,dict(self.auth,reviewId=300),runner.AUD031_RESERVATION_TARGET)

    def test_probe_never_counts_network_loss_or_generic_errors_as_duplicate_denials(self):
        exercise,_=self.probe_function()
        for index,(phase,mode) in enumerate((('race','timeout'),('reuse','timeout'),('reuse','generic422'),('reuse','forbidden'),('lost-reuse','timeout'),('lost-reuse','generic422'))):
            with self.subTest(phase=phase,mode=mode):
                count=0;lock=__import__('threading').Lock()
                def api(method,path,payload=None):
                    nonlocal count
                    if method=='POST':
                        with lock:
                            count+=1;number=count
                            status,value=self.create(payload['ref'],payload['sha'])
                        broken=(phase=='race' and number<=2 and status==422) or (phase=='reuse' and number==3) or (phase=='lost-reuse' and number==5)
                        if broken:
                            if mode=='timeout':raise TimeoutError('synthetic unobserved response')
                            if mode=='forbidden':return 403,{'rulesetDenied':True,'denialClass':'RULESET_DENIED'}
                            return 422,{'denialClass':'OTHER_HTTP_ERROR'}
                        if status==422:value={'denialClass':'REFERENCE_ALREADY_EXISTS'}
                        return status,value
                    if method in ('PATCH','DELETE'):return 422,{'rulesetDenied':True}
                    return 200,{'object':{'sha':runner.AUD031_RESERVATION_TARGET}}
                expected='EXCLUSIVITY_FAILED' if phase=='race' else 'REJECTION_NOT_CONFIRMED'
                with contextlib.redirect_stdout(io.StringIO()),self.assertRaisesRegex(RuntimeError,expected):
                    exercise(api,runner.reserve_aud031,dict(self.auth,reviewId=600+index),runner.AUD031_RESERVATION_TARGET)

    def test_lost_response_setup_requires_exact_confirmed_creation(self):
        exercise,_=self.probe_function()
        for index,wrong in enumerate(('missing','ref','type','sha')):
            with self.subTest(wrong=wrong):
                count=0;lock=__import__('threading').Lock()
                def api(method,path,payload=None):
                    nonlocal count
                    if method=='POST':
                        with lock:
                            count+=1;number=count;status,value=self.create(payload['ref'],payload['sha'])
                        if number==4:
                            if wrong=='missing':return 201,{}
                            value={'ref':payload['ref'],'object':{'type':'commit','sha':payload['sha']}}
                            if wrong=='ref':value['ref']+='0'
                            else:value['object'][wrong]='unapproved'
                        return status,value
                    if method in ('PATCH','DELETE'):return 422,{'rulesetDenied':True}
                    return 200,{'object':{'sha':runner.AUD031_RESERVATION_TARGET}}
                with contextlib.redirect_stdout(io.StringIO()),self.assertRaisesRegex(RuntimeError,'PROBE_SETUP_FAILED'):
                    exercise(api,runner.reserve_aud031,dict(self.auth,reviewId=700+index),runner.AUD031_RESERVATION_TARGET)

    def test_race_reports_each_attempt_without_leaking_response_or_network_error(self):
        exercise,_=self.probe_function()
        marker='SENSITIVE_RESPONSE_JWT_TOKEN_PRIVATE_KEY'
        for statuses in ((403,403),(403,422),(201,403),(409,500),(200,201)):
            lock=__import__('threading').Lock();pending=list(statuses)
            def api(*args):
                with lock:status=pending.pop()
                return status,{'message':marker,'token':marker,'denialClass':marker}
            output=io.StringIO()
            with contextlib.redirect_stdout(output),self.assertRaisesRegex(RuntimeError,'EXCLUSIVITY_FAILED'):
                exercise(api,runner.reserve_aud031,self.auth,runner.AUD031_RESERVATION_TARGET)
            lines=output.getvalue().splitlines()
            self.assertEqual(len(lines),2)
            self.assertEqual({line.split(';')[0] for line in lines},{'PROBE attempt=1','PROBE attempt=2'})
            self.assertEqual(sorted(int(line.split('http=')[1].split(';')[0]) for line in lines),sorted(statuses))
            for line in lines:
                self.assertNotIn(marker,line)
                self.assertIn('confirmed=False;',line)
                self.assertTrue(line.endswith('denial=OTHER_HTTP_ERROR'))
        def offline(*args):raise TimeoutError(marker)
        output=io.StringIO()
        with contextlib.redirect_stdout(output),self.assertRaisesRegex(RuntimeError,'EXCLUSIVITY_FAILED'):
            exercise(offline,runner.reserve_aud031,self.auth,runner.AUD031_RESERVATION_TARGET)
        self.assertEqual(output.getvalue().count('confirmed=False; http=NONE; denial=NO_RESPONSE'),2)
        self.assertNotIn(marker,output.getvalue())

    def test_environment_caller_guard_rejects_untrusted_identity_route_event_and_SHA(self):
        import ast,textwrap,re
        workflow=(ROOT/runner.R3_WORKFLOW).read_text()
        job=workflow.split('  aud031-reservation-probe:',1)[1].split('  aud031-probe-caller:',1)[0]
        preflight=job.split('- name: Validate approved caller',1)[1].split('      - uses:',1)[0]
        self.assertNotIn('secrets.',preflight)
        declaration=workflow.split('  pull_request_review:',1)[0]
        self.assertIn('    secrets:\n      CLEANOPS_NATIVE_AUTH_PRIVATE_KEY:\n        required: false',declaration)
        self.assertIn('      CLEANOPS_AUD031_NATIVE_PRIVATE_KEY:\n        required: false',declaration)
        self.assertNotIn('secrets: inherit',workflow)
        self.assertIn("environment: ${{ inputs.native_reservation && 'cleanops-native-auth-validation' || 'cleanops-native-auth-probe' }}",job)
        script=textwrap.dedent(preflight.split("python -I - <<'PY'\n",1)[1].split('\n          PY',1)[0])
        function=next(n for n in ast.parse(script).body if isinstance(n,ast.FunctionDef))
        namespace={'re':re};exec(compile(ast.Module(body=[function],type_ignores=[]),'<caller-guard>','exec'),namespace)
        guard=namespace['approved_caller']
        good={'APPROVED_CALLER_SHA':'a'*40,'CALLER_REPOSITORY':'novo34/cleanops-360','CALLER_REPOSITORY_ID':'1412999204',
              'CALLER_ACTOR_ID':'17856013','CALLER_TRIGGERING_ACTOR':'novo34','CALLER_EVENT':'workflow_dispatch',
              'CALLER_REF':'refs/tags/cleanops-native-auth-probe-caller-fixed1',
              'CALLER_WORKFLOW_REF':'novo34/cleanops-360/.github/workflows/b2-acceptance-r2-postgres.yml@refs/tags/cleanops-native-auth-probe-caller-fixed1',
              'CALLER_ATTEMPT':'1','CALLER_SHA':'a'*40,'CALLER_WORKFLOW_SHA':'a'*40}
        self.assertTrue(guard(good))
        for previous in ('cleanops-native-auth-probe-caller','cleanops-native-auth-probe-caller-diag1'):
            ref='refs/tags/'+previous
            route='novo34/cleanops-360/.github/workflows/b2-acceptance-r2-postgres.yml@'+ref
            self.assertFalse(guard(dict(good,CALLER_REF=ref)))
            self.assertFalse(guard(dict(good,CALLER_WORKFLOW_REF=route)))
            self.assertFalse(guard(dict(good,CALLER_REF=ref,CALLER_WORKFLOW_REF=route)))
        for key in good:
            with self.subTest(key=key):
                self.assertFalse(guard({k:v for k,v in good.items() if k!=key}))
                self.assertFalse(guard(dict(good,**{key:'unapproved'})))
        for event in ('pull_request_review','pull_request','push','workflow_run'):
            self.assertFalse(guard(dict(good,CALLER_EVENT=event)))
        self.assertFalse(guard(dict(good,CALLER_WORKFLOW_SHA='b'*40)))
        self.assertFalse(guard(dict(good,CALLER_SHA='b'*40)))
        self.assertFalse(guard(dict(good,CALLER_ATTEMPT='2')))
        native=dict(good,NATIVE_PROFILE='true',CALLER_EVENT='pull_request_review',
                    CALLER_REF='refs/pull/23/merge',
                    CALLER_WORKFLOW_REF='novo34/cleanops-360/'+runner.R3_WORKFLOW+'@refs/pull/23/merge')
        native.pop('APPROVED_CALLER_SHA')  # Native profile never borrows the probe's approval variable.
        self.assertTrue(guard(native))
        for key in native:
            with self.subTest(native_key=key):
                self.assertFalse(guard({k:v for k,v in native.items() if k!=key}))
                self.assertFalse(guard(dict(native,**{key:'unapproved'})))
        context={'inputs':{'reservation_probe':True},'github':{'repository':'novo34/cleanops-360','repository_id':'1412999204',
                 'actor_id':'17856013','run_attempt':1,'event_name':'pull_request_review','ref':'refs/pull/23/merge',
                 'workflow_ref':'novo34/cleanops-360/.github/workflows/unapproved.yml@refs/pull/23/merge'}}
        condition=next(line.strip()[4:] for line in job.splitlines() if line.strip().startswith('if:'))
        self.assertFalse(ActionsCondition(condition,context).evaluate())
        allowed={'inputs':{'reservation_probe':True},'github':{'repository':'novo34/cleanops-360',
                 'repository_id':'1412999204','actor_id':'17856013','run_attempt':1,'event_name':'workflow_dispatch',
                 'ref':good['CALLER_REF'],'workflow_ref':good['CALLER_WORKFLOW_REF']}}
        self.assertTrue(ActionsCondition(condition,allowed).evaluate())
        for key in allowed['github']:
            self.assertFalse(ActionsCondition(condition,dict(allowed,github=dict(allowed['github'],**{key:'unapproved'}))).evaluate())
        for previous in ('cleanops-native-auth-probe-caller','cleanops-native-auth-probe-caller-diag1'):
            ref='refs/tags/'+previous
            route='novo34/cleanops-360/.github/workflows/b2-acceptance-r2-postgres.yml@'+ref
            self.assertFalse(ActionsCondition(condition,dict(allowed,github=dict(allowed['github'],ref=ref,workflow_ref=route))).evaluate())

    def test_probe_diagnostics_allow_only_catalog_and_numeric_HTTP_without_raw_errors(self):
        import ast, contextlib, io, textwrap
        workflow=(ROOT/runner.R3_WORKFLOW).read_text()
        probe=workflow.split('- name: Synthetic App reservation probe only',1)[1]
        script=textwrap.dedent(probe.split("python -I - <<'PY'\n",1)[1].rsplit('\n          PY',1)[0])
        tree=ast.parse(script)
        nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('mark','report_failure')]
        namespace={'diagnostic':{'stage':'TRUSTED_SOURCE','http':None}}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'<probe-diagnostics>','exec'),namespace)
        report=namespace['report_failure']; mark=namespace['mark']
        marker='SENSITIVE_SENTINEL_JWT_TOKEN_PRIVATE_KEY_HTTP_BODY'
        class Unsafe:
            def __str__(self):raise AssertionError('must never stringify untrusted data')
        for error in (RuntimeError(marker),ValueError(marker),TimeoutError(marker),
                      RuntimeError(Unsafe()),RuntimeError('KEY_REQUIRED',marker)):
            for stage,status in [('JWT_SIGNING',None),('WRITE_TOKEN',403),(marker,marker),
                                 (Unsafe(),Unsafe()),('INSTALLATION',True),('INSTALLATION',600)]:
                with self.subTest(error_type=type(error).__name__,status_type=type(status).__name__):
                    namespace['diagnostic'].update(stage=stage,http=status)
                    output=io.StringIO()
                    with contextlib.redirect_stdout(output):report(error)
                    value=output.getvalue()
                    self.assertNotIn(marker,value)
                    self.assertIn('code=UNEXPECTED_ERROR;',value)
                    self.assertRegex(value,r'^FAIL trusted App reservation; NO SQL; stage=[A-Z_]+; code=UNEXPECTED_ERROR; last_http=(NONE|403)\n$')
        mark('READ_TOKEN'); namespace['diagnostic']['http']=401
        output=io.StringIO()
        with contextlib.redirect_stdout(output):report(RuntimeError('TOKEN_REQUIRED'))
        self.assertIn('stage=READ_TOKEN; code=TOKEN_REQUIRED; last_http=401',output.getvalue())
        mark('WRITE_TOKEN')
        self.assertIsNone(namespace['diagnostic']['http'])
        # Exercise the actual outer handler: it must never print the raw exception.
        outer=next(n for n in tree.body if isinstance(n,ast.Try))
        failure=ast.Raise(exc=ast.Call(func=ast.Name(id='ValueError',ctx=ast.Load()),args=[ast.Constant(marker)],keywords=[]),cause=None)
        harness=ast.fix_missing_locations(ast.Module(body=[ast.Try(body=[failure],handlers=outer.handlers,orelse=[],finalbody=[])],type_ignores=[]))
        output=io.StringIO()
        with contextlib.redirect_stdout(output),self.assertRaises(SystemExit) as stopped:
            exec(compile(harness,'<probe-handler>','exec'),namespace)
        self.assertEqual(stopped.exception.code,1)
        self.assertNotIn(marker,output.getvalue())
        self.assertIn('stage=WRITE_TOKEN; code=UNEXPECTED_ERROR; last_http=NONE',output.getvalue())
        # Diagnostics instrument only: every stage and literal failure is catalogued.
        report_node=next(n for n in nodes if n.name=='report_failure')
        catalogs={n.targets[0].id:ast.literal_eval(n.value) for n in report_node.body if isinstance(n,ast.Assign) and isinstance(n.value,ast.Tuple)}
        for call in (n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name)):
            if call.func.id=='mark' and isinstance(call.args[0],ast.Constant):
                self.assertIn(call.args[0].value,catalogs['stages'])
            if call.func.id=='RuntimeError' and isinstance(call.args[0],ast.Constant):
                self.assertIn(call.args[0].value,catalogs['codes'])

    def test_probe_HTTP_error_body_and_transport_exception_never_reach_diagnostics(self):
        import ast, textwrap, urllib.request, urllib.error
        workflow=(ROOT/runner.R3_WORKFLOW).read_text()
        probe=workflow.split('- name: Synthetic App reservation probe only',1)[1]
        script=textwrap.dedent(probe.split("python -I - <<'PY'\n",1)[1].rsplit('\n          PY',1)[0])
        tree=ast.parse(script)
        nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('api','report_failure')]
        namespace={'urllib':urllib,'json':json,'token':'synthetic-test-only',
                   'diagnostic':{'stage':'INSTALLATION','http':None}}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'<probe-HTTP-diagnostics>','exec'),namespace)
        marker='SENSITIVE_HTTP_BODY_OR_NETWORK_EXCEPTION'
        errors=[urllib.error.HTTPError('https://api.github.com/test',401,marker,{},io.BytesIO(json.dumps({'message':marker}).encode())),
                urllib.error.URLError(marker)]
        for error in errors:
            namespace['diagnostic']['http']=None
            output=io.StringIO()
            # Replace the actual opener; no credential or network operation occurs.
            with patch('urllib.request.build_opener') as opener,contextlib.redirect_stdout(output):
                opener.return_value.open.side_effect=error
                try:
                    status,value=namespace['api']('GET','/app/installations/175934135')
                    self.assertEqual((status,value),(401,{'rulesetDenied':False,'denialClass':'OTHER_HTTP_ERROR'}))
                    namespace['report_failure'](RuntimeError('INSTALLATION_REQUIRED'))
                except urllib.error.URLError as caught:
                    namespace['report_failure'](caught)
            self.assertNotIn(marker,output.getvalue())
            expected='code=INSTALLATION_REQUIRED; last_http=401' if isinstance(error,urllib.error.HTTPError) else 'code=UNEXPECTED_ERROR; last_http=NONE'
            self.assertIn(expected,output.getvalue())

    def test_probe_denial_catalog_from_HTTP_errors_is_sanitized(self):
        import ast,textwrap,urllib.request,urllib.error
        probe=(ROOT/runner.R3_WORKFLOW).read_text().split('- name: Synthetic App reservation probe only',1)[1]
        script=textwrap.dedent(probe.split("python -I - <<'PY'\n",1)[1].rsplit('\n          PY',1)[0])
        fn=next(n for n in ast.parse(script).body if isinstance(n,ast.FunctionDef) and n.name=='api')
        namespace={'urllib':urllib,'json':json,'token':'synthetic-only','diagnostic':{}}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'<HTTP-catalog>','exec'),namespace)
        marker='SENSITIVE_SENTINEL_TOKEN'
        for message,expected in [('Repository rule violations found: '+marker,'RULESET_DENIED'),
                                 ('Resource not accessible by integration','INTEGRATION_DENIED'),
                                 ('refusing to allow a GitHub App to create or update workflow '+marker,'WORKFLOW_DENIED'),
                                 (marker,'OTHER_HTTP_ERROR')]:
            error=urllib.error.HTTPError('https://api.github.com/test',403,marker,{},io.BytesIO(json.dumps({'message':message,'token':marker}).encode()))
            with patch('urllib.request.build_opener') as opener:
                opener.return_value.open.side_effect=error
                status,value=namespace['api']('POST','/repos/novo34/cleanops-360/git/refs',{})
            self.assertEqual(status,403)
            self.assertEqual(value,{'rulesetDenied':expected=='RULESET_DENIED','denialClass':expected})
            self.assertNotIn(marker,json.dumps(value))
        endpoint='/repos/novo34/cleanops-360/git/refs'
        duplicate={'resource':'Reference','field':'ref','code':'already_exists'}
        cases=[(422,'POST',endpoint,{'message':'Reference already exists'},'REFERENCE_ALREADY_EXISTS'),
               (422,'POST',endpoint,{'message':'Validation Failed','errors':[duplicate]},'REFERENCE_ALREADY_EXISTS'),
               (403,'POST',endpoint,{'message':'Reference already exists'},'OTHER_HTTP_ERROR'),
               (422,'GET',endpoint,{'message':'Reference already exists'},'OTHER_HTTP_ERROR'),
               (422,'POST',endpoint+'/other',{'message':'Reference already exists'},'OTHER_HTTP_ERROR'),
               (422,'POST',endpoint,{'message':'Validation Failed','errors':[{**duplicate,'field':'sha'}]},'OTHER_HTTP_ERROR'),
               (422,'POST',endpoint,{'message':'Repository rule violations found','errors':[duplicate]},'RULESET_DENIED')]
        for status,method,path,body,expected in cases:
            with self.subTest(status=status,method=method,path=path,expected=expected):
                body['token']=marker
                error=urllib.error.HTTPError('https://api.github.com/test',status,marker,{},io.BytesIO(json.dumps(body).encode()))
                with patch('urllib.request.build_opener') as opener:
                    opener.return_value.open.side_effect=error
                    actual,value=namespace['api'](method,path,{})
                self.assertEqual(actual,status)
                self.assertEqual(value,{'rulesetDenied':expected=='RULESET_DENIED','denialClass':expected})
                self.assertNotIn(marker,json.dumps(value))

    def test_nominal_secret_empty_value_denies_before_signing_or_API(self):
        import ast,textwrap,types
        workflow=(ROOT/runner.R3_WORKFLOW).read_text()
        probe=workflow.split('- name: Synthetic App reservation probe only',1)[1]
        script=textwrap.dedent(probe.split("python -I - <<'PY'\n",1)[1].rsplit('\n          PY',1)[0])
        body=next(n.body for n in ast.parse(script).body if isinstance(n,ast.Try))
        # Execute the actual empty-key check only; never sign or contact GitHub.
        assign=next(n for n in body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='key' for t in n.targets))
        deny=next(n for n in body if isinstance(n,ast.If) and isinstance(n.test,ast.UnaryOp) and isinstance(n.test.operand,ast.Name) and n.test.operand.id=='key')
        code=compile(ast.Module(body=[assign,deny],type_ignores=[]),'<empty-key-gate>','exec')
        for values in ({},{'NATIVE_AUTH_KEY':''}):
            with self.subTest(values=values),self.assertRaisesRegex(RuntimeError,'KEY_REQUIRED'):
                exec(code,{'os':types.SimpleNamespace(environ=dict(values))})
        # Environment protection is enforced by GitHub before the job runner;
        # its reviewer/ref policy cannot be proved by this local syntax check.
        self.assertIn("environment: ${{ inputs.native_reservation && 'cleanops-native-auth-validation' || 'cleanops-native-auth-probe' }}",workflow)
        self.assertIn('required: true',workflow.split('  pull_request_review:',1)[0])

class Aud031NativeWriterTests(unittest.TestCase):
    """Execute the shared App program with inert signing and HTTP boundaries."""
    SOURCE='830b9665fb65a4ec10c1368ff52ad2a743061fb8'

    @classmethod
    def setUpClass(cls):
        import ast,textwrap
        cls.workflow=(ROOT/runner.R3_WORKFLOW).read_text()
        block=cls.workflow.split('- name: Synthetic App reservation probe only',1)[1]
        cls.script=textwrap.dedent(block.split("python -I - <<'PY'\n",1)[1].rsplit('\n          PY',1)[0])
        cls.code=compile(ast.parse(cls.script),'<shared-App-program>','exec')
        cls.source=subprocess.check_output(['git','--no-replace-objects','show',cls.SOURCE+':scripts/b2-directory-postgres.py'],cwd=ROOT)

    def execute_writer(self,mode='success',key='synthetic-private-key'):
        import types,urllib.request
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'trusted/scripts/b2-directory-postgres.py'
            source.parent.mkdir(parents=True);source.write_bytes(self.source if mode!='wrong-source' else b'raise AssertionError("UNTRUSTED")\n')
            output=root/'output';calls=[];contexts=0;signatures=[];revocations=0;authorizations=0
            auth={'candidate':'1'*40,'manifestSha256':'3'*64,'workflow':'2'*40,'base':'4'*40,
                  'reviewId':123,'reviewBodySha256':'5'*64,'runId':'123','attempt':1}
            def authorize(scope,*,trusted_source_sha):
                nonlocal authorizations
                authorizations+=1
                self.assertEqual((scope,trusted_source_sha),('sql5-aud031',self.SOURCE))
                self.assertNotIn('NATIVE_AUTH_KEY',os.environ)
                if authorizations==1:self.assertFalse(calls);self.assertFalse(signatures)
                if ((mode=='refs-changed-before-create' and authorizations==2)
                        or (mode=='refs-changed-before-output' and authorizations==3)):
                    raise RuntimeError('CURRENT_R3_REFERENCES_REQUIRED')
                if mode=='denied':raise RuntimeError('AUD031_EXACT_OWNER_APPROVAL_REQUIRED')
                return {'authorization':auth}
            def context(scope):
                nonlocal contexts
                self.assertEqual(scope,'sql5-aud031');contexts+=1
                if (mode=='expired-before-create' and contexts==2) or (mode=='expired-before-output' and contexts==3):
                    raise RuntimeError('FRESH_R3_OWNER_REVIEW_REQUIRED')
                return {'review':123 if not (mode=='changed-context' and contexts==2) else 456}
            module=types.SimpleNamespace(authorize_r3=authorize,execution_context=context,reserve_aud031=runner.reserve_aud031)
            spec=types.SimpleNamespace(loader=types.SimpleNamespace(exec_module=lambda loaded:self.assertIs(loaded,module)))
            def signing(args,**kwargs):
                self.assertEqual(args[:5],['openssl','dgst','-sha256','-sign','/dev/stdin'])
                self.assertNotIn('NATIVE_AUTH_KEY',os.environ)
                self.assertEqual(kwargs['input'],key.encode());signatures.append(True)
                return subprocess.CompletedProcess(args,0,stdout=b'synthetic-signature')
            class Response:
                def __init__(self,status,value):self.status=status;self.value=value
                def __enter__(self):return self
                def __exit__(self,*args):return False
                def read(self):return json.dumps(self.value).encode() if self.value is not None else b''
            def request(req,timeout):
                nonlocal revocations
                self.assertEqual(timeout,20)
                self.assertTrue(req.full_url.startswith('https://api.github.com/'))
                self.assertFalse(output.exists(),'receipt emitted before token revocation')
                method=req.get_method();path=req.full_url.removeprefix('https://api.github.com')
                calls.append((method,path))
                if path=='/app/installations/175934135':return Response(200,{'app_id':5500214,'repository_selection':'selected'})
                if path.endswith('/access_tokens'):return Response(201,{'token':'synthetic-installation-token'})
                if path=='/installation/repositories':return Response(200,{'total_count':1,'repositories':[{'full_name':'novo34/cleanops-360'}]})
                if path=='/installation/token':
                    self.assertEqual(method,'DELETE');revocations+=1
                    return Response(500 if mode=='revoke-failed' and revocations==2 else 204,None)
                self.assertEqual((method,path),('POST','/repos/novo34/cleanops-360/git/refs'))
                payload=json.loads(req.data)
                if mode=='lost-response':raise TimeoutError('synthetic private response')
                if mode=='cancelled':raise SystemExit(130)
                if mode=='duplicate':return Response(422,{'message':'Reference already exists'})
                return Response(201,{'ref':payload['ref'],'object':{'type':'commit','sha':payload['sha'] if mode!='ambiguous' else '6'*40}})
            stdout=io.StringIO();exit_code=0
            with contextlib.chdir(root),patch.dict(os.environ,{'NATIVE_PROFILE':'true','NATIVE_AUTH_KEY':key,'GITHUB_RUN_ID':'123','GITHUB_OUTPUT':str(output)},clear=True),patch('importlib.util.spec_from_file_location',return_value=spec),patch('importlib.util.module_from_spec',return_value=module),patch('subprocess.run',side_effect=signing),patch('signal.signal'),patch('urllib.request.build_opener',return_value=types.SimpleNamespace(open=request)),contextlib.redirect_stdout(stdout):
                try:exec(self.code,{})
                except SystemExit as error:exit_code=error.code
            if mode=='success' and key:self.assertEqual(authorizations,3)
            text_output=stdout.getvalue()
            for private in (key,'synthetic-installation-token','synthetic private response'):
                if private:self.assertNotIn(private,text_output)
            receipt=None
            if output.exists():
                lines=output.read_text().splitlines();self.assertEqual(len(lines),1)
                self.assertTrue(lines[0].startswith('native_receipt='))
                receipt=json.loads(lines[0].split('=',1)[1])
                self.assertNotIn('synthetic-installation-token',json.dumps(receipt))
            return exit_code,receipt,calls,revocations,len(signatures)

    def test_native_writer_emits_exact_receipt_after_revocation(self):
        code,receipt,calls,revocations,signatures=self.execute_writer()
        self.assertEqual(code,0);self.assertEqual(revocations,2);self.assertEqual(signatures,1)
        self.assertEqual(set(receipt),{'schemaVersion','authorization','reservation','writerSourceSha'})
        self.assertEqual(receipt['schemaVersion'],1);self.assertEqual(receipt['writerSourceSha'],self.SOURCE)
        self.assertEqual(receipt['reservation']['candidate'],receipt['authorization']['candidate'])
        self.assertEqual(receipt['reservation']['reservationTarget'],runner.AUD031_RESERVATION_TARGET)
        self.assertEqual(calls.count(('POST','/repos/novo34/cleanops-360/git/refs')),1)
        self.assertFalse(any(method=='PATCH' or '/git/ref/' in path for method,path in calls))

    def test_native_writer_denies_before_signing_or_HTTP(self):
        for mode,key in [('denied','synthetic-private-key'),('wrong-source','synthetic-private-key'),('success','')]:
            with self.subTest(mode=mode,key_present=bool(key)):
                code,receipt,calls,revocations,signatures=self.execute_writer(mode,key)
                self.assertEqual(code,1);self.assertIsNone(receipt);self.assertEqual(calls,[])
                self.assertEqual((revocations,signatures),(0,0))

    def test_native_writer_never_retries_or_emits_on_uncertain_creation(self):
        for mode in ('lost-response','duplicate','ambiguous','cancelled'):
            with self.subTest(mode=mode):
                code,receipt,calls,revocations,signatures=self.execute_writer(mode)
                self.assertNotEqual(code,0);self.assertIsNone(receipt);self.assertEqual(revocations,2)
                self.assertEqual(calls.count(('POST','/repos/novo34/cleanops-360/git/refs')),1)
                self.assertFalse(any(method=='PATCH' or '/git/ref/' in path for method,path in calls))

    def test_native_writer_expiry_or_revocation_failure_has_no_receipt(self):
        for mode in ('expired-before-create','expired-before-output','changed-context','revoke-failed','refs-changed-before-create','refs-changed-before-output'):
            with self.subTest(mode=mode):
                code,receipt,calls,revocations,signatures=self.execute_writer(mode)
                self.assertEqual(code,1);self.assertIsNone(receipt);self.assertEqual(revocations,2)
                expected=0 if mode in ('expired-before-create','changed-context','refs-changed-before-create') else 1
                self.assertEqual(calls.count(('POST','/repos/novo34/cleanops-360/git/refs')),expected)

    def test_historical_preparation_fetches_orphan_snapshots_without_moving_P(self):
        import shlex
        block=self.workflow.split('- name: Acquire exact historical objects before any private key',1)[1].split('      - name:',1)[0]
        self.assertIn('if: inputs.native_reservation == true',block)
        self.assertNotIn('secrets.',block)
        self.assertIn('working-directory: trusted',block)
        command=shlex.split(' '.join(block.split('run:',1)[1].split('\n',1)[1].split()))
        expected=['git','--no-replace-objects','fetch','--no-tags','--no-recurse-submodules',
                  '--no-write-fetch-head','--no-auto-maintenance','https://github.com/novo34/cleanops-360.git']
        self.assertEqual(command[:-3],expected)
        prior=json.loads(subprocess.check_output(['git','show',self.SOURCE+':docs/implementation/b2/invitation-administration-authorization.json'],cwd=ROOT))
        self.assertEqual(set(command[-3:]),{runner.COMPOSITION_REFERENCE,*(p['fixtureReference'] for p in runner.PACKAGES.values()),prior['referenceCommit']})
        self.assertLess(self.workflow.index('- name: Acquire exact historical objects'),self.workflow.index('- name: Synthetic App reservation probe only'))
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);origin=root/'origin';trusted=root/'trusted'
            def git(where,*args,data=None):
                return subprocess.run(['git','--no-replace-objects',*args],cwd=where,input=data,capture_output=True,check=True)
            git(root,'init','--bare',str(origin))
            def commit(value):
                blob=git(origin,'hash-object','-w','--stdin',data=value).stdout.strip()
                tree=git(origin,'mktree',data=b'100644 blob '+blob+b'\tvalue.txt\n').stdout.strip().decode()
                return git(origin,'-c','user.name=Static test','-c','user.email=static@example.invalid','commit-tree',tree,'-m','snapshot').stdout.strip().decode()
            source=commit(b'trusted P');git(origin,'update-ref','refs/heads/source',source)
            snapshots=[commit(('history '+str(i)).encode()) for i in range(3)]
            for i,reference in enumerate(snapshots):git(origin,'update-ref','refs/heads/orphan-'+str(i),reference)
            git(root,'clone','--quiet','--depth=1','--single-branch','--branch','source',origin.as_uri(),str(trusted))
            self.assertEqual(git(trusted,'rev-parse','--is-shallow-repository').stdout.strip(),b'true')
            for reference in snapshots:
                self.assertNotEqual(subprocess.run(['git','cat-file','-e',reference],cwd=trusted,capture_output=True).returncode,0)
            refs=git(trusted,'for-each-ref').stdout
            # Replace only the offline transport fixtures after checking the
            # production command's exact URL, flags and closed historical pins.
            command[-4]=origin.as_uri();command[-3:]=snapshots
            subprocess.run(command,cwd=trusted,capture_output=True,check=True,timeout=60)
            self.assertEqual(git(trusted,'rev-parse','HEAD').stdout.strip().decode(),source)
            self.assertEqual(git(trusted,'for-each-ref').stdout,refs)
            self.assertEqual((trusted/'value.txt').read_bytes(),b'trusted P')
            for i,reference in enumerate(snapshots):
                self.assertEqual(git(trusted,'show',reference+':value.txt').stdout,('history '+str(i)).encode())

    def test_native_profile_requires_exact_context_and_secret_selection_never_falls_back(self):
        job=self.workflow.split('  aud031-reservation-probe:',1)[1].split('  aud031-probe-caller:',1)[0]
        condition=next(line.strip()[4:] for line in job.splitlines() if line.strip().startswith('if:'))
        base={'repository':'novo34/cleanops-360','repository_id':'1412999204','actor_id':'17856013','run_attempt':1,'event_name':'pull_request_review','ref':'refs/pull/23/merge'}
        for event in ('pull_request_review','workflow_dispatch','push','pull_request'):
            for probe in (False,True):
                context={'inputs':{'native_reservation':True,'reservation_probe':probe},'github':dict(base,event_name=event)}
                self.assertEqual(ActionsCondition(condition,context).evaluate(),event=='pull_request_review' and not probe)
        for key in base:
            context={'inputs':{'native_reservation':True,'reservation_probe':False},'github':dict(base,**{key:'unapproved'})}
            with self.subTest(key=key):self.assertFalse(ActionsCondition(condition,context).evaluate())
        self.assertIn("secrets[inputs.native_reservation && 'CLEANOPS_AUD031_NATIVE_PRIVATE_KEY' || 'CLEANOPS_NATIVE_AUTH_PRIVATE_KEY']",job)
        selector="inputs.native_reservation && 'CLEANOPS_AUD031_NATIVE_PRIVATE_KEY' || 'CLEANOPS_NATIVE_AUTH_PRIVATE_KEY'"
        name=ActionsCondition(selector,{'inputs':{'native_reservation':True}}).evaluate_value()
        secrets={'CLEANOPS_AUD031_NATIVE_PRIVATE_KEY':'','CLEANOPS_NATIVE_AUTH_PRIVATE_KEY':'probe-value'}
        self.assertEqual(secrets[name],'')
        self.assertIn('native_receipt: ${{ steps.app.outputs.native_receipt }}',job)
        self.assertIn('value: ${{ jobs.aud031-reservation-probe.outputs.native_receipt }}',self.workflow)
        self.assertNotIn('contents: write',job);self.assertNotIn('secrets: inherit',job)
        # The native source and its checksum refer to published immutable bytes.
        self.assertIn('ref: '+self.SOURCE,job)
        self.assertIn(hashlib.sha256(self.source).hexdigest(),job)


class Aud031ReceiptTransportTests(unittest.TestCase):
    def test_only_this_run_first_attempt_GET_is_allowed_without_redirects(self):
        marker='synthetic-token-do-not-print'
        with patch.dict(os.environ,{'GITHUB_RUN_ID':'123','GITHUB_TOKEN':marker},clear=True),patch('urllib.request.build_opener') as build:
            response=build.return_value.open.return_value.__enter__.return_value
            response.status=200;response.read.return_value=b'{"id":123}'
            value=runner.aud031_readonly_run_json('/repos/novo34/cleanops-360/actions/runs/123')
            self.assertEqual(value,{'id':123})
            request=build.return_value.open.call_args.args[0]
            self.assertEqual(request.get_method(),'GET');self.assertIsNone(request.data)
            self.assertEqual(request.full_url,'https://api.github.com/repos/novo34/cleanops-360/actions/runs/123')
            self.assertEqual(request.get_header('Authorization'),'Bearer '+marker)
            self.assertEqual(build.return_value.open.call_args.kwargs,{'timeout':15})
            response.read.assert_called_once_with(2097153)
            self.assertIsNone(build.call_args.args[0].redirect_request(None,None,302,'redirect',{},'https://example.invalid'))
            for path in ('https://example.invalid','/repos/novo34/cleanops-360/git/refs',
                         '/repos/novo34/cleanops-360/actions/runs/456',
                         '/repos/novo34/cleanops-360/actions/runs/123/attempts/2/jobs?per_page=100'):
                build.reset_mock()
                with self.assertRaisesRegex(RuntimeError,'AUD031_READONLY_ENDPOINT_REQUIRED'):
                    runner.aud031_readonly_run_json(path)
                build.assert_not_called()

    def test_transport_failure_oversize_or_invalid_JSON_never_discloses_token(self):
        marker='synthetic-private-body-and-token'
        failures=[TimeoutError(marker),ValueError(marker)]
        with patch.dict(os.environ,{'GITHUB_RUN_ID':'123','GITHUB_TOKEN':marker},clear=True):
            for failure in failures:
                with patch('urllib.request.build_opener') as build:
                    build.return_value.open.side_effect=failure
                    with self.assertRaisesRegex(RuntimeError,'^AUD031_TRUSTED_RUN_LOOKUP_FAILED$') as caught:
                        runner.aud031_readonly_run_json('/repos/novo34/cleanops-360/actions/runs/123')
                    self.assertNotIn(marker,str(caught.exception))
            for status,raw in [(500,marker.encode()),(200,b'x'*2097153),(200,b'\xff'),(200,b'{"id":1,"id":2}')]:
                with self.subTest(status=status,size=len(raw)),patch('urllib.request.build_opener') as build:
                    response=build.return_value.open.return_value.__enter__.return_value
                    response.status=status;response.read.return_value=raw
                    with self.assertRaisesRegex(RuntimeError,'^AUD031_TRUSTED_RUN_LOOKUP_FAILED$'):
                        runner.aud031_readonly_run_json('/repos/novo34/cleanops-360/actions/runs/123')
        with patch.dict(os.environ,{'GITHUB_RUN_ID':'123'},clear=True),patch('urllib.request.build_opener') as build:
            with self.assertRaisesRegex(RuntimeError,'AUD031_READONLY_TOKEN_REQUIRED'):
                runner.aud031_readonly_run_json('/repos/novo34/cleanops-360/actions/runs/123')
            build.assert_not_called()

    def test_whole_workflow_contract_fixes_needs_output_permissions_and_unique_reader(self):
        source=(ROOT/runner.R3_WORKFLOW).read_text()
        self.assertEqual(hashlib.sha256(source.encode()).hexdigest(),runner.AUD031_WRITER['readerWorkflowSha256'])
        self.assertEqual(set(runner.AUD031_WRITER),{'workflowSha','sourceSha','readerJob','writerJob','stepName','readerWorkflowSha256'})
        trusted=subprocess.check_output(['git','show',runner.AUD031_WRITER['workflowSha']+':'+runner.R3_WORKFLOW],cwd=ROOT).decode()
        self.assertIn("native_source='"+runner.AUD031_WRITER['sourceSha']+"'",trusted)
        self.assertIn('- name: '+runner.AUD031_WRITER['stepName'],trusted)
        dormant=trusted.split('  aud031-native-reservation:',1)[1].split('  aud031-native-validation:',1)[0]
        self.assertIn('if: false &&',dormant)
        self.assertIn('@ecbcfe360858404ccf84f1100a27d40f46599fd3',dormant)
        caller=source.split('  aud031-native-reservation:',1)[1].split('  aud031-native-validation:',1)[0]
        reader=source.split('  aud031-native-validation:',1)[1]
        self.assertIn('uses: novo34/cleanops-360/'+runner.R3_WORKFLOW+'@'+runner.AUD031_WRITER['workflowSha'],caller)
        self.assertIn('native_reservation: true',caller)
        import re
        # Actions validates permissions of every called job before evaluating if.
        # A disabled reader inside immutable T still requires caller actions:read.
        levels={'none':0,'read':1,'write':2}
        allowed=dict(re.findall(r'^      ([a-z-]+): (none|read|write)$',caller,re.M))
        requested=re.findall(r'^      ([a-z-]+): (none|read|write)$',trusted,re.M)
        self.assertIn(('actions','read'),requested)
        for permission,level in requested:
            self.assertLessEqual(levels[level],levels[allowed.get(permission,'none')],permission)
        self.assertIsNone(re.search(r'^    (?:name|env|secrets|strategy|steps):',caller,re.M))
        self.assertIsNone(re.search(r'^    (?:name|env|secrets|strategy):',reader,re.M))
        self.assertIn('needs: aud031-native-reservation',reader)
        self.assertIn('AUD031_NATIVE_RECEIPT: ${{ needs.aud031-native-reservation.outputs.native_receipt }}',reader)
        self.assertIn('GITHUB_TOKEN: ${{ github.token }}',reader)
        self.assertIn('contents: read\n      actions: read',reader)
        self.assertNotIn('secrets.',reader);self.assertNotIn('contents: write',reader)
        self.assertEqual(source.count('run: python -I -B scripts/b2-directory-postgres.py --package sql5-aud031'),1)
        self.assertEqual(source.count('run: &aud031_historical_objects >-'),1)
        self.assertEqual(source.count('run: *aud031_historical_objects'),1)
        self.assertEqual(source.count('  aud031-native-reservation:'),1)
        self.assertEqual(source.count('  aud031-native-validation:'),1)
        context={'github':{'event_name':'pull_request_review','actor_id':'17856013','triggering_actor':'novo34','run_attempt':1,
                          'event':{'action':'submitted','pull_request':{'number':23,'head':{'ref':'codex/r4-aud-031'}},
                                   'review':{'body':'Execute owner-authorized SQL5-AUD031 candidate '}}},
                 'needs':{'aud031-native-reservation':{'result':'success','outputs':{'native_receipt':'synthetic-only'}}}}
        for block in (caller,reader,reader.split('- name: AUD031 canonical entrypoint',1)[1]):
            condition=next(line.strip()[4:] for line in block.splitlines() if line.strip().startswith('if:'))
            self.assertTrue(ActionsCondition(condition,context).evaluate())
            # Role gating is not authorization. Absent/false are both allowed
            # here only with the complete owner/event context supplied above.
            for native in (None,False,True):
                for probe in (None,False,True):
                    inputs={key:value for key,value in (('native_reservation',native),('reservation_probe',probe)) if value is not None}
                    with self.subTest(native=native,probe=probe):
                        self.assertEqual(ActionsCondition(condition,dict(context,inputs=inputs)).evaluate(),native is not True and probe is not True)
        self.assertIn("needs.aud031-native-reservation.outputs.native_receipt != ''",reader)
        # A skipped reusable
        # writer with a successful parent but no output cannot start C checkout.
        reader_condition=next(line.strip()[4:] for line in reader.splitlines() if line.strip().startswith('if:'))
        context['needs']['aud031-native-reservation']['outputs']={'native_receipt':''}
        self.assertFalse(ActionsCondition(reader_condition,context).evaluate())
        context['needs']['aud031-native-reservation']['outputs']['native_receipt']='synthetic-only'
        self.assertTrue(ActionsCondition(reader_condition,context).evaluate())


class Aud031CommittedCheckoutTests(unittest.TestCase):
    def test_CRLF_checkout_uses_committed_candidate_bytes_for_authorization_tests(self):
        import sys
        with tempfile.TemporaryDirectory() as directory:
            checkout=Path(directory)/'checkout'
            subprocess.run(['git','clone','--quiet','--no-hardlinks','--no-checkout',str(ROOT),str(checkout)],check=True,capture_output=True)
            subprocess.run(['git','config','core.autocrlf','true'],cwd=checkout,check=True,capture_output=True)
            subprocess.run(['git','checkout','--quiet','--force','HEAD'],cwd=checkout,check=True,capture_output=True)
            # Prove that this is actually the Windows-style conversion at issue.
            self.assertIn(b'\r\n',(checkout/runner.AUD031_SQL).read_bytes())
            self.assertIn(b'\r\n',(checkout/runner.AUD031_MANIFEST).read_bytes())
            selected=['test_real_manifest_capability_hashes_do_not_replace_exact_owner_review',
                      'test_exact_synthetic_review_still_requires_trusted_reservation_before_transport',
                      'test_modified_candidate_and_rehashed_historical_dependency_reject']
            result=subprocess.run([sys.executable,'-B','-m','unittest',*[f'test_b2_execution_preflight.Aud031ContractTests.{name}' for name in selected],'-q'],
                                  cwd=checkout,env=dict(os.environ,PYTHONPATH=str(checkout/'tests/static')),capture_output=True,timeout=120)
            self.assertEqual(result.returncode,0,(result.stdout+result.stderr).decode())


class Aud031TrustedCallerCompositionTests(unittest.TestCase):
    """Compose the published caller with the reusable workflow; NO API/SQL."""
    TRUSTED='4f19c36f8eda2c846c6e3c7164814f26841b3bce'
    CANDIDATE='3f9d7a03ca9a96daa7d2541fc678e95af24489d3'

    def test_composition_preserves_exact_trusted_dispatch_and_caller(self):
        source=(ROOT/runner.R3_WORKFLOW).read_text()
        trusted=subprocess.check_output(['git','show',self.TRUSTED+':'+runner.R3_WORKFLOW],cwd=ROOT).decode()
        previous=subprocess.check_output(['git','show',self.CANDIDATE+':'+runner.R3_WORKFLOW],cwd=ROOT).decode()
        dispatch='  workflow_dispatch:\n'+trusted.split('  workflow_dispatch:\n',1)[1].split('  pull_request_review:',1)[0]
        caller='  aud031-probe-caller:\n'+trusted.split('  aud031-probe-caller:\n',1)[1]
        expected=previous.replace('  pull_request_review:',dispatch+'  pull_request_review:',1).rstrip()+'\n'+caller
        import re
        # The probe's assertions/classifier may be corrected without changing
        # native jobs, event declarations or the installed caller's authority.
        def without_probe(text):return re.sub(r'(?ms)^  aud031-reservation-probe:.*?(?=^  aud031-probe-caller:|\Z)','',text)
        native_declaration='''      native_reservation:
        type: boolean
        default: false
    outputs:
      native_receipt:
        description: Unauthenticated receipt data; consumer must verify immutable writer provenance
        value: ${{ jobs.aud031-reservation-probe.outputs.native_receipt }}
'''
        self.assertEqual(source.count(native_declaration),1)
        projected=source.replace(native_declaration,'',1).replace('    secrets:\n      CLEANOPS_NATIVE_AUTH_PRIVATE_KEY:\n        required: false','    secrets:\n      CLEANOPS_NATIVE_AUTH_PRIVATE_KEY:\n        required: true',1)
        self.assertEqual(projected.count('      CLEANOPS_AUD031_NATIVE_PRIVATE_KEY:\n        required: false\n'),1)
        projected=projected.replace('      CLEANOPS_AUD031_NATIVE_PRIVATE_KEY:\n        required: false\n','',1)
        projected=projected.split('  aud031-native-reservation:',1)[0]
        # Sole AUD031 CLI moved into its prepared reader job. Preserve the
        # complete legacy workflow after removing only that old disabled step.
        start=expected.index('      - name: AUD031 canonical entrypoint')
        end=expected.index('      - name: Preserve sanitized evidence',start)
        expected=expected[:start]+expected[end:]
        self.assertEqual(without_probe(projected),without_probe(expected))
        prefix=lambda text:text.split('  aud031-reservation-probe:',1)[1].split("python -I - <<'PY'",1)[0]
        old_prefix=prefix(previous);new_prefix=prefix(source)
        old_condition=next(line for line in old_prefix.splitlines() if line.startswith('    if:'))
        new_condition=next(line for line in new_prefix.splitlines() if line.startswith('    if:'))
        self.assertIn('|| (inputs.native_reservation == true',new_condition)
        self.assertIn(old_condition[8:],new_condition)
        new_prefix=new_prefix.replace('    # Native writer profile requires its protected environment and exact owner review.\n','',1).replace(new_condition,old_condition,1)
        new_prefix=new_prefix.replace("    environment: ${{ inputs.native_reservation && 'cleanops-native-auth-validation' || 'cleanops-native-auth-probe' }}\n    outputs:\n      native_receipt: ${{ steps.app.outputs.native_receipt }}",'    environment: cleanops-native-auth-probe',1)
        new_prefix=new_prefix.replace('          NATIVE_PROFILE: ${{ inputs.native_reservation }}\n','',1)
        self.assertEqual(new_prefix,old_prefix)
        self.assertEqual(source.count('  workflow_dispatch:'),1)
        self.assertEqual(source.count('  workflow_call:'),1)
        self.assertEqual(source.count('  aud031-probe-caller:'),1)
        self.assertIn('uses: novo34/cleanops-360/'+runner.R3_WORKFLOW+'@9a4c8b90a159f2853f040dc5597042c17408da00',caller)

    def test_manual_dispatch_cannot_start_native_validation_even_with_probe_inputs(self):
        import re
        source=(ROOT/runner.R3_WORKFLOW).read_text()
        native=source.split('  acceptance-r2:',1)[1].split('  aud031-reservation-probe:',1)[0]
        condition=' '.join(re.search(r'    if: >-\n((?:      .*\n)+)',native).group(1).split())
        for event in ('workflow_dispatch','push','pull_request','issue_comment','workflow_call'):
            for ref in ('refs/heads/main','refs/pull/23/merge','refs/tags/cleanops-native-auth-probe-caller-fixed1'):
                for enabled in (False,True):
                    context={'inputs':{'confirm_reservation_probe':enabled,'reservation_probe':enabled},'github':{
                        'event_name':event,'ref':ref,'workflow_ref':'novo34/cleanops-360/'+runner.R3_WORKFLOW+'@'+ref,
                        'repository':'novo34/cleanops-360','repository_id':'1412999204','repository_owner':'novo34',
                        'actor':'novo34','actor_id':'17856013','triggering_actor':'novo34','run_attempt':1,'event':{}}}
                    with self.subTest(event=event,ref=ref,enabled=enabled):
                        self.assertFalse(ActionsCondition(condition,context).evaluate())
        self.assertTrue(runner.AUD031_NATIVE_ENABLED)

    def test_trusted_caller_still_requires_approved_tag_and_SHA(self):
        import re
        source=(ROOT/runner.R3_WORKFLOW).read_text().split('  aud031-probe-caller:',1)[1]
        condition=' '.join(re.search(r'    if: >-\n((?:      .*\n)+)',source).group(1).split())
        ref='refs/tags/cleanops-native-auth-probe-caller-fixed1'
        github={'event_name':'workflow_dispatch','repository':'novo34/cleanops-360','repository_id':'1412999204',
                'actor':'novo34','actor_id':'17856013','triggering_actor':'novo34','run_attempt':1,'ref':ref,
                'workflow_ref':'novo34/cleanops-360/'+runner.R3_WORKFLOW+'@'+ref,'sha':self.TRUSTED,'workflow_sha':self.TRUSTED}
        context={'github':github,'inputs':{'confirm_reservation_probe':True},'vars':{'CLEANOPS_NATIVE_AUTH_APPROVED_CALLER_SHA':self.TRUSTED}}
        self.assertTrue(ActionsCondition(condition,context).evaluate())
        for key in github:
            with self.subTest(key=key):
                self.assertFalse(ActionsCondition(condition,dict(context,github=dict(github,**{key:'unapproved'}))).evaluate())
        for value in ('',self.CANDIDATE):
            self.assertFalse(ActionsCondition(condition,dict(context,vars={'CLEANOPS_NATIVE_AUTH_APPROVED_CALLER_SHA':value})).evaluate())
        self.assertFalse(ActionsCondition(condition,dict(context,inputs={'confirm_reservation_probe':False})).evaluate())


if __name__=='__main__':unittest.main()
