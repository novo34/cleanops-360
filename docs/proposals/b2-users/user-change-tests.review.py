"""REVIEW ONLY: exact owner approval is required before running these new fixtures.

Uses existing B1 synthetic identities/memberships and ordinary identity-role calls.
No entry point, installer, database connection or import-time execution.
"""
import json
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor


def run(b):
    operator, target = b.V, b.U
    service = b.ROLE['identity']
    q = lambda value: "'"+str(value).replace("'","''")+"'"

    def version(subject=target):
        return b.sql(f"SELECT identity_private.user_profile_version(u) FROM app.users u WHERE tenant_id='{b.A}' AND id='{subject}';").stdout.strip()

    def update(tag, operation='EDIT', subject=target, fields=None, expected=None, success=False, token='c', ending='COMMIT;', reserve=True):
        payload = json.dumps({'operation':operation,'target_user_id':subject,'expected_version':expected or version(subject),'reason':'B2 synthetic user change',**(fields or {'display_name':'B2 renamed membership'})})
        key = f"crypto.digest({q(tag)},'sha256')"
        request = f"crypto.digest({q(payload)},'sha256')"
        reserve_sql = f"SELECT auth_api.reserve_owned(NULL,'changeAdministrationUser',{key},{request},true)->>'replay';" if reserve else ''
        finish = f"SELECT auth_api.complete_owned(NULL,'changeAdministrationUser',{key},{request},NULL);" if success else f"SELECT auth_api.discard_owned(NULL,'changeAdministrationUser',{key},{request});"
        return "BEGIN;SELECT auth_api.begin_verified_context(repeat("+q(token)+",43));"+reserve_sql+f"SELECT auth_api.change_user_owned({q(payload)}::jsonb,{key},{request},'{uuid.uuid4()}')->>'changed';"+(finish if reserve else '')+ending

    def grant(subject, action, resource):
        return f"INSERT INTO app.access_rules VALUES('{b.A}','{uuid.uuid4()}',NULL,'{subject}',{q(action)},'users',"+(q(resource) if resource else 'NULL')+",'ALLOW',clock_timestamp()-interval '1m',NULL,NULL);"

    def stepup(user, session):
        return f"INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{user}','{session}','B1-SELF-06',clock_timestamp(),clock_timestamp()+interval '5m',(SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}'));"

    b.check('B2-user-existing-memberships-and-view-fixture',f"INSERT INTO app.access_resources VALUES('{b.A}','{target}','users',NULL),('{b.A}','{operator}','users',NULL),('{b.B}','{b.W}','users',NULL) ON CONFLICT DO NOTHING;"+grant(operator,'view',None))
    b.check('B2-user-identity-no-direct-state-update',f"UPDATE app.users SET state='DISABLED' WHERE tenant_id='{b.A}' AND id='{target}';",role=service,failure='42501')
    b.check('B2-user-owned-reservation-required',update('unowned',reserve=False),role=service,failure='P0001')
    b.check('B2-user-no-edit-grant-denied',update('without-edit'),'false\nfalse\nt',service)
    b.check('B2-user-synthetic-scoped-edit-power',grant(operator,'edit',target)+grant(operator,'edit',operator))
    b.check('B2-user-fresh-MFA-required',update('without-stepup'),'false\nfalse\nt',service)
    b.check('B2-user-existing-B1-stepup-fixture',stepup(operator,b.X))
    b.check('B2-user-stale-profile-CAS-denied',update('stale',expected='0'*64),'false\nfalse\nt',service)
    original = version()
    b.check('B2-user-profile-edited-through-owned-function',update('rename',success=True),'false\ntrue\nt',service)
    b.check('B2-user-profile-version-advanced',f"SELECT display_name='B2 renamed membership' AND identity_private.user_profile_version(u)<>{q(original)} FROM app.users u WHERE tenant_id='{b.A}' AND id='{target}';",'t')
    b.check('B2-user-profile-audit-private-server-actor',f"SELECT EXISTS(SELECT 1 FROM app.audit_logs WHERE tenant_id='{b.A}' AND actor_user_id='{operator}' AND resource_id='{target}' AND action='users.profile.change' AND outcome='SUCCESS' AND safe_metadata->'before'->>'display_name'='Synthetic A1' AND safe_metadata->'after'->>'display_name'='B2 renamed membership' AND safe_metadata->>'reason'='B2 synthetic user change' AND safe_metadata->>'before_version'<>safe_metadata->>'after_version' AND NOT(safe_metadata->'after' ? 'principal_id'));",'t')
    b.check('B2-user-denials-have-durable-redacted-audit',f"SELECT count(*)>=3 AND bool_and(resource_id IS NULL AND safe_metadata->'before'='null'::jsonb AND safe_metadata->'after'='null'::jsonb) FROM app.audit_logs WHERE tenant_id='{b.A}' AND action='users.change.denied' AND actor_user_id='{operator}';",'t')
    b.check('B2-user-foreign-tenant-invisible',update('foreign',subject=b.W,expected='0'*64),'false\nfalse\nt',service)
    b.check('B2-user-rollback-restores-profile-and-audit',update('rollback',fields={'display_name':'Must not persist'},success=True,ending='ROLLBACK;'),'false\ntrue\nt',service)
    b.check('B2-user-rollback-profile-confirmed',f"SELECT display_name='B2 renamed membership' FROM app.users WHERE tenant_id='{b.A}' AND id='{target}';",'t')
    # Real independent connections with the same version. The ordinary target
    # principal takes the same B1 locks as the administrative writer.
    b.check('B2-user-synthetic-self-edit-for-real-concurrency',grant(target,'view',target)+grant(target,'edit',target)+stepup(target,b.S))
    expected = version()
    barrier = threading.Barrier(2)
    def compete(index):
        statement=update('race-'+str(index),fields={'display_name':'B2 concurrent '+str(index)},expected=expected,success=True,token='c' if index==0 else 'a',ending='SELECT pg_sleep(0.3);COMMIT;')
        barrier.wait(timeout=5)
        return b.sql(statement,service)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(compete,index) for index in range(2)]
        results=[future.result(timeout=15) for future in futures]
    winners=sum(result.returncode==0 and result.stdout.strip().splitlines()[:2]==['false','true'] for result in results)
    valid_losers=all(result.returncode==0 or b.state(result)=='55P03' for result in results)
    b.record('B2-user-real-concurrent-CAS-one-winner','PASS' if winners==1 and valid_losers else 'FAIL')
    b.check('B2-user-concurrent-write-not-lost',f"SELECT display_name IN('B2 concurrent 0','B2 concurrent 1') FROM app.users WHERE tenant_id='{b.A}' AND id='{target}';",'t')
    # Lifecycle fixtures are synthetic and never leave this owned cluster.
    devices=[]
    preauth=[]
    challenges=[]
    for tenant,user,principal,session,letter in [(b.A,target,b.P,b.S,'p'),(b.B,b.W,b.P,b.Y,'q')]:
        device,pre,method,challenge=[str(uuid.uuid4()) for _ in range(4)]
        devices.append(device);preauth.append(pre);challenges.append(challenge)
        fixture=f"INSERT INTO app.auth_preferences VALUES('{tenant}',true) ON CONFLICT(tenant_id) DO UPDATE SET trusted_devices_enabled=true;"
        fixture+=f"INSERT INTO app.trusted_devices VALUES('{tenant}','{device}','{user}','{principal}',crypto.digest(repeat({q(letter)},43),'sha256'),1,clock_timestamp(),clock_timestamp()+interval '1d',NULL);"
        fixture+=f"INSERT INTO identity_private.preauth(id,principal_id,tenant_id,user_id,cookie_digest,csrf_digest,state,password_verified_at,credential_version,created_at,expires_at) VALUES('{pre}','{principal}','{tenant}','{user}',crypto.digest(repeat({q(letter.upper())},43),'sha256'),crypto.digest(repeat('e',43),'sha256'),'PENDING_MFA',clock_timestamp(),1,clock_timestamp(),clock_timestamp()+interval '5m');"
        fixture+=f"INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,method_version,algorithm) VALUES('{tenant}','{method}','{user}','TOTP','ACTIVE',decode(repeat('ab',64),'hex'),'b2-synthetic-no-factor',clock_timestamp(),1,'SHA256');"
        fixture+=f"INSERT INTO app.mfa_challenges(tenant_id,id,user_id,session_id,method_id,kind,purpose,state,issued_at,expires_at,method_version,grant_key) VALUES('{tenant}','{challenge}','{user}','{session}','{method}','TOTP','STEP_UP','ISSUED',clock_timestamp(),clock_timestamp()+interval '5m',1,'B1-SELF-06');"
        b.check('B2-user-synthetic-tenant-lifecycle-'+letter,fixture)
    before_cycle=version()
    b.check('B2-user-disable-membership',update('disable','STATE',fields={'state':'DISABLED'},success=True),'false\ntrue\nt',service)
    b.check('B2-user-own-tenant-sessions-revoked',f"SELECT count(*)=2 AND bool_and(state='REVOKED' AND revoked_at IS NOT NULL) FROM app.sessions WHERE tenant_id='{b.A}' AND user_id='{target}';",'t')
    b.check('B2-user-own-tenant-trust-preauth-challenge-revoked',f"SELECT (SELECT revoked_at IS NOT NULL FROM app.trusted_devices WHERE tenant_id='{b.A}' AND id='{devices[0]}') AND (SELECT state='REVOKED' FROM identity_private.preauth WHERE id='{preauth[0]}') AND (SELECT state='REVOKED' FROM app.mfa_challenges WHERE tenant_id='{b.A}' AND id='{challenges[0]}');",'t')
    b.check('B2-user-other-membership-and-lifecycle-untouched',f"SELECT (SELECT state='ACTIVE' FROM app.users WHERE tenant_id='{b.B}' AND id='{b.W}') AND (SELECT state='ACTIVE' FROM app.sessions WHERE tenant_id='{b.B}' AND id='{b.Y}') AND (SELECT revoked_at IS NULL FROM app.trusted_devices WHERE tenant_id='{b.B}' AND id='{devices[1]}') AND (SELECT state='PENDING_MFA' FROM identity_private.preauth WHERE id='{preauth[1]}') AND (SELECT state='ISSUED' FROM app.mfa_challenges WHERE tenant_id='{b.B}' AND id='{challenges[1]}');",'t')
    b.check('B2-user-reenable-requires-fresh-login',update('enable','STATE',fields={'state':'ACTIVE'},success=True),'false\ntrue\nt',service)
    b.check('B2-user-ABA-state-cycle-has-new-version',f"SELECT state='ACTIVE' AND identity_private.user_profile_version(u)<>{q(before_cycle)} FROM app.users u WHERE tenant_id='{b.A}' AND id='{target}';",'t')
    b.check('B2-user-old-session-not-resurrected',"BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));COMMIT;",role=service,failure='42501')
    b.check('B2-user-other-tenant-session-still-valid',f"BEGIN;SELECT auth_api.begin_verified_context(repeat('d',43));SELECT id='{b.W}' FROM auth_api.current_identity();COMMIT;",'t',service)
    target_name=b.sql(f"SELECT display_name FROM app.users WHERE tenant_id='{b.A}' AND id='{target}';").stdout.strip()
    b.REPORT['userChangeBrowserFixture']={'target':target,'operator':operator,'targetName':target_name,'otherTenant':b.B}
    b.check('B2-user-positive-ui-stepup',stepup(operator,b.X))
    if b.REPORT.get('userChangeBrowserExecuted'):
        b.check('B2-user-UI-profile-and-state-audits-durable',f"SELECT count(*)=3 AND bool_and(actor_user_id='{operator}' AND outcome='SUCCESS' AND safe_metadata ? 'before' AND safe_metadata ? 'after') FROM app.audit_logs WHERE tenant_id='{b.A}' AND safe_metadata->>'reason' IN('B2 browser profile edit','B2 browser membership disable','B2 browser membership enable');",'t')
    else:
        b.record('B2-user-UI-audit-check','SKIP','Functional browser has not executed; not UI acceptance.')
    b.check('B2-user-self-disable-can-complete-owned-result',update('self-disable','STATE',subject=operator,fields={'state':'DISABLED'},success=True),'false\ntrue\nt',service)
    b.check('B2-user-self-disabled-session-denied',"BEGIN;SELECT auth_api.begin_verified_context(repeat('c',43));COMMIT;",role=service,failure='42501')
    b.check('B2-user-one-time-completions-store-no-response',"SELECT count(*)>0 AND bool_and(one_time_result AND response_safe IS NULL) FROM app.idempotency_records WHERE operation='changeAdministrationUser' AND state='COMPLETED';",'t')
