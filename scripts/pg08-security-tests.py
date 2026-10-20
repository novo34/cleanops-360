"""SQL08 service-role boundary and durable recovery tests. No replacement ACL/SQL."""
import hashlib
import importlib.util
from pathlib import Path
import uuid

def gate(b,table_count=31):
 start=len(b.REPORT['checks'])
 spec=importlib.util.spec_from_file_location('previous07',Path(__file__).with_name('pg07-security-tests.py'))
 seven=importlib.util.module_from_spec(spec);spec.loader.exec_module(seven)
 seven.gate(b,table_count)
 oid=b.sql("SELECT 'identity_private.recovery_enrollments'::regclass::oid;").stdout.strip()
 reader=b.sql("SELECT 'auth_api.password_reset_material(bytea)'::regprocedure::oid;").stdout.strip()
 if not oid.isdigit() or not reader.isdigit():raise RuntimeError('SQL08_CATALOG_LOOKUP_FAILED')
 b.check('08-binding-owner-forced-RLS',f"SELECT relowner='cleanops_ddl_owner'::regrole AND relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid={oid};",'t')
 b.check('08-broker-exact-binding-DML',f"SELECT has_table_privilege('cleanops_auth_broker',{oid},'SELECT') AND has_table_privilege('cleanops_auth_broker',{oid},'INSERT') AND has_table_privilege('cleanops_auth_broker',{oid},'DELETE') AND NOT has_table_privilege('cleanops_auth_broker',{oid},'UPDATE,TRUNCATE,REFERENCES,TRIGGER');",'t')
 b.check('08-no-login-can-inherit-broker',"SELECT count(*) FROM pg_roles WHERE rolcanlogin AND NOT rolsuper AND pg_has_role(oid,'cleanops_auth_broker','MEMBER');",'0')
 b.check('08-reader-owner-definer-path-public-revoked',f"SELECT proowner='cleanops_auth_broker'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog'] AND NOT EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid={reader};",'t')
 for caller in [*b.ROLE.values(),'pgtest_verifier']:
  b.check('08-no-binding-direct-privileges-'+caller,f"SELECT has_table_privilege(current_user,{oid},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,{oid},'SELECT,INSERT,UPDATE');",'f',caller)
  b.check('08-no-binding-select-'+caller,'SELECT * FROM identity_private.recovery_enrollments;',role=caller,failure='42501')
  b.check('08-no-binding-delete-cross-subject-'+caller,f"DELETE FROM identity_private.recovery_enrollments WHERE tenant_id='{b.B}' AND user_id='{b.W}';",role=caller,failure='42501')
  b.check('08-no-binding-insert-cross-subject-'+caller,f"INSERT INTO identity_private.recovery_enrollments VALUES('{b.B}','{b.W}','{b.P}',decode(repeat('ab',32),'hex'),1,now());",role=caller,failure='42501')
  b.check('08-no-broker-assumption-'+caller,'SET ROLE cleanops_auth_broker;',role=caller,failure='42501')
  b.check('08-no-owner-assumption-'+caller,'SET ROLE cleanops_ddl_owner;',role=caller,failure='42501')
  b.check('08-reader-execute-only-identity-'+caller,f"SELECT has_function_privilege(current_user,{reader},'EXECUTE');",'t' if caller==b.ROLE['identity'] else 'f',caller)
 if any(c['status']!='PASS' for c in b.REPORT['checks'][start:]):return False
 return durable(b) and reset_reader(b)

