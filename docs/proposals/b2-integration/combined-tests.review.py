"""REVIEW ONLY: composition and new fixtures require separate owner approval.

No installer, connection, entry point or import-time execution. Original R2
fixtures and their expectations stay byte-for-byte unchanged. Run access before
users: users intentionally revokes the shared sessions and self-disables last.
"""
import hashlib
import importlib.util
import json
import uuid


def run(b):
    def original(name,path):
        spec=importlib.util.spec_from_file_location(name,b.ROOT/path)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.run(b)

    original('combined_original_access_r2','docs/proposals/b2-access/access-tests.r2.review.py')
    service=b.ROLE['identity']
    q=lambda value:"'"+str(value).replace("'","''")+"'"
    digest=lambda value:"decode('"+hashlib.sha256(value.encode()).hexdigest()+"','hex')"
    role,document,individual,active_role=[str(uuid.uuid4()) for _ in range(4)]
    start="clock_timestamp()-interval '1m'"
    b.check('B2-combined-active-permissions-and-cross-block-reader-fixture',f"""
      INSERT INTO app.access_resources VALUES('{b.A}','{document}','documents',NULL);
      INSERT INTO app.access_roles VALUES('{b.A}','{role}','Combined delegated reader',NULL),('{b.A}','{active_role}','Combined retained membership',NULL);
      INSERT INTO app.access_rules VALUES
       ('{b.A}','{uuid.uuid4()}','{role}',NULL,'view','documents','{document}','ALLOW',{start},NULL,NULL),
       ('{b.A}','{uuid.uuid4()}','{active_role}',NULL,'view','documents','{document}','ALLOW',{start},NULL,NULL),
       ('{b.A}','{uuid.uuid4()}',NULL,'{b.U}','view','documents','{document}','ALLOW',{start},NULL,NULL),
       ('{b.A}','{uuid.uuid4()}',NULL,'{b.V}','view','access','{b.U}','ALLOW',{start},NULL,NULL),
       ('{b.A}','{uuid.uuid4()}',NULL,'{b.V}','manage_permissions','access','{b.U}','ALLOW',{start},NULL,NULL);
      INSERT INTO app.access_role_memberships VALUES('{b.A}','{active_role}','{b.U}',{start},NULL,NULL);
    """)

    def read(statement,token='a'):
        return 'BEGIN;SELECT auth_api.begin_verified_context(repeat('+q(token)+',43));'+statement+'COMMIT;'

    def mutate(tag,body):
        version=b.sql(f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';").stdout.strip()
        subject={'subject_id':b.V} if body['operation']=='REVOKE' else {'target_user_id':b.V}
        payload=json.dumps({**body,**subject,'expected_policy':version,'reason':'B2 combined '+tag})
        key,request=digest('b2-combined-'+tag),digest(payload)
        correlation=str(uuid.uuid4())
        b.check('B2-combined-fresh-stepup-'+tag,f"INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{b.U}','{b.S}','B1-SELF-06',clock_timestamp(),clock_timestamp()+interval '5m',(SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}'));")
        statement=f"SELECT auth_api.reserve_owned(NULL,'changeAccess',{key},{request},true)->>'replay';SELECT auth_api.change_access_owned({q(payload)}::jsonb,{key},{request},'{correlation}')->>'changed';SELECT auth_api.complete_owned(NULL,'changeAccess',{key},{request},NULL);"
        b.check('B2-combined-owned-'+tag,read(statement),'false\ntrue\nt',service)
        b.check('B2-combined-audit-'+tag,f"SELECT count(*)=1 AND bool_and(actor_user_id='{b.U}' AND outcome='SUCCESS' AND safe_metadata->>'reason'={q('B2 combined '+tag)} AND safe_metadata ? 'before' AND safe_metadata ? 'after') FROM app.audit_logs WHERE tenant_id='{b.A}' AND correlation_id='{correlation}' AND action='auth.access.change.detail';",'t')

    def target_check(tag,wanted):
        b.check('B2-combined-'+tag,read(f"SELECT auth_api.user_effective_access('{b.V}','view','documents','{document}');"),wanted,service)

    mutate('assign-role',{'operation':'MEMBERSHIP','role_id':role,'start_at':'2026-01-01T00:00:00Z','expires_at':None})
    target_check('role-access-before-revoke','t')
    mutate('revoke-role-membership',{'operation':'REVOKE','assignment_kind':'MEMBERSHIP','target_id':role})
    target_check('role-access-revoked-in-existing-session','f')
    mutate('individual-allow',{'operation':'USER_RULE','rule_id':individual,'action':'view','resource_kind':'documents','resource_id':document,'effect':'ALLOW','start_at':'2026-01-01T00:00:00Z','expires_at':None})
    target_check('individual-allow-effective','t')
    mutate('revoke-individual',{'operation':'REVOKE','assignment_kind':'RULE','target_id':individual})
    target_check('individual-revoked-in-existing-session','f')

    # Cross-slice assertions run at the existing R2 transaction boundaries.
    # No expectation or line of either approved R2 fixture is replaced.
    original_check=b.check
    rollback_before=None
    def snapshot():
        return b.sql(f"SELECT jsonb_build_array(identity_private.user_profile_version(u),(SELECT count(*) FROM app.audit_logs WHERE tenant_id='{b.A}' AND action IN('users.profile.change','users.state.change','users.change.denied')))::text FROM app.users u WHERE tenant_id='{b.A}' AND id='{b.U}';").stdout.strip()
    def cross_check(name,text,expected=None,role='postgres',failure=None):
        nonlocal rollback_before
        if name=='B2-user-rollback-restores-profile-and-audit':rollback_before=snapshot()
        passed=original_check(name,text,expected,role,failure)
        if name=='B2-user-rollback-restores-profile-and-audit' and passed:
            b.record('B2-combined-rollback-version-and-audit-unchanged','PASS' if rollback_before and snapshot()==rollback_before else 'FAIL')
        if name in ('B2-user-disable-membership','B2-user-reenable-requires-fresh-login') and passed:
            disabled=name=='B2-user-disable-membership'
            original_check('B2-combined-subject-authority-'+('disabled' if disabled else 'reactivated'),read(f"SELECT auth_api.user_effective_access('{b.U}','view','documents','{document}');",'c'),'f' if disabled else 't',service)
            original_check('B2-combined-roles-and-grants-retained-'+str(disabled),f"SELECT EXISTS(SELECT 1 FROM app.access_role_memberships WHERE tenant_id='{b.A}' AND role_id='{active_role}' AND user_id='{b.U}' AND revoked_at IS NULL) AND EXISTS(SELECT 1 FROM app.access_rules WHERE tenant_id='{b.A}' AND user_id='{b.U}' AND resource_id='{document}' AND effect='ALLOW' AND revoked_at IS NULL);",'t')
            original_check('B2-combined-revoked-session-stays-denied-'+str(disabled),read('SELECT auth_api.effective_access(\'view\',\'documents\','+q(document)+');'),role=service,failure='42501')
            original_check('B2-combined-foreign-subject-stays-invisible-'+str(disabled),read(f"SELECT auth_api.user_effective_access('{b.W}','view','documents','{document}');",'c'),role=service,failure='P0002')
        return passed
    b.check=cross_check
    try:
        original('combined_original_users_r2','docs/proposals/b2-users/user-change-tests.r2.review.py')
    finally:
        b.check=original_check
    for scope in ('access','userChange'):
        b.record('B2-combined-required-browser-'+scope,'PASS' if b.REPORT.get(scope+'BrowserExecuted') else 'FAIL')
    b.REPORT['composition']='SQL14+SQL1+SQL2+SQL3 in one unchanged cluster; no reset between R2 suites'
