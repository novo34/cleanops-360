"""REVIEW ONLY: SQL5 fixtures. Never imported by existing CI or executed before approval.

Runs on the existing SQL14+SQL1+SQL2+SQL3 isolated harness. SQL4 is installed as
a dependency only; its historical 260-check suite is NOT repeated.
"""
import base64
import hashlib
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier


def run(b):
    service=b.ROLE['identity']
    q=lambda v:"'"+str(v).replace("'","''")+"'"
    for package in ('004-invitation-administration.review.sql','005-invitation-acceptance.r3.review.sql'):
        if not b.check('SQL5-install-'+package,(b.ROOT/'docs/proposals/b2-invitations'/package).read_text()):
            raise RuntimeError('SQL5_DEPENDENCY_INSTALLATION_FAILED')
    b.check('SQL5-explicit-synthetic-tenant-policy',f"INSERT INTO identity_private.invitation_policy(tenant_id,link_seconds,default_risk_class,operational_mfa_required) VALUES('{b.A}',86400,'SENSITIVE',true),('{b.B}',86400,'SENSITIVE',true);")
    b.check('SQL5-no-direct-identity-access','SELECT * FROM identity_private.invitation_acceptances;',role=service,failure='42501')
    b.check('SQL5-R3-attempt-ledger-private','SELECT * FROM identity_private.invitation_acceptance_attempts;',role=service,failure='42501')
    b.check('SQL5-R2-B1-security-log-remains-append-only',"SELECT NOT has_table_privilege('cleanops_auth_broker','identity_private.security_log','SELECT') AND has_table_privilege('cleanops_auth_broker','identity_private.security_log','INSERT');",'t')
    b.check('SQL5-no-runtime-call',f"SELECT auth_api.consume_invitation_acceptance(repeat('a',43),repeat('b',43),'{uuid.uuid4()}');",role=b.ROLE['runtime'],failure='42501')
    raw=bytes(range(32));secret=base64.urlsafe_b64encode(raw).decode().rstrip('=')
    invite=str(uuid.uuid4());email='sql5-new@fixture.invalid'
    context=['CLEANOPS_INVITATION_LINK_V1',b.A,invite,'1',email]
    verifier=hashlib.sha256(json.dumps(context,separators=(',',':')).encode()+raw).hexdigest()
    b.check('SQL5-synthetic-issued-link',f"INSERT INTO identity_private.user_invitations(tenant_id,id,email_normalized,display_name,reason,generation,state,verifier,issued_at,expires_at,created_by) VALUES('{b.A}','{invite}',{q(email)},'Synthetic acceptance','SQL5 isolated test',1,'ISSUED',decode('{verifier}','hex'),clock_timestamp(),clock_timestamp()+interval '24h','{b.U}');")
    args=f"'{invite}',{q(secret)},decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),'{uuid.uuid4()}'"
    b.check('SQL5-link-is-private-no-membership-before-MFA',f"BEGIN;SELECT (auth_api.invitation_link_material({args})->>'mfa_required')::boolean;ROLLBACK;",'t',service)
    b.check('SQL5-no-user-or-session-created',f"SELECT NOT EXISTS(SELECT 1 FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(email)}) AND NOT EXISTS(SELECT 1 FROM identity_private.invitation_acceptances WHERE invitation_id='{invite}');",'t')
    b.check('SQL5-unknown-capability-denied',f"SELECT NOT auth_api.consume_invitation_acceptance(repeat('a',43),repeat('b',43),'{uuid.uuid4()}');",'t',service)
    b.check('SQL5-invalid-link-is-generic',f"SELECT auth_api.invitation_link_material('{invite}',repeat('a',43),decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),'{uuid.uuid4()}') IS NULL;",'t',service)
    cap=base64.urlsafe_b64encode(bytes(range(32,64))).decode().rstrip('=')
    csrf=base64.urlsafe_b64encode(bytes(range(64,96))).decode().rstrip('=')
    def cap_digest(value,kind):
        return "decode('"+hashlib.sha256(json.dumps(['CLEANOPS_INVITATION_ACCEPTANCE_V1',kind,value],separators=(',',':')).encode()).hexdigest()+"','hex')"
    method=json.dumps({'id':str(uuid.uuid4()),'ciphertext':'bb'*64,'key_version':'sql5-synthetic-not-delivered','algorithm':'SHA256'})
    # Native fixture validates the privileged SQL boundary. Ciphertext and password
    # here are synthetic, not a claim of real cryptographic/browser validation.
    prepare=f"BEGIN;WITH d AS MATERIALIZED(SELECT auth_api.invitation_link_material({args}) v) SELECT auth_api.prepare_invitation_acceptance((v-'tenant_id'-'recipient'-'password_hash'-'risk_class'-'mfa_required')||jsonb_build_object('expected_hash',NULL,'replacement_hash','$argon2id$fixture-not-a-real-password','method',{q(method)}::jsonb),{cap_digest(cap,'CAPABILITY')},{cap_digest(csrf,'CSRF')},'{uuid.uuid4()}') FROM d;COMMIT;"
    b.check('SQL5-prepare-pending-MFA',prepare,'t',service)
    # PostgreSQL-safe hex validation: exact boundaries and malformed encodings.
    # These are supplementary checks; native prepare exercises the full function above.
    for n,ok in ((56,False),(58,True),(1024,True),(1026,False),(59,False)):
        h='ab'*(n//2)+('a' if n%2 else '')
        b.check('SQL5-R3-hex-length-'+str(n),f"SELECT (length('{h}') BETWEEN 58 AND 1024 AND length('{h}') % 2 = 0 AND '{h}' ~ '^[a-f0-9]+f"BEGIN;UPDATE identity_private.invitation_acceptances SET created_at=clock_timestamp()-interval '10m',expires_at=clock_timestamp()-interval '1s' WHERE invitation_id='{invite}';SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');ROLLBACK;",'t')
    b.check('SQL5-before-MFA-no-activation',f"SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');",'t',service)
    b.check('SQL5-wrong-CSRF-denied',f"SELECT auth_api.invitation_factor_material({q(cap)},repeat('a',43),'{uuid.uuid4()}') IS NULL;",'t',service)
    factor=f"WITH m AS MATERIALIZED(SELECT auth_api.invitation_factor_material({q(cap)},{q(csrf)},'{uuid.uuid4()}') v) SELECT auth_api.invitation_factor_cas({q(cap)},{q(csrf)},(v->>'generation')::bigint,(v->>'policy_version')::bigint,NULL,floor(extract(epoch FROM clock_timestamp())/30)::bigint,'{uuid.uuid4()}') FROM m;"
    b.check('SQL5-native-factor-CAS',factor,'t',service)
    b.check('SQL5-rollback-activation',f"BEGIN;SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');ROLLBACK;",'t',service)
    b.check('SQL5-rollback-has-no-member',f"SELECT NOT EXISTS(SELECT 1 FROM identity_private.principals WHERE email_normalized={q(email)});",'t')
    # Two distinct Docker exec / psql connections race to consume the SAME READY capability.
    # They start together; this is not sequential replay or a mocked concurrency test.
    simultaneous=Barrier(2,timeout=15)
    def compete(_):
        simultaneous.wait(timeout=15)
        return b.sql(f"SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');",service)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(compete,(0,1)))
        outcomes=[r.stdout.strip() for r in results]
        ok=all(r.returncode==0 and value in ('t','f') for r,value in zip(results,outcomes)) and outcomes.count('t')>=1
    except Exception:
        ok=False
    b.record('SQL5-R3-parallel-two-independent-connections', 'PASS' if ok else 'FAIL')
    b.check('SQL5-R3-parallel-unique-activation-and-audit',f"SELECT (SELECT count(*) FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(email)})=1 AND (SELECT count(*) FROM app.audit_logs WHERE resource_id='{invite}' AND action='users.invitation.accept')=1;",'t')

    b.check('SQL5-consumed-idempotent-no-recreation',f"SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');",'t',service)
    b.check('SQL5-active-only-in-invited-tenant',f"SELECT count(*)=1 AND bool_and(u.tenant_id='{b.A}' AND u.state='ACTIVE') FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(email)};",'t')
    b.check('SQL5-activation-audited-once',f"SELECT count(*)=1 FROM app.audit_logs WHERE resource_id='{invite}' AND action='users.invitation.accept';",'t')
    b.check('SQL5-revocation-fixture',f"UPDATE identity_private.user_invitations SET state='REVOKED',verifier=NULL,revoked_at=clock_timestamp() WHERE id='{invite}';")
    b.check('SQL5-revoked-link-denied',f"SELECT auth_api.invitation_link_material({args}) IS NULL;",'t',service)
    existing=str(uuid.uuid4())
    existing_verifier=hashlib.sha256(json.dumps(['CLEANOPS_INVITATION_LINK_V1',b.B,existing,'1','u2@fixture.invalid'],separators=(',',':')).encode()+raw).hexdigest()
    b.check('SQL5-existing-identity-synthetic-invite-other-tenant',f"INSERT INTO identity_private.user_invitations(tenant_id,id,email_normalized,display_name,reason,generation,state,verifier,issued_at,expires_at,created_by) VALUES('{b.B}','{existing}','u2@fixture.invalid','Synthetic existing recipient','Existing MFA proof required',1,'ISSUED',decode('{existing_verifier}','hex'),clock_timestamp(),clock_timestamp()+interval '24h','{b.W}');")
    b.check('SQL5-existing-identity-fails-closed-without-prior-factor-proof',f"SELECT auth_api.invitation_link_material('{existing}',{q(secret)},decode(repeat('43',32),'hex'),decode(repeat('44',32),'hex'),'{uuid.uuid4()}') IS NULL;",'t',service)
    b.check('SQL5-existing-credential-and-memberships-untouched',f"SELECT (SELECT argon2id_hash='$argon2id$fixture-not-a-real-password' AND credential_version=1 FROM identity_private.credentials WHERE principal_id='{b.Q}') AND NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id='{b.B}' AND principal_id='{b.Q}');",'t')
    failed=str(uuid.uuid4());recipient='sql5-failure-budget@fixture.invalid'
    failure_verifier=hashlib.sha256(json.dumps(['CLEANOPS_INVITATION_LINK_V1',b.A,failed,'1',recipient],separators=(',',':')).encode()+raw).hexdigest()
    b.check('SQL5-R2-synthetic-failure-budget-invite',f"INSERT INTO identity_private.user_invitations(tenant_id,id,email_normalized,display_name,reason,generation,state,verifier,issued_at,expires_at,created_by) VALUES('{b.A}','{failed}',{q(recipient)},'Synthetic failure budget','Five attempts in fifteen minutes',1,'ISSUED',decode('{failure_verifier}','hex'),clock_timestamp(),clock_timestamp()+interval '24h','{b.U}');")
    failure_args=f"'{failed}',{q(secret)},decode(repeat('45',32),'hex'),decode(repeat('46',32),'hex'),'{uuid.uuid4()}'"
    for attempt in range(5):
        b.check('SQL5-R2-record-credential-failure-'+str(attempt+1),f"BEGIN;SELECT auth_api.invitation_link_material({failure_args}) IS NOT NULL;SELECT auth_api.invitation_credential_denied('{failed}','{uuid.uuid4()}');COMMIT;",'t',service)
    b.check('SQL5-R2-sixth-credential-attempt-blocked',f"SELECT auth_api.invitation_link_material({failure_args}) IS NULL;",'t',service)
    b.check('SQL5-helpers-not-public',"SELECT NOT has_function_privilege('cleanops_identity_service',(SELECT oid FROM pg_proc WHERE proname='valid_invitation_cap'),'EXECUTE');",'t')
) IS {'TRUE' if ok else 'FALSE'};",'t')
    b.check('SQL5-R3-hex-nonhex-denied',"SELECT NOT ('gg' || repeat('ab',29) ~ '^[a-f0-9]+f"BEGIN;UPDATE identity_private.invitation_acceptances SET created_at=clock_timestamp()-interval '10m',expires_at=clock_timestamp()-interval '1s' WHERE invitation_id='{invite}';SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');ROLLBACK;",'t')
    b.check('SQL5-before-MFA-no-activation',f"SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');",'t',service)
    b.check('SQL5-wrong-CSRF-denied',f"SELECT auth_api.invitation_factor_material({q(cap)},repeat('a',43),'{uuid.uuid4()}') IS NULL;",'t',service)
    factor=f"WITH m AS MATERIALIZED(SELECT auth_api.invitation_factor_material({q(cap)},{q(csrf)},'{uuid.uuid4()}') v) SELECT auth_api.invitation_factor_cas({q(cap)},{q(csrf)},(v->>'generation')::bigint,(v->>'policy_version')::bigint,NULL,floor(extract(epoch FROM clock_timestamp())/30)::bigint,'{uuid.uuid4()}') FROM m;"
    b.check('SQL5-native-factor-CAS',factor,'t',service)
    b.check('SQL5-rollback-activation',f"BEGIN;SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');ROLLBACK;",'t',service)
    b.check('SQL5-rollback-has-no-member',f"SELECT NOT EXISTS(SELECT 1 FROM identity_private.principals WHERE email_normalized={q(email)});",'t')
    b.check('SQL5-atomic-activation',f"SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');",'t',service)
    b.check('SQL5-consumed-idempotent-no-recreation',f"SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},'{uuid.uuid4()}');",'t',service)
    b.check('SQL5-active-only-in-invited-tenant',f"SELECT count(*)=1 AND bool_and(u.tenant_id='{b.A}' AND u.state='ACTIVE') FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(email)};",'t')
    b.check('SQL5-activation-audited-once',f"SELECT count(*)=1 FROM app.audit_logs WHERE resource_id='{invite}' AND action='users.invitation.accept';",'t')
    b.check('SQL5-revocation-fixture',f"UPDATE identity_private.user_invitations SET state='REVOKED',verifier=NULL,revoked_at=clock_timestamp() WHERE id='{invite}';")
    b.check('SQL5-revoked-link-denied',f"SELECT auth_api.invitation_link_material({args}) IS NULL;",'t',service)
    existing=str(uuid.uuid4())
    existing_verifier=hashlib.sha256(json.dumps(['CLEANOPS_INVITATION_LINK_V1',b.B,existing,'1','u2@fixture.invalid'],separators=(',',':')).encode()+raw).hexdigest()
    b.check('SQL5-existing-identity-synthetic-invite-other-tenant',f"INSERT INTO identity_private.user_invitations(tenant_id,id,email_normalized,display_name,reason,generation,state,verifier,issued_at,expires_at,created_by) VALUES('{b.B}','{existing}','u2@fixture.invalid','Synthetic existing recipient','Existing MFA proof required',1,'ISSUED',decode('{existing_verifier}','hex'),clock_timestamp(),clock_timestamp()+interval '24h','{b.W}');")
    b.check('SQL5-existing-identity-fails-closed-without-prior-factor-proof',f"SELECT auth_api.invitation_link_material('{existing}',{q(secret)},decode(repeat('43',32),'hex'),decode(repeat('44',32),'hex'),'{uuid.uuid4()}') IS NULL;",'t',service)
    b.check('SQL5-existing-credential-and-memberships-untouched',f"SELECT (SELECT argon2id_hash='$argon2id$fixture-not-a-real-password' AND credential_version=1 FROM identity_private.credentials WHERE principal_id='{b.Q}') AND NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id='{b.B}' AND principal_id='{b.Q}');",'t')
    failed=str(uuid.uuid4());recipient='sql5-failure-budget@fixture.invalid'
    failure_verifier=hashlib.sha256(json.dumps(['CLEANOPS_INVITATION_LINK_V1',b.A,failed,'1',recipient],separators=(',',':')).encode()+raw).hexdigest()
    b.check('SQL5-R2-synthetic-failure-budget-invite',f"INSERT INTO identity_private.user_invitations(tenant_id,id,email_normalized,display_name,reason,generation,state,verifier,issued_at,expires_at,created_by) VALUES('{b.A}','{failed}',{q(recipient)},'Synthetic failure budget','Five attempts in fifteen minutes',1,'ISSUED',decode('{failure_verifier}','hex'),clock_timestamp(),clock_timestamp()+interval '24h','{b.U}');")
    failure_args=f"'{failed}',{q(secret)},decode(repeat('45',32),'hex'),decode(repeat('46',32),'hex'),'{uuid.uuid4()}'"
    for attempt in range(5):
        b.check('SQL5-R2-record-credential-failure-'+str(attempt+1),f"BEGIN;SELECT auth_api.invitation_link_material({failure_args}) IS NOT NULL;SELECT auth_api.invitation_credential_denied('{failed}','{uuid.uuid4()}');COMMIT;",'t',service)
    b.check('SQL5-R2-sixth-credential-attempt-blocked',f"SELECT auth_api.invitation_link_material({failure_args}) IS NULL;",'t',service)
    b.check('SQL5-helpers-not-public',"SELECT NOT has_function_privilege('cleanops_identity_service',(SELECT oid FROM pg_proc WHERE proname='valid_invitation_cap'),'EXECUTE');",'t')
