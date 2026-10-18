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
  for role in [b.ROLE['identity'],b.ROLE['runtime'],b.ROLE['mail']]:b.check('AUTHZ-execute-'+sig+'-'+role,f"SELECT has_function_privilege(current_user,{oid},'EXECUTE');",'t' if role==b.ROLE['identity'] and sig.startswith(('access_detail','effective_access')) else 'f',role)
 sig='auth_api.change_access_owned(jsonb,bytea,bytea,uuid)'
 b.check('SQL11-exact-new-owner-definer-searchpath-public',f"SELECT proowner='cleanops_auth_broker'::regrole AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND NOT EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0) FROM pg_proc WHERE oid='{sig}'::regprocedure;",'t')
 for role in [*b.ROLE.values(),'pgtest_verifier']:
  b.check('SQL11-new-execute-'+role,f"SELECT has_function_privilege(current_user,'{sig}','EXECUTE');",'t' if role==b.ROLE['identity'] else 'f',role)
 b.check('SQL11-service-not-owner-or-bypass',f"SELECT NOT rolsuper AND NOT rolbypassrls AND NOT pg_has_role(oid,'cleanops_auth_broker','MEMBER') FROM pg_roles WHERE rolname='{b.ROLE['identity']}';",'t')
 return all(c['status']=='PASS' for c in b.REPORT['checks'][start:])


def run(b):
 import json
 def q(value):return "'"+str(value).replace("'","''")+"'"
 def digest(value):return "crypto.digest(convert_to("+q(value)+",'UTF8'),'sha256')"
 def policy():return b.sql(f"SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}';").stdout.strip()
 def body(role,label='Synthetic audited role'):
  return {'operation':'ROLE','role_id':role,'label':label,'expected_policy':policy(),'reason':'Synthetic isolated AUTHZ validation'}
 def statement(payload,key,corr,reserve=True,token='a',ending='COMMIT;'):
  k=digest(key);h=digest(json.dumps(payload,sort_keys=True))
  return f"BEGIN;SELECT auth_api.begin_verified_context(repeat('{token}',43));"+(f"SELECT auth_api.reserve_owned(NULL,'changeAccess',{k},{h},true)->>'replay';" if reserve else '')+f"SELECT (auth_api.change_access_owned({q(json.dumps(payload))}::jsonb,{k},{h},'{corr}')->>'changed')::boolean;"+(f"SELECT auth_api.discard_owned(NULL,'changeAccess',{k},{h});" if reserve else '')+ending
 role=str(uuid.uuid4());resource=str(uuid.uuid4());corr=str(uuid.uuid4())
 b.check('SQL11-synthetic-operator-and-revoked-role',f"INSERT INTO app.access_rules VALUES('{b.A}','{uuid.uuid4()}',NULL,'{b.U}','manage_permissions','access',NULL,'ALLOW',clock_timestamp(),NULL,NULL);INSERT INTO app.access_resources VALUES('{b.A}','{resource}','finance',NULL);INSERT INTO app.access_roles VALUES('{b.A}','{role}','Synthetic privileged revoked role',clock_timestamp());INSERT INTO app.access_rules VALUES('{b.A}','{uuid.uuid4()}','{role}',NULL,'export','finance','{resource}','ALLOW',clock_timestamp(),NULL,NULL);INSERT INTO app.access_role_memberships VALUES('{b.A}','{role}','{b.V}',clock_timestamp(),NULL,NULL);INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{b.U}','{b.S}','B1-SELF-06',clock_timestamp(),clock_timestamp()+interval '5m',(SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}'));")
 p=body(role)
 b.check('SQL11-missing-owned-reservation-denied',statement(p,'missing',corr,False),role=b.ROLE['identity'],failure='P0001')
 b.check('SQL11-foreign-tenant-context-cannot-use-actor-reservation',statement(p,'foreign',str(uuid.uuid4()),token='d'),'false\nf\nt',b.ROLE['identity'])
 b.check('SQL11-reactivation-no-overdelegation',statement(p,'reactivation',corr),'false\nf\nt',b.ROLE['identity'])
 b.check('SQL11-reactivation-leaves-role-revoked',f"SELECT revoked_at IS NOT NULL FROM app.access_roles WHERE tenant_id='{b.A}' AND id='{role}';",'t')
 b.check('SQL11-reactivation-target-no-gained-permission',f"BEGIN;SELECT auth_api.begin_verified_context(repeat('c',43));SELECT auth_api.effective_access('export','finance','{resource}');COMMIT;",'f',b.ROLE['identity'])
 b.check('SQL11-denial-audit-durable-private-server-actor',f"SELECT count(*)=1 AND bool_and(actor_user_id='{b.U}' AND outcome='DENY' AND safe_metadata->>'operation'='ROLE' AND safe_metadata->>'reason'='Synthetic isolated AUTHZ validation' AND safe_metadata->'before'='null'::jsonb AND safe_metadata->'after'='null'::jsonb AND resource_id IS NULL) FROM app.audit_logs WHERE correlation_id='{corr}' AND action='auth.access.denied';",'t')
 new=str(uuid.uuid4());success=str(uuid.uuid4());p=body(new)
 b.check('SQL11-authorized-role-creation',statement(p,'success',success),'false\nt\nt',b.ROLE['identity'])
 b.check('SQL11-success-audit-server-derived-before-after',f"SELECT count(*)=1 AND bool_and(actor_user_id='{b.U}' AND outcome='SUCCESS' AND safe_metadata->>'operation'='ROLE' AND safe_metadata->>'reason'='Synthetic isolated AUTHZ validation' AND safe_metadata->'before'->'role'='null'::jsonb AND safe_metadata->'after'->'role'->>'id'='{new}') FROM app.audit_logs WHERE correlation_id='{success}' AND action='auth.access.change.detail';",'t')
 stale=str(uuid.uuid4())
 b.check('SQL11-stale-CAS-durable-denial',statement(p,'stale',stale),'false\nf\nt',b.ROLE['identity'])
 b.check('SQL11-stale-CAS-audit-persists',f"SELECT EXISTS(SELECT 1 FROM app.audit_logs WHERE correlation_id='{stale}' AND outcome='DENY');",'t')
 rollback=str(uuid.uuid4());rc=str(uuid.uuid4());p=body(rollback)
 b.check('SQL11-functional-rollback',statement(p,'rollback',rc,ending='ROLLBACK;'),'false\nt\nt',b.ROLE['identity'])
 b.check('SQL11-rollback-no-effect-or-audit',f"SELECT NOT EXISTS(SELECT 1 FROM app.access_roles WHERE id='{rollback}') AND NOT EXISTS(SELECT 1 FROM app.audit_logs WHERE correlation_id='{rc}');",'t')
 # Actual legacy calls, not just has_function_privilege introspection.
 b.check('SQL11-old-role-entrypoint-execution-denied',f"BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));SELECT auth_api.set_access_role('{new}','Forbidden legacy',{policy()},'{uuid.uuid4()}');COMMIT;",role=b.ROLE['identity'],failure='42501')
