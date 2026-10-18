"""Real SQL service-role negatives/positives; no substitute grants or security bypass."""
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import uuid

def run(b):
 revision=getattr(b,'E1_REVISION','06');count=96 if revision=='07' else 95
 role=b.ROLE['identity'];mail=b.ROLE['mail'];corr=str(uuid.uuid4());q=lambda x:"'"+str(x).replace("'","''")+"'"
 session=lambda body:"BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));"+body+'COMMIT;'
 def service(name,body,expected=None,failure=None):return b.check(name,session(body),expected,role,failure)
 b.check('catalog30-forced-RLS-tables',"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity;",'30')
 b.check('catalog'+str(count)+'-functions44-policies',f"SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth_api','identity_private') AND p.prokind='f')={count} AND (SELECT count(*) FROM pg_policies WHERE schemaname IN('app','identity_private'))=44;",'t')
 b.check('all-functions-pinned-path',"SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth_api','identity_private') AND NOT coalesce(p.proconfig,'{}') @> ARRAY['search_path=pg_catalog'];",'0')
 manifest=json.loads((b.ROOT/('docs/proposals/b1-consolidated-sql/revisions/'+revision+'/manifest.json')).read_text())
 for i,f in enumerate(manifest['functions']):
  sig=q(f['signature']);oid=b.sql("SELECT "+sig+"::regprocedure::oid;").stdout.strip();b.check('new-function-owner-acl-'+str(i),f"SELECT p.proowner='cleanops_auth_broker'::regrole AND p.prosecdef AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') FROM pg_proc p WHERE p.oid={sig}::regprocedure;",'t')
  for caller,r in [('identity',role),('mail',mail),('verifier','pgtest_verifier')]:
   expected=f['execute']=={'identity':'cleanops_identity_service','mail':'cleanops_mail_worker','verifier':'cleanops_recipient_verifier'}[caller]
   b.check('new-execute-matrix-'+str(i)+'-'+caller,f"SELECT has_function_privilege(current_user,{oid}::oid,'EXECUTE');",'t' if expected else 'f',r)
 for caller in [role,mail,'pgtest_verifier',b.ROLE['runtime']]:
  b.check('no-direct-new-table-'+caller,"SELECT count(*) FROM information_schema.role_table_grants WHERE grantee=current_user AND table_schema IN('app','identity_private');",'0',caller)
  b.check('no-bypass-role-'+caller,"SELECT (NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole)::text FROM pg_roles WHERE rolname=current_user;",'true',caller)
  b.check('no-inherited-table-access-'+caller,"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r' AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE'));",'0',caller)
  b.check('direct-recipient-denied-'+caller,'SELECT * FROM app.verified_recipients;',role=caller,failure='42501')
  b.check('assume-broker-denied-'+caller,'SET ROLE cleanops_auth_broker;',role=caller,failure='42501')
 b.check('legacy-worker-claim-denied',"SELECT auth_api.claim_mail(decode(repeat('ab',32),'hex'));",role=mail,failure='42501')
 service('legacy-email-issue-denied',f"SELECT auth_api.issue_bound_challenge(NULL,'EMAIL_OTP','{uuid.uuid4()}',1,NULL,NULL,NULL,'B1-SELF-06',NULL,'{corr}');",failure='42501')
 for action in ['view','create','edit','approve','delete','export','manage_permissions']:
  service('AUTHZ-default-deny-'+action,f"SELECT auth_api.effective_access('{action}','users','{b.V}');",'f')
 b.check('synthetic-server-resource-catalog',f"INSERT INTO app.access_resources VALUES('{b.A}','{b.V}','users',NULL),('{b.B}','{b.W}','users',NULL);INSERT INTO app.auth_preferences VALUES('{b.A}',true),('{b.B}',false);")
 allow,deny=[str(uuid.uuid4()) for _ in range(2)]
 b.check('synthetic-approved-access-fixture',f"INSERT INTO app.access_rules VALUES('{b.A}','{allow}',NULL,'{b.U}','view','users',NULL,'ALLOW',now()-interval '1m',NULL,NULL);")
 service('AUTHZ-authorized-resource',f"SELECT auth_api.effective_access('view','users','{b.V}');",'t')
 service('AUTHZ-cross-tenant-resource-denied',f"SELECT auth_api.effective_access('view','users','{b.W}');",'f')
 b.check('synthetic-deny-fixture',f"INSERT INTO app.access_rules VALUES('{b.A}','{deny}',NULL,'{b.U}','view','users','{b.V}','DENY',now()-interval '1m',NULL,NULL);")
 service('AUTHZ-deny-over-allow',f"SELECT auth_api.effective_access('view','users','{b.V}');",'f')
 service('trust-not-a-login-proof',"SELECT auth_api.trusted_device_valid(decode(repeat('ab',32),'hex'));",'f')
 service('trust-register-without-stepup-denied',f"SELECT auth_api.register_trusted_device(decode(repeat('ab',32),'hex'),'{corr}');",failure='42501')
 b.check('fixture-fresh-stepup',f"INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{b.U}','{b.S}','B1-SELF-06',now(),now()+interval '5m',1);")
 token="decode(repeat('ab',32),'hex')"
 service('trust-register-real',f"SELECT auth_api.register_trusted_device({token},'{corr}') IS NOT NULL;",'t')
 service('trust-valid-active-only',f"SELECT auth_api.trusted_device_valid({token});",'t')
 b.check('trust-expire-synthetic-clock-row',f"UPDATE app.trusted_devices SET created_at=now()-interval '31d',expires_at=now()-interval '1d' WHERE tenant_id='{b.A}' AND user_id='{b.U}';")
 service('trust-expired-denied',f"SELECT auth_api.trusted_device_valid({token});",'f')
 service('admin-reset-without-RBAC-denied',f"SELECT auth_api.admin_reset_mfa('{b.V}',decode(repeat('ab',32),'hex'),'synthetic identity proof','{corr}');",'f')
 # Positive role lifecycle and exact policy-CAS operations, all as service login.
 def policy():return b.sql(f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';").stdout.strip()
 def fresh():
  pv=policy();b.check('synthetic-current-factor-policy-'+pv,f"INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{b.U}','{b.S}','B1-SELF-06',now(),now()+interval '5m',{pv});");return pv
 setup=''
 for action,kind in [('manage_permissions','access'),('view','access'),('edit','users')]:
  setup+=f"INSERT INTO app.access_rules VALUES('{b.A}','{uuid.uuid4()}',NULL,'{b.U}','{action}','{kind}',NULL,'ALLOW',now()-interval '1m',NULL,NULL);"
 b.check('synthetic-admin-explicit-grants-not-role-name',setup)
 rid,role_rule,user_rule=[str(uuid.uuid4()) for _ in range(3)]
 pv=fresh();service('RBAC-role-create',f"SELECT auth_api.set_access_role('{rid}','Synthetic Company Admin',{pv},'{corr}');",'t')
 pv=fresh();service('RBAC-role-positive-permission',f"SELECT auth_api.set_role_access_rule('{rid}','{role_rule}','edit','users','{b.V}','ALLOW',now(),now()+interval '1h',{pv},'{corr}');",'t')
 pv=fresh();service('RBAC-role-membership',f"SELECT auth_api.set_role_membership('{rid}','{b.V}',now(),now()+interval '1h',{pv},'{corr}');",'t')
 service('RBAC-authorized-access-detail',f"SELECT jsonb_array_length(auth_api.access_detail('{b.V}')->'roles')>0;",'t')
 pv=fresh();service('RBAC-user-override',f"SELECT auth_api.set_user_access_rule('{b.V}','{user_rule}','delete','users','{b.V}','DENY',now(),NULL,{pv},'{corr}');",'t')
 pv=fresh();service('RBAC-revoke-user-rule',f"SELECT auth_api.revoke_access_assignment('RULE','{user_rule}','{b.V}',{pv},'{corr}');",'t')
 pv=fresh();service('RBAC-revoke-membership',f"SELECT auth_api.revoke_access_assignment('MEMBERSHIP','{rid}','{b.V}',{pv},'{corr}');",'t')
 pv=fresh();service('RBAC-revoke-role',f"SELECT auth_api.revoke_access_assignment('ROLE','{rid}',NULL,{pv},'{corr}');",'t')
 pv=fresh();service('trust-admin-revoke-authorized',f"SELECT auth_api.admin_revoke_trusted_devices('{b.V}','{corr}');",'0')
 service('trust-own-list',"SELECT jsonb_typeof(auth_api.own_trusted_devices(10,NULL,NULL));",'array')
 # Fresh independently attested receipts; functional operator is NOT a superuser.
 reset_digest="decode(repeat('cd',32),'hex')"
 b.check('synthetic-independent-MFA-reset-attestation',f"SELECT auth_api.attest_reset('{b.A}','{b.V}',{reset_digest},'MFA_RESET','{uuid.uuid4()}',now()+interval '2m','{corr}') IS NOT NULL;",'t','pgtest_verifier')
 pv=fresh();service('admin-MFA-reset-with-independent-proof',f"SELECT auth_api.admin_reset_mfa('{b.V}',{reset_digest},'Synthetic operator identity proof','{corr}');",'t')
 service('admin-reset-receipt-replay-denied',f"SELECT auth_api.admin_reset_mfa('{b.V}',{reset_digest},'Synthetic operator identity proof','{corr}');",'f')
 password_ticket="decode(repeat('ef',32),'hex')"
 b.check('synthetic-password-reset-attestation',f"SELECT auth_api.attest_reset('{b.A}','{b.V}',{password_ticket},'PASSWORD','{uuid.uuid4()}',now()+interval '2m','{corr}') IS NOT NULL;",'t','pgtest_verifier')
 pv=fresh();service('admin-password-reset-authorization-no-password-access',f"SELECT auth_api.authorize_password_reset('{b.V}',{password_ticket},'Synthetic operator identity proof','{corr}');",'t')
 b.check('password-reset-CAS-after-current-admin-proof',f"SELECT auth_api.reset_password_cas({password_ticket},1,NULL,'$argon2id$synthetic-reset-password','{corr}');",'t',role)
 b.check('password-reset-receipt-replay-denied',f"SELECT auth_api.reset_password_cas({password_ticket},1,NULL,'$argon2id$synthetic-reset-password','{corr}');",'f',role)
 # Two owned reservations/permission changes target same policy generation: one winner.
 pv=fresh();race_rule=str(uuid.uuid4())
 stmt_policy=session(f"SELECT auth_api.set_user_access_rule('{b.V}','{race_rule}','delete','users','{b.V}','DENY',now(),NULL,{pv},'{corr}');")
 with ThreadPoolExecutor(max_workers=2) as ex:race_results=list(ex.map(lambda _:b.sql(stmt_policy,role),range(2)))
 vals_policy=[r.stdout.strip().splitlines()[-1] if not r.returncode and r.stdout.strip() else None for r in race_results]
 b.record('RBAC-policy-CAS-one-winner','PASS' if sorted(v for v in vals_policy if v is not None)==['f','t'] else 'FAIL',{'winners':vals_policy.count('t'),'sqlstates':[b.state(r) for r in race_results if r.returncode]})
 # Recovery cannot become ACTIVE; preserve the verified password deadline.
 rec_method=str(uuid.uuid4());rec_digest="decode(repeat('91',32),'hex')"
 b.check('synthetic-recovery-batch-and-factor',f"INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,created_at,method_version) VALUES('{b.A}','{rec_method}','{b.V}','EMAIL_OTP','ACTIVE',now(),1);INSERT INTO app.recovery_codes VALUES('{b.A}','{uuid.uuid4()}','{b.V}','{uuid.uuid4()}',{rec_digest},now(),NULL,NULL);")
 dg=lambda v:"decode('"+hashlib.sha256((v*43).encode()).hexdigest()+"','hex')"
 b.check('recovery-password-verified-preauth',f"SELECT auth_api.new_preauth_verified('{b.Q}','{b.A}',2,'$argon2id$synthetic-reset-password',{dg('r')},{dg('z')}) IS NOT NULL;",'t',role)
 b.check('recovery-wrong-code-denied',f"SELECT auth_api.recover_to_enrollment(repeat('r',43),decode(repeat('90',32),'hex'),{dg('u')},{dg('v')},'{corr}') IS NOT NULL;",'f',role)
 rec_stmt=f"SELECT auth_api.recover_to_enrollment(repeat('r',43),{rec_digest},{dg('u')},{dg('v')},'{corr}') IS NOT NULL;"
 with ThreadPoolExecutor(max_workers=2) as ex:rec_results=list(ex.map(lambda _:b.sql(rec_stmt,role),range(2)))
 rec_winners=sum(r.returncode==0 and r.stdout.strip()=='t' for r in rec_results)
 b.record('recovery-CAS-one-winner','PASS' if rec_winners==1 and all((r.returncode==0 and r.stdout.strip()=='t') or (r.returncode and b.state(r)=='42501') for r in rec_results) else 'FAIL',{'winners':rec_winners,'sqlstates':[b.state(r) for r in rec_results if r.returncode]})
 b.check('recovery-state-restricted-no-session',"SELECT auth_api.preauth_summary(repeat('u',43))->>'state';",'ENROLLMENT_REQUIRED',role)
 b.check('recovery-does-not-issue-ACTIVE',f"SELECT auth_api.issue_active_session(repeat('u',43),{dg('i')},{dg('j')},28800,1800,'Synthetic','Synthetic','{corr}');",role=role,failure='42501')
 b.check('recovery-old-factor-and-code-revoked',f"SELECT (SELECT state='REVOKED' FROM app.mfa_methods WHERE tenant_id='{b.A}' AND id='{rec_method}') AND (SELECT consumed_at IS NOT NULL AND revoked_at IS NOT NULL FROM app.recovery_codes WHERE tenant_id='{b.A}' AND user_id='{b.V}' AND digest={rec_digest});",'t')
 # PREAUTH rotation starts from actual password-version proof, changes tenant only.
 b.check('tenant-rotation-original-verified-preauth',f"SELECT auth_api.new_preauth_verified('{b.P}','{b.A}',1,'$argon2id$fixture-not-a-real-password',{dg('n')},{dg('m')}) IS NOT NULL;",'t',role)
 b.check('tenant-rotation-owned-membership',f"SELECT auth_api.rotate_preauth_tenant(repeat('n',43),'{b.B}',{dg('o')},{dg('p')},'{corr}') IS NOT NULL;",'t',role)
 b.check('tenant-rotation-old-binding-denied',"SELECT auth_api.preauth_summary(repeat('n',43));",role=role,failure='42501')
 b.check('tenant-rotation-never-inherits-factor',"SELECT auth_api.preauth_summary(repeat('o',43))->>'state';",'ENROLLMENT_REQUIRED',role)
 b.check('tenant-rotation-preserves-password-proof-deadline',f"SELECT (SELECT expires_at FROM identity_private.preauth WHERE cookie_digest={dg('n')})=(SELECT expires_at FROM identity_private.preauth WHERE cookie_digest={dg('o')});",'t')
 # Failed privileged mutation must not persist grant/audit/policy effects.
 before=b.sql(f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';").stdout.strip()
 service('permission-stale-policy-denied-no-effects',f"SELECT auth_api.set_user_access_rule('{b.V}','{uuid.uuid4()}','edit','users','{b.V}','ALLOW',now(),NULL,0,'{corr}');",'f')
 b.check('denied-policy-unchanged',f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';",before)

 # Existing principal/credential row lock used by every new contract: no fake locks.
 stmt=f"BEGIN;SELECT auth_api.rehash_credential_cas('{b.P}',1,'$argon2id$fixture-not-a-real-password','$argon2id$synthetic-new');COMMIT;"
 with ThreadPoolExecutor(max_workers=2) as ex:results=list(ex.map(lambda _:b.sql(stmt,role),range(2)))
 vals=[r.stdout.strip().splitlines()[-1] if not r.returncode and r.stdout.strip() else None for r in results]
 b.record('credential-CAS-new-contract-concurrency','PASS' if sorted(v for v in vals if v is not None)==['f','t'] else 'FAIL',{'winners':vals.count('t'),'sqlstates':[b.state(r) for r in results if r.returncode]})
 # New function inventory is not full B1 UI/PO acceptance.
 b.REPORT['newFunctionInventory']=len(manifest['functions'])

def backup(b,table_count=30):
 def fingerprint(database):
  tables=b.sql("SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r' ORDER BY 1;",database=database)
  if tables.returncode or len(tables.stdout.splitlines())!=table_count:return None
  parts=["SELECT '"+t+"'||coalesce(md5(string_agg(to_jsonb(r)::text,',' ORDER BY to_jsonb(r)::text)),'') AS f FROM "+t+' r' for t in tables.stdout.splitlines()]
  r=b.sql("SELECT md5(string_agg(f,',' ORDER BY f)) FROM ("+' UNION ALL '.join(parts)+') v;',database=database)
  return r.stdout.strip() if not r.returncode else None
 before=fingerprint('core');dump=b.docker('exec',b.CID,'pg_dump','-U','postgres','-d','core','-Fc','-f','/tmp/pg06.dump')
 b.check('create-owned-restore-db','CREATE DATABASE restored06;')
 restored=b.docker('exec',b.CID,'pg_restore','-U','postgres','--exit-on-error','-d','restored06','/tmp/pg06.dump')
 after=fingerprint('restored06') if not restored.returncode else None
 b.record(f'backup-restore-all{table_count}-tables-integrity','PASS' if dump.returncode==0 and restored.returncode==0 and before is not None and before==after else 'FAIL')