def durable(b):
 start=len(b.REPORT['checks']);role=b.ROLE['identity'];corr=str(uuid.uuid4())
 dg=lambda raw:"decode('"+hashlib.sha256(raw.encode()).hexdigest()+"','hex')"
 token=lambda:uuid.uuid4().hex+'x'*11
 old,new,csrf,outsider,other= [token() for _ in range(5)]
 proof="decode(repeat('78',32),'hex')";method=str(uuid.uuid4())
 b.check('08-synthetic-recovery-fixture',f"INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,created_at,method_version) VALUES('{b.A}','{method}','{b.U}','EMAIL_OTP','ACTIVE',now(),1);INSERT INTO app.recovery_codes VALUES('{b.A}','{uuid.uuid4()}','{b.U}','{uuid.uuid4()}',{proof},now(),NULL,NULL);")
 def create(raw,tenant=b.A,principal=b.P):
  return f"SELECT auth_api.new_preauth_verified('{principal}','{tenant}',1,'$argon2id$fixture-not-a-real-password',{dg(raw)},{dg(csrf)}) IS NOT NULL;"
 b.check('08-password-proof-before-recovery',create(old),'t',role)
 b.check('08-independent-password-proof-before-recovery',create(outsider),'t',role)
 b.check('08-recovery-creates-bound-preauth',f"SELECT auth_api.recover_to_enrollment('{old}',{proof},{dg(new)},{dg(csrf)},'{corr}') IS NOT NULL;",'t',role)
 b.check('08-bound-preauth-usable',f"SELECT auth_api.preauth_summary('{new}')->>'state';",'ENROLLMENT_REQUIRED',role)
 b.check('08-recovery-never-directly-active',f"SELECT auth_api.issue_active_session('{new}',{dg(token())},{dg(csrf)},28800,1800,'Synthetic','Synthetic','{corr}');",role=role,failure='42501')
 b.check('08-reused-recovery-and-old-preauth-denied',f"SELECT auth_api.recover_to_enrollment('{old}',{proof},{dg(token())},{dg(csrf)},'{corr}');",role=role,failure='42501')
 b.check('08-revoked-independent-preauth-denied',f"SELECT auth_api.preauth_summary('{outsider}');",role=role,failure='42501')
 # New password proof may be issued, but cannot authorize any material/enrollment.
 outsider=token()
 b.check('08-new-password-proof-is-not-recovery-authority',create(outsider),'t',role)
 b.check('08-password-only-context-denied',f"SELECT auth_api.preauth_summary('{outsider}');",role=role,failure='42501')
 b.check('08-forged-preauth-denied',f"SELECT auth_api.preauth_summary('{token()}');",role=role,failure='42501')
 b.check('08-other-tenant-still-usable',create(other,b.B),'t',role)
 b.check('08-other-tenant-independent-context',f"SELECT auth_api.preauth_summary('{other}')->>'state';",'ENROLLMENT_REQUIRED',role)
 cross_user=token()
 b.check('08-other-user-context-issued',create(cross_user,b.A,b.Q),'t',role)
 b.check('08-other-user-remains-independent',f"SELECT auth_api.preauth_summary('{cross_user}')->>'state';",'ENROLLMENT_REQUIRED',role)
 for label,raw in [('cross-tenant',other),('cross-user',cross_user),('password-only',outsider)]:
  b.check('08-enrollment-cannot-forge-'+label,f"SELECT auth_api.begin_totp_enrollment_assigned('{raw}','{b.A}','{b.U}','{uuid.uuid4()}',1,decode('02'||repeat('00',60),'hex'),'synthetic-negative','SHA256','{corr}');",role=role,failure='42501')
 b.check('08-marker-tenant-user-version-bound',f"SELECT count(*)=1 FROM identity_private.recovery_enrollments WHERE tenant_id='{b.A}' AND user_id='{b.U}' AND principal_id='{b.P}' AND cookie_digest={dg(new)} AND credential_version=1;",'t')
 # Synthetic fixture aging does not change a security policy or approved function.
 b.check('08-age-owned-preauth-fixture',f"UPDATE identity_private.preauth SET created_at=now()-interval '700s',expires_at=now()-interval '1s' WHERE cookie_digest={dg(new)};")
 b.check('08-expired-bound-preauth-denied',f"SELECT auth_api.preauth_summary('{new}');",role=role,failure='42501')
 b.check('08-gc-no-password-fallback','SELECT auth_api.gc_ephemeral();',role=b.ROLE['maintenance'])
 b.check('08-abandoned-recovery-binding-survives',f"SELECT count(*) FROM identity_private.recovery_enrollments WHERE tenant_id='{b.A}' AND user_id='{b.U}';",'1')
 restart=token()
 b.check('08-abandon-restart-new-password-proof',create(restart),'t',role)
 b.check('08-abandon-restart-cannot-enroll',f"SELECT auth_api.preauth_summary('{restart}');",role=role,failure='42501')
 b.check('08-abandon-existing-password-context-still-denied',f"SELECT auth_api.preauth_summary('{outsider}');",role=role,failure='42501')
 b.check('08-no-cross-tenant-marker-created',f"SELECT count(*) FROM identity_private.recovery_enrollments WHERE tenant_id='{b.B}';",'0')
 b.check('08-reader-unknown-ticket-safe-null',"SELECT auth_api.password_reset_material(decode(repeat('00',32),'hex')) IS NULL;",'t',role)
 b.check('08-reader-malformed-ticket-safe-null',"SELECT auth_api.password_reset_material(decode('ab','hex')) IS NULL;",'t',role)
 # Existing fixtures are isolated from every browser principal; no admin grant or marker repair.
 return all(c['status']=='PASS' for c in b.REPORT['checks'][start:])

