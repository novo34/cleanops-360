"""Targeted approved AUTHZ function/role gate on exact SQL10; synthetic fixtures only."""
import uuid

def gate(b,table_count=31):
 start=len(b.REPORT['checks'])
 for table in ['access_rules','access_roles','access_role_memberships','access_resources']:
  b.check('AUTHZ-forced-RLS-'+table,f"SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='app.{table}'::regclass;",'t')
  for role in [*b.ROLE.values(),'pgtest_verifier']:
   b.check('AUTHZ-no-direct-SELECT-'+table+'-'+role,f'SELECT * FROM app.{table};',role=role,failure='42501')
   b.check('AUTHZ-no-direct-write-'+table+'-'+role,f'DELETE FROM app.{table};',role=role,failure='42501')
 for sig in ['set_user_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid)','set_access_role(uuid,text,bigint,uuid)','set_role_membership(uuid,uuid,timestamptz,timestamptz,bigint,uuid)','set_role_access_rule(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,bigint,uuid)','revoke_access_assignment(text,uuid,uuid,bigint,uuid)','access_detail(uuid)','effective_access(text,text,uuid)']:
  oid=b.sql("SELECT 'auth_api."+sig+"'::regprocedure::oid;").stdout.strip()
  b.check('AUTHZ-exact-definer-'+sig,f"SELECT proowner='cleanops_auth_broker'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog'] AND NOT EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid={oid};",'t')
  for role in [b.ROLE['identity'],b.ROLE['runtime'],b.ROLE['mail']]:b.check('AUTHZ-execute-'+sig+'-'+role,f"SELECT has_function_privilege(current_user,{oid},'EXECUTE');",'t' if role==b.ROLE['identity'] else 'f',role)
 return all(c['status']=='PASS' for c in b.REPORT['checks'][start:])

def audit_acceptance(b):
 # Actual required audit contract: before/after, actor and reason, plus relevant denied changes.
 # This is an acceptance assertion, not a predicate changed to bless incomplete count-only logs.
 corr=str(uuid.uuid4());rule=str(uuid.uuid4())
 b.check('AUTHZ-synthetic-audit-target-resource',f"INSERT INTO app.access_resources VALUES('{b.A}','{b.V}','users',NULL) ON CONFLICT DO NOTHING;")
 b.check('AUTHZ-synthetic-audit-operator',f"INSERT INTO app.access_rules VALUES('{b.A}','{uuid.uuid4()}',NULL,'{b.U}','manage_permissions','access',NULL,'ALLOW',clock_timestamp(),NULL,NULL);INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{b.U}','{b.S}','B1-SELF-06',clock_timestamp(),clock_timestamp()+interval '5m',(SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}'));")
 version=b.sql(f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';").stdout.strip()
 stmt=f"SELECT auth_api.set_user_access_rule('{b.V}','{rule}','view','users','{b.V}','DENY',clock_timestamp(),NULL,{version},'{corr}');"
 b.check('AUTHZ-real-sensitive-change-for-audit',"BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));"+stmt+'COMMIT;','t',b.ROLE['identity'])
 b.check('AUTHZ-required-before-after-reason-in-durable-audit',f"SELECT coalesce(bool_and(actor_user_id IS NOT NULL AND safe_metadata ?& ARRAY['before','after','reason']),false) FROM app.audit_logs WHERE tenant_id='{b.A}' AND correlation_id='{corr}' AND action='auth.access.change';",'t')
 b.check('AUTHZ-real-denied-stale-change',"BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));"+stmt+'COMMIT;','f',b.ROLE['identity'])
 b.check('AUTHZ-required-denied-sensitive-change-in-durable-audit',f"SELECT EXISTS(SELECT 1 FROM app.audit_logs WHERE tenant_id='{b.A}' AND correlation_id='{corr}' AND outcome='DENY');",'t')
 # Related no-overdelegation regression: reactivating a revoked role must not
 # restore powers which the operator does not possess. No implicit admin label.
 role_id=str(uuid.uuid4());resource=str(uuid.uuid4());reactivate_corr=str(uuid.uuid4())
 b.check('AUTHZ-synthetic-revoked-privileged-role',f"INSERT INTO app.access_resources VALUES('{b.A}','{resource}','finance',NULL);INSERT INTO app.access_roles VALUES('{b.A}','{role_id}','Synthetic previously revoked privileged role',clock_timestamp());INSERT INTO app.access_rules VALUES('{b.A}','{uuid.uuid4()}','{role_id}',NULL,'export','finance','{resource}','ALLOW',clock_timestamp(),NULL,NULL);INSERT INTO app.access_role_memberships VALUES('{b.A}','{role_id}','{b.V}',clock_timestamp(),NULL,NULL);INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{b.U}','{b.S}','B1-SELF-06',clock_timestamp(),clock_timestamp()+interval '5m',(SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}'));")
 b.check('AUTHZ-operator-does-not-have-target-role-power',f"BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));SELECT auth_api.effective_access('export','finance','{resource}');COMMIT;",'f',b.ROLE['identity'])
 b.check('AUTHZ-revoked-role-has-no-effective-power',f"BEGIN;SELECT auth_api.begin_verified_context(repeat('c',43));SELECT auth_api.effective_access('export','finance','{resource}');COMMIT;",'f',b.ROLE['identity'])
 version=b.sql(f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';").stdout.strip()
 b.check('AUTHZ-reactivation-cannot-delegate-above-operator',f"BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));SELECT auth_api.set_access_role('{role_id}','Synthetic reactivation',{version},'{reactivate_corr}');COMMIT;",'f',b.ROLE['identity'])
 b.check('AUTHZ-target-must-not-gain-power-by-role-reactivation',f"BEGIN;SELECT auth_api.begin_verified_context(repeat('c',43));SELECT auth_api.effective_access('export','finance','{resource}');COMMIT;",'f',b.ROLE['identity'])
