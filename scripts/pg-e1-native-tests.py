"""Real SQL service-role negatives/positives; no substitute grants or security bypass."""
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import uuid

def run(b):
 role=b.ROLE['identity'];mail=b.ROLE['mail'];corr=str(uuid.uuid4());q=lambda x:"'"+str(x).replace("'","''")+"'"
 session=lambda body:"BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));"+body+'COMMIT;'
 def service(name,body,expected=None,failure=None):return b.check(name,session(body),expected,role,failure)
 b.check('catalog30-forced-RLS-tables',"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity;",'30')
 b.check('catalog95-functions44-policies',"SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth_api','identity_private') AND p.prokind='f')=95 AND (SELECT count(*) FROM pg_policies WHERE schemaname IN('app','identity_private'))=44;",'t')
 b.check('all-functions-pinned-path',"SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth_api','identity_private') AND NOT coalesce(p.proconfig,'{}') @> ARRAY['search_path=pg_catalog'];",'0')
 manifest=json.loads((b.ROOT/'docs/proposals/b1-consolidated-sql/revisions/06/manifest.json').read_text())
 for i,f in enumerate(manifest['functions']):
  sig=q(f['signature']);b.check('new-function-owner-acl-'+str(i),f"SELECT p.proowner='cleanops_auth_broker'::regrole AND p.prosecdef AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') FROM pg_proc p WHERE p.oid={sig}::regprocedure;",'t')
  for caller,r in [('identity',role),('mail',mail),('verifier','pgtest_verifier')]:
   expected=f['execute']=={'identity':'cleanops_identity_service','mail':'cleanops_mail_worker','verifier':'cleanops_recipient_verifier'}[caller]
   b.check('new-execute-matrix-'+str(i)+'-'+caller,f"SELECT has_function_privilege(current_user,{sig},'EXECUTE');",'t' if expected else 'f',r)
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
 # Existing principal/credential row lock used by every new contract: no fake locks.
 stmt=f"BEGIN;SELECT auth_api.rehash_credential_cas('{b.P}',1,'$argon2id$fixture-not-a-real-password','$argon2id$synthetic-new');COMMIT;"
 with ThreadPoolExecutor(max_workers=2) as ex:results=list(ex.map(lambda _:b.sql(stmt,role),range(2)))
 vals=[r.stdout.strip().splitlines()[-1] if not r.returncode and r.stdout.strip() else None for r in results]
 b.record('credential-CAS-new-contract-concurrency','PASS' if sorted(v for v in vals if v is not None)==['f','t'] else 'FAIL',{'winners':vals.count('t'),'sqlstates':[b.state(r) for r in results if r.returncode]})
 # Failed privileged mutation must not persist grant/audit/policy effects.
 before=b.sql(f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';").stdout.strip()
 service('permission-mutation-denied-no-escalation',f"SELECT auth_api.set_user_access_rule('{b.V}','{uuid.uuid4()}','edit','users','{b.V}','ALLOW',now(),NULL,1,'{corr}');",'f')
 b.check('denied-policy-unchanged',f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';",before)
 # New function inventory is not full B1 UI/PO acceptance.
 b.REPORT['newFunctionInventory']=len(manifest['functions'])

def backup(b):
 def fingerprint(database):
  tables=b.sql("SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r' ORDER BY 1;",database=database)
  if tables.returncode or len(tables.stdout.splitlines())!=30:return None
  parts=["SELECT '"+t+"'||coalesce(md5(string_agg(to_jsonb(r)::text,',' ORDER BY to_jsonb(r)::text)),'') AS f FROM "+t+' r' for t in tables.stdout.splitlines()]
  r=b.sql("SELECT md5(string_agg(f,',' ORDER BY f)) FROM ("+' UNION ALL '.join(parts)+') v;',database=database)
  return r.stdout.strip() if not r.returncode else None
 before=fingerprint('core');dump=b.docker('exec',b.CID,'pg_dump','-U','postgres','-d','core','-Fc','-f','/tmp/pg06.dump')
 b.check('create-owned-restore-db','CREATE DATABASE restored06;')
 restored=b.docker('exec',b.CID,'pg_restore','-U','postgres','--exit-on-error','-d','restored06','/tmp/pg06.dump')
 after=fingerprint('restored06') if not restored.returncode else None
 b.record('backup-restore-all30-tables-integrity','PASS' if dump.returncode==0 and restored.returncode==0 and before is not None and before==after else 'FAIL')