def reset_reader(b):
 start=len(b.REPORT['checks']);role=b.ROLE['identity'];corr=str(uuid.uuid4())
 principal,user=str(uuid.uuid4()),str(uuid.uuid4())
 digest=lambda value:"decode('"+hashlib.sha256(value.encode()).hexdigest()+"','hex')"
 ticket=digest('synthetic08-reset-ticket');wrong=digest('synthetic08-wrong-purpose');recovery=digest('synthetic08-recovery-proof')
 b.check('08-reset-synthetic-independent-subject',f"INSERT INTO identity_private.principals VALUES('{principal}','reset08@fixture.invalid','ACTIVE',now());INSERT INTO identity_private.credentials VALUES('{principal}','$argon2id$synthetic08-before',1,now());INSERT INTO app.users VALUES('{b.A}','{user}','{principal}','Synthetic reset08','ACTIVE','SENSITIVE',now());INSERT INTO app.recovery_codes VALUES('{b.A}','{uuid.uuid4()}','{user}','{uuid.uuid4()}',{recovery},now(),NULL,NULL);")
 for label,token,purpose in [('password',ticket,'PASSWORD'),('wrong-purpose',wrong,'MFA_RESET')]:
  b.check('08-reset-independent-attestation-'+label,f"SELECT auth_api.attest_reset('{b.A}','{user}',{token},'{purpose}','{uuid.uuid4()}',now()+interval '2m','{corr}') IS NOT NULL;",'t','pgtest_verifier')
 b.check('08-reset-reader-exact-private-projection',f"WITH m AS MATERIALIZED(SELECT auth_api.password_reset_material({ticket}) AS j) SELECT j->>'tenantId'='{b.A}' AND j->>'userId'='{user}' AND j->>'principalId'='{principal}' AND j->>'credentialVersion'='1' AND (j->>'requiresRecovery')::boolean AND (SELECT count(*) FROM jsonb_object_keys(j))=6 FROM m;",'t',role)
 b.check('08-reset-reader-rejects-MFA_RESET',f"SELECT auth_api.password_reset_material({wrong}) IS NULL;",'t',role)
 b.check('08-reset-invalid-recovery-cannot-CAS',f"SELECT auth_api.reset_password_cas({ticket},1,{wrong},'$argon2id$synthetic08-after','{corr}');",'f',role)
 b.check('08-reset-invalid-proof-retains-ticket',f"SELECT auth_api.password_reset_material({ticket}) IS NOT NULL;",'t',role)
 b.check('08-reset-stale-CAS-cannot-consume-proof',f"SELECT auth_api.reset_password_cas({ticket},2,{recovery},'$argon2id$synthetic08-after','{corr}');",'f',role)
 b.check('08-reset-native-reader-CAS-one-transaction',f"BEGIN;WITH m AS MATERIALIZED(SELECT auth_api.password_reset_material({ticket}) AS j) SELECT auth_api.reset_password_cas({ticket},(j->>'credentialVersion')::bigint,{recovery},'$argon2id$synthetic08-after','{corr}') FROM m;COMMIT;",'t',role)
 b.check('08-reset-consumed-ticket-material-denied',f"SELECT auth_api.password_reset_material({ticket}) IS NULL;",'t',role)
 b.check('08-reset-replay-cannot-CAS',f"SELECT auth_api.reset_password_cas({ticket},2,{recovery},'$argon2id$synthetic08-again','{corr}');",'f',role)
 b.check('08-reset-native-version-proof-audit-atomic',f"SELECT (SELECT credential_version=2 FROM identity_private.credentials WHERE principal_id='{principal}') AND (SELECT consumed_at IS NOT NULL FROM app.recovery_codes WHERE tenant_id='{b.A}' AND user_id='{user}' AND digest={recovery});",'t')
 # Deliberately synthetic PHC strings above test SQL/CAS only, not password policy or UI.
 return all(c['status']=='PASS' for c in b.REPORT['checks'][start:])
