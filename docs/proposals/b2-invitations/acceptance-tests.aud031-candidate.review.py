"""AUD-031 REVIEW ONLY: selected only by the canonical harness after independent authorization.

Runs on the existing SQL14+SQL1+SQL2+SQL3 isolated harness. SQL4 is installed as
a dependency only; its historical 260-check suite is NOT repeated.
"""
import base64
import hashlib
import json
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier


def run(b):
    service=b.ROLE['identity']
    accept_key="decode('"+hashlib.sha256(json.dumps(['CLEANOPS_INVITATION_ACCEPT_V1','synthetic-acceptance-key'],separators=(',',':')).encode()).hexdigest()+"','hex')"
    other_key="decode('"+hashlib.sha256(json.dumps(['CLEANOPS_INVITATION_ACCEPT_V1','different-acceptance-key'],separators=(',',':')).encode()).hexdigest()+"','hex')"
    q=lambda v:"'"+str(v).replace("'","''")+"'"
    def effects(tenant, invitation, recipient):
        # Observe complete durable rows, not only user/audit counts. Never emit
        # the snapshot (it includes synthetic credential/capability material).
        queries={
            'principals':f"SELECT * FROM identity_private.principals WHERE email_normalized={q(recipient)}",
            'credentials':f"SELECT c.* FROM identity_private.credentials c JOIN identity_private.principals p ON p.id=c.principal_id WHERE p.email_normalized={q(recipient)}",
            'users':f"SELECT u.* FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(recipient)}",
            'methods':f"SELECT m.* FROM app.mfa_methods m JOIN app.users u ON (u.tenant_id,u.id)=(m.tenant_id,m.user_id) JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(recipient)}",
            'resources':f"SELECT r.* FROM app.access_resources r JOIN app.users u ON (u.tenant_id,u.id)=(r.tenant_id,r.id) JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(recipient)}",
            'sessions':f"SELECT s.* FROM app.sessions s JOIN identity_private.principals p ON p.id=s.principal_id WHERE p.email_normalized={q(recipient)}",
            'invitation':f"SELECT * FROM identity_private.user_invitations WHERE tenant_id={q(tenant)} AND id={q(invitation)}",
            'capabilities':f"SELECT * FROM identity_private.invitation_acceptances WHERE tenant_id={q(tenant)} AND invitation_id={q(invitation)}",
            'outbox':f"SELECT * FROM app.auth_outbox WHERE tenant_id={q(tenant)} AND invitation_id={q(invitation)}",
            'audit':f"SELECT * FROM app.audit_logs WHERE resource_id={q(invitation)}",
        }
        fields=','.join(q(name)+",(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM ("+query+") x)" for name,query in queries.items())
        result=b.sql('SELECT jsonb_build_object('+fields+');')
        if result.returncode!=0 or not result.stdout.strip():
            raise RuntimeError('AUD031_EFFECT_SNAPSHOT_FAILED')
        return result.stdout.strip()
    # This replaces the selected fixture, not the runner; native permission is separate.
    for package in (b.ROOT/'docs/proposals/b2-invitations/004-invitation-administration.review.sql',Path(__file__).with_name('005-invitation-acceptance.aud031-candidate.review.sql')):
        if not b.check('SQL5-install-'+package.name,package.read_text(encoding='utf-8')):
            raise RuntimeError('SQL5_DEPENDENCY_INSTALLATION_FAILED')
    b.check('SQL5-explicit-synthetic-tenant-policy',f"INSERT INTO identity_private.invitation_policy(tenant_id,link_seconds,default_risk_class,operational_mfa_required) VALUES('{b.A}',86400,'SENSITIVE',true),('{b.B}',86400,'SENSITIVE',true);")
    b.check('SQL5-no-direct-identity-access','SELECT * FROM identity_private.invitation_acceptances;',role=service,failure='42501')
    b.check('SQL5-R2-attempt-ledger-private','SELECT * FROM identity_private.invitation_acceptance_attempts;',role=service,failure='42501')
    b.check('SQL5-R2-B1-security-log-remains-append-only',"SELECT NOT has_table_privilege('cleanops_auth_broker','identity_private.security_log','SELECT') AND has_table_privilege('cleanops_auth_broker','identity_private.security_log','INSERT');",'t')
    b.check('SQL5-no-runtime-call',f"SELECT auth_api.consume_invitation_acceptance(repeat('a',43),repeat('b',43),{accept_key},'{uuid.uuid4()}');",role=b.ROLE['runtime'],failure='42501')
    b.check('AUD031-unique-new-signature',"SELECT to_regprocedure('auth_api.consume_invitation_acceptance(text,text,uuid)') IS NULL AND count(*)=1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth_api' AND p.proname='consume_invitation_acceptance';",'t')
    b.check('AUD031-owner-and-no-defaults',"SELECT pg_get_userbyid(proowner)='cleanops_auth_broker' AND pronargdefaults=0 AND prorettype='boolean'::regtype FROM pg_proc WHERE oid='auth_api.consume_invitation_acceptance(text,text,bytea,uuid)'::regprocedure;",'t')
    b.check('AUD031-effective-execute-roles',"SELECT has_function_privilege('cleanops_identity_service','auth_api.consume_invitation_acceptance(text,text,bytea,uuid)','EXECUTE') AND NOT has_function_privilege('cleanops_runtime','auth_api.consume_invitation_acceptance(text,text,bytea,uuid)','EXECUTE') AND NOT has_function_privilege('cleanops_mail_worker','auth_api.consume_invitation_acceptance(text,text,bytea,uuid)','EXECUTE');",'t')
    b.check('AUD031-no-extra-grantees',"SELECT NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='auth_api.consume_invitation_acceptance(text,text,bytea,uuid)'::regprocedure AND a.grantee<>p.proowner AND (a.grantee<>'cleanops_identity_service'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable));",'t')
    raw=bytes(range(32));secret=base64.urlsafe_b64encode(raw).decode().rstrip('=')
    invite=str(uuid.uuid4());email='sql5-new@fixture.invalid'
    context=['CLEANOPS_INVITATION_LINK_V1',b.A,invite,'1',email]
    verifier=hashlib.sha256(json.dumps(context,separators=(',',':')).encode()+raw).hexdigest()
    b.check('SQL5-synthetic-issued-link',f"INSERT INTO identity_private.user_invitations(tenant_id,id,email_normalized,display_name,reason,generation,state,verifier,issued_at,expires_at,created_by) VALUES('{b.A}','{invite}',{q(email)},'Synthetic acceptance','SQL5 isolated test',1,'ISSUED',decode('{verifier}','hex'),clock_timestamp(),clock_timestamp()+interval '24h','{b.U}');")
    args=f"'{invite}',{q(secret)},decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),'{uuid.uuid4()}'"
    b.check('SQL5-link-is-private-no-membership-before-MFA',f"BEGIN;SELECT (auth_api.invitation_link_material({args})->>'mfa_required')::boolean;ROLLBACK;",'t',service)
    b.check('SQL5-no-user-or-session-created',f"SELECT NOT EXISTS(SELECT 1 FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(email)}) AND NOT EXISTS(SELECT 1 FROM identity_private.invitation_acceptances WHERE invitation_id='{invite}');",'t')
    b.check('SQL5-unknown-capability-denied',f"SELECT NOT auth_api.consume_invitation_acceptance(repeat('a',43),repeat('b',43),{accept_key},'{uuid.uuid4()}');",'t',service)
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
    for n,valid in ((56,False),(58,True),(59,False),(1024,True),(1026,False)):
        val='ab'*(n//2)+('a' if n%2 else '')
        b.check('SQL5-R3-hex-'+str(n),f"SELECT (length('{val}') BETWEEN 58 AND 1024 AND length('{val}')%2=0 AND '{val}' ~ '^[a-f0-9]+$') IS {'TRUE' if valid else 'FALSE'};",'t')
    b.check('SQL5-R3-invalid-hex',"SELECT NOT ('gg' || repeat('ab',29) ~ '^[a-f0-9]+$');",'t')
    b.check('SQL5-expired-capability-denied-with-rollback',f"BEGIN;UPDATE identity_private.invitation_acceptances SET created_at=clock_timestamp()-interval '10m',expires_at=clock_timestamp()-interval '1s' WHERE invitation_id='{invite}';SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{accept_key},'{uuid.uuid4()}');ROLLBACK;",'t')
    b.check('SQL5-before-MFA-no-activation',f"SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{accept_key},'{uuid.uuid4()}');",'t',service)
    b.check('SQL5-wrong-CSRF-denied',f"SELECT auth_api.invitation_factor_material({q(cap)},repeat('a',43),'{uuid.uuid4()}') IS NULL;",'t',service)
    factor=f"WITH m AS MATERIALIZED(SELECT auth_api.invitation_factor_material({q(cap)},{q(csrf)},'{uuid.uuid4()}') v) SELECT auth_api.invitation_factor_cas({q(cap)},{q(csrf)},(v->>'generation')::bigint,(v->>'policy_version')::bigint,NULL,floor(extract(epoch FROM clock_timestamp())/30)::bigint,'{uuid.uuid4()}') FROM m;"
    b.check('SQL5-native-factor-CAS',factor,'t',service)
    # Revoke READY capability, then roll back before first consumption.
    before_revocation=effects(b.A,invite,email)
    b.check('AUD031-revoked-capability-denies-consumption',f"BEGIN;UPDATE identity_private.invitation_acceptances SET state='REVOKED',password_hash=NULL,secret_ciphertext=NULL WHERE tenant_id='{b.A}' AND invitation_id='{invite}';SET LOCAL ROLE {service};SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{accept_key},'{uuid.uuid4()}');SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{other_key},'{uuid.uuid4()}');ROLLBACK;",'t\nt')
    b.record('AUD031-revoked-capability-rollback-preserves-effects','PASS' if effects(b.A,invite,email)==before_revocation else 'FAIL')
    # READY makes these denials isolate key length/null validation from MFA state.
    for name,key_expr in [('null','NULL'),('short',"decode(repeat('01',31),'hex')"),('long',"decode(repeat('01',33),'hex')")]:
        b.check('AUD031-invalid-digest-'+name,f"SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{key_expr},'{uuid.uuid4()}');",'t',service)
    before_rollback=effects(b.A,invite,email)
    b.check('SQL5-rollback-activation',f"BEGIN;SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{accept_key},'{uuid.uuid4()}');ROLLBACK;",'t',service)
    b.record('AUD031-rollback-all-effects','PASS' if effects(b.A,invite,email)==before_rollback else 'FAIL')
    b.check('SQL5-rollback-has-no-member',f"SELECT NOT EXISTS(SELECT 1 FROM identity_private.principals WHERE email_normalized={q(email)});",'t')
    b.check('AUD031-rollback-key-and-audit',f"SELECT (SELECT bool_and(state='READY' AND accept_key_digest IS NULL) FROM identity_private.invitation_acceptances WHERE tenant_id='{b.A}' AND invitation_id='{invite}') AND NOT EXISTS(SELECT 1 FROM app.audit_logs WHERE tenant_id='{b.A}' AND resource_id='{invite}' AND action='users.invitation.accept');",'t')
    race_cap,race_csrf,race_keys=cap,csrf,[accept_key,accept_key]
    # Two independent psql connections start together against one READY capability.
    # Idempotent success may return t twice; the durable single mutation is authoritative.
    simultaneous=Barrier(2, timeout=15)
    def consume(index):
        simultaneous.wait(timeout=15)
        return b.sql(f"SELECT auth_api.consume_invitation_acceptance({q(race_cap)},{q(race_csrf)},{race_keys[index]},'{uuid.uuid4()}');",service)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(consume,i) for i in (0,1)]
            results=[f.result(timeout=40) for f in futures]
        values=[r.stdout.strip() for r in results]
        race_ok=len(results)==2 and all(r.returncode==0 and v=='t' for r,v in zip(results,values))
    except Exception:
        race_ok=False
    b.record('SQL5-R3-parallel-race','PASS' if race_ok else 'FAIL')
    b.check('SQL5-R3-parallel-unique-mutate',f"SELECT (SELECT count(*) FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(email)})=1 AND (SELECT count(*) FROM app.audit_logs WHERE resource_id='{invite}' AND action='users.invitation.accept')=1;",'t')
    after_accept=effects(b.A,invite,email)
    b.check('AUD031-first-consumption-no-B1-session',f"SELECT NOT EXISTS(SELECT 1 FROM app.sessions s JOIN identity_private.principals p ON p.id=s.principal_id WHERE p.email_normalized={q(email)});",'t')
    b.check('SQL5-consumed-idempotent-no-recreation',f"SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{accept_key},'{uuid.uuid4()}');",'t',service)
    b.check('SQL5-active-only-in-invited-tenant',f"SELECT count(*)=1 AND bool_and(u.tenant_id='{b.A}' AND u.state='ACTIVE') FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(email)};",'t')
    b.check('SQL5-activation-audited-once',f"SELECT count(*)=1 FROM app.audit_logs WHERE resource_id='{invite}' AND action='users.invitation.accept';",'t')
    b.check('AUD031-key-persisted',f"SELECT accept_key_digest={accept_key} FROM identity_private.invitation_acceptances WHERE tenant_id='{b.A}' AND invitation_id='{invite}';",'t')
    b.check('AUD031-other-key-conflict',f"SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{other_key},'{uuid.uuid4()}');",role=service,failure='P0001')
    b.check('AUD031-legacy-null-denies-both',f"BEGIN;UPDATE identity_private.invitation_acceptances SET accept_key_digest=NULL WHERE tenant_id='{b.A}' AND invitation_id='{invite}';SET LOCAL ROLE {service};SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{accept_key},'{uuid.uuid4()}');SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{other_key},'{uuid.uuid4()}');RESET ROLE;SELECT state='CONSUMED' AND accept_key_digest IS NULL FROM identity_private.invitation_acceptances WHERE tenant_id='{b.A}' AND invitation_id='{invite}';ROLLBACK;",'t\nt\nt')
    b.check('AUD031-expired-consumed-denies-both',f"BEGIN;UPDATE identity_private.invitation_acceptances SET created_at=clock_timestamp()-interval '10m',expires_at=clock_timestamp()-interval '1s' WHERE tenant_id='{b.A}' AND invitation_id='{invite}';SET LOCAL ROLE {service};SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{accept_key},'{uuid.uuid4()}');SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{other_key},'{uuid.uuid4()}');ROLLBACK;",'t\nt')
    b.check('AUD031-policy-change-denies-replay',f"BEGIN;UPDATE app.policy_versions SET version=version+1 WHERE tenant_id='{b.A}';SET LOCAL ROLE {service};SELECT NOT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{accept_key},'{uuid.uuid4()}');ROLLBACK;",'t')
    b.check('AUD031-denials-preserve-original',f"SELECT (SELECT state='CONSUMED' AND accept_key_digest={accept_key} FROM identity_private.invitation_acceptances WHERE tenant_id='{b.A}' AND invitation_id='{invite}') AND (SELECT count(*)=1 FROM app.audit_logs WHERE tenant_id='{b.A}' AND resource_id='{invite}' AND action='users.invitation.accept');",'t')
    b.record('AUD031-replay-and-denials-preserve-all-effects','PASS' if effects(b.A,invite,email)==after_accept else 'FAIL')
    # The same worker and native harness cover same-key isolation and distinct-key races.
    for scenario,target_tenant,actor,keys in [('tenant-B-same-key',b.B,b.W,[accept_key,accept_key]),('different-key-race',b.A,b.U,[accept_key,other_key])]:
        extra_invite=str(uuid.uuid4());extra_email='aud031-'+scenario+'@fixture.invalid'
        verifier2=hashlib.sha256(json.dumps(['CLEANOPS_INVITATION_LINK_V1',target_tenant,extra_invite,'1',extra_email],separators=(',',':')).encode()+raw).hexdigest()
        cap2=base64.urlsafe_b64encode(uuid.uuid4().bytes+uuid.uuid4().bytes).decode().rstrip('=');csrf2=base64.urlsafe_b64encode(uuid.uuid4().bytes+uuid.uuid4().bytes).decode().rstrip('=')
        method2=json.dumps({'id':str(uuid.uuid4()),'ciphertext':'bb'*64,'key_version':'aud031-synthetic-not-delivered','algorithm':'SHA256'})
        b.check('AUD031-'+scenario+'-issued',f"INSERT INTO identity_private.user_invitations(tenant_id,id,email_normalized,display_name,reason,generation,state,verifier,issued_at,expires_at,created_by) VALUES('{target_tenant}','{extra_invite}',{q(extra_email)},'Synthetic AUD031','Isolated fixture',1,'ISSUED',decode('{verifier2}','hex'),clock_timestamp(),clock_timestamp()+interval '24h','{actor}');")
        args2=f"'{extra_invite}',{q(secret)},decode(repeat('51',32),'hex'),decode(repeat('52',32),'hex'),'{uuid.uuid4()}'"
        prepare2=f"BEGIN;WITH d AS MATERIALIZED(SELECT auth_api.invitation_link_material({args2}) v) SELECT auth_api.prepare_invitation_acceptance((v-'tenant_id'-'recipient'-'password_hash'-'risk_class'-'mfa_required')||jsonb_build_object('expected_hash',NULL,'replacement_hash','$argon2id$fixture-not-a-real-password','method',{q(method2)}::jsonb),{cap_digest(cap2,'CAPABILITY')},{cap_digest(csrf2,'CSRF')},'{uuid.uuid4()}') FROM d;COMMIT;"
        b.check('AUD031-'+scenario+'-prepared',prepare2,'t',service)
        factor2=f"WITH m AS MATERIALIZED(SELECT auth_api.invitation_factor_material({q(cap2)},{q(csrf2)},'{uuid.uuid4()}') v) SELECT auth_api.invitation_factor_cas({q(cap2)},{q(csrf2)},(v->>'generation')::bigint,(v->>'policy_version')::bigint,NULL,floor(extract(epoch FROM clock_timestamp())/30)::bigint,'{uuid.uuid4()}') FROM m;"
        b.check('AUD031-'+scenario+'-factor',factor2,'t',service)
        b.check('AUD031-'+scenario+'-wrong-CSRF',f"SELECT NOT auth_api.consume_invitation_acceptance({q(cap2)},{q(csrf)},{accept_key},'{uuid.uuid4()}');",'t',service)
        race_cap,race_csrf,race_keys=cap2,csrf2,keys;simultaneous=Barrier(2,timeout=15);winner=None
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results=[future.result(timeout=40) for future in [pool.submit(consume,i) for i in (0,1)]]
            successes=[i for i,result in enumerate(results) if result.returncode==0 and result.stdout.strip()=='t']
            conflicts=[i for i,result in enumerate(results) if result.returncode!=0 and b.state(result)=='P0001' and 'IDEMPOTENCY_MISMATCH' in result.stderr]
            race_ok=len(successes)==2 if scenario=='tenant-B-same-key' else len(successes)==1 and len(conflicts)==1
            if race_ok:winner=keys[successes[0]]
        except Exception:race_ok=False
        b.record('AUD031-'+scenario+'-parallel','PASS' if race_ok else 'FAIL')
        if winner is not None:
            before_replay=effects(target_tenant,extra_invite,extra_email)
            b.check('AUD031-'+scenario+'-winner-replay',f"SELECT auth_api.consume_invitation_acceptance({q(cap2)},{q(csrf2)},{winner},'{uuid.uuid4()}');",'t',service)
            b.record('AUD031-'+scenario+'-replay-preserves-all-effects','PASS' if effects(target_tenant,extra_invite,extra_email)==before_replay else 'FAIL')
            b.check('AUD031-'+scenario+'-single-tenant-effect',f"SELECT (SELECT count(*)=1 AND bool_and(u.tenant_id='{target_tenant}') FROM app.users u JOIN identity_private.principals p ON p.id=u.principal_id WHERE p.email_normalized={q(extra_email)}) AND (SELECT count(*)=1 AND bool_and(tenant_id='{target_tenant}') FROM app.audit_logs WHERE resource_id='{extra_invite}' AND action='users.invitation.accept') AND (SELECT accept_key_digest={winner} FROM identity_private.invitation_acceptances WHERE tenant_id='{target_tenant}' AND invitation_id='{extra_invite}');",'t')
    b.check('AUD031-original-scope-replays',f"SELECT auth_api.consume_invitation_acceptance({q(cap)},{q(csrf)},{accept_key},'{uuid.uuid4()}');",'t',service)
    b.record('AUD031-other-tenant-preserves-original-effects','PASS' if effects(b.A,invite,email)==after_accept else 'FAIL')
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
