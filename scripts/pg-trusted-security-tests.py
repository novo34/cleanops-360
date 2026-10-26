"""Targeted trusted-device privilege regression on unchanged approved SQL09."""
import uuid
from concurrent.futures import ThreadPoolExecutor
def gate(b,table_count=31):
 start=len(b.REPORT['checks'])
 b.check('trusted-forced-RLS',"SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='app.trusted_devices'::regclass;",'t')
 for caller in [*b.ROLE.values(),'pgtest_verifier']:
  b.check('trusted-no-direct-SELECT-'+caller,'SELECT * FROM app.trusted_devices;',role=caller,failure='42501')
  b.check('trusted-no-direct-DELETE-'+caller,'DELETE FROM app.trusted_devices;',role=caller,failure='42501')
  b.check('trusted-no-direct-INSERT-'+caller,"INSERT INTO app.trusted_devices DEFAULT VALUES;",role=caller,failure='42501')
  b.check('trusted-no-role-escalation-'+caller,'SET ROLE cleanops_auth_broker;',role=caller,failure='42501')
 for sig,args in [('register_trusted_device(bytea,uuid)',"decode(repeat('01',32),'hex'),'"+str(uuid.uuid4())+"'"),('trusted_device_valid(bytea)',"decode(repeat('02',32),'hex')"),('revoke_trusted_device(uuid,uuid)',"'"+str(uuid.uuid4())+"','"+str(uuid.uuid4())+"'"),('admin_revoke_trusted_devices(uuid,uuid)',"'"+str(uuid.uuid4())+"','"+str(uuid.uuid4())+"'")]:
  oid=b.sql("SELECT 'auth_api."+sig+"'::regprocedure::oid;").stdout.strip()
  b.check('trusted-fixed-definer-'+sig,f"SELECT proowner='cleanops_auth_broker'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog'] AND NOT EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid={oid};",'t')
  for caller in [*b.ROLE.values(),'pgtest_verifier']:
   b.check('trusted-execute-'+sig+'-'+caller,f"SELECT has_function_privilege(current_user,{oid},'EXECUTE');",'t' if caller==b.ROLE['identity'] else 'f',caller)
  b.check('trusted-no-unbound-call-'+sig,'SELECT auth_api.'+sig.split('(')[0]+'('+args+');',role=b.ROLE['identity'],failure='42501')
 # Reproduce the actual registration constraint under its real service role.
 # Synthetic policy/evidence setup only; no DDL, substitute grants or production inputs.
 b.check('trusted-synthetic-policy',f"INSERT INTO app.auth_preferences VALUES('{b.A}',true) ON CONFLICT(tenant_id) DO UPDATE SET trusted_devices_enabled=true;")
 b.check('trusted-synthetic-fresh-MFA',f"INSERT INTO app.step_up_evidence(tenant_id,id,user_id,session_id,grant_key,verified_at,expires_at,policy_version) VALUES('{b.A}','{uuid.uuid4()}','{b.U}','{b.S}','B1-SELF-06',clock_timestamp(),clock_timestamp()+interval '5m',(SELECT version FROM app.policy_versions WHERE tenant_id='{b.A}'));")
 results=[]
 for _ in range(32):
  digest=uuid.uuid4().hex+uuid.uuid4().hex
  result=b.sql("BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));SELECT auth_api.register_trusted_device(decode('"+digest+"','hex'),'"+str(uuid.uuid4())+"');ROLLBACK;",b.ROLE['identity'])
  results.append({'ok':result.returncode==0,'sqlstate':None if result.returncode==0 else b.state(result)})
 failed=[r for r in results if not r['ok']]
 b.record('trusted-registration-exact-30day-constraint','FAIL' if failed else 'PASS',{'attempts':32,'successRolledBack':sum(r['ok'] for r in results),'failed':len(failed),'sqlstates':sorted(set(r['sqlstate'] for r in failed)),'expectedFailures':0,'additionalSqlAclInstalled':False})
 # Boundary fixtures test the unchanged database CHECK; no DDL or control disabling.
 at="'2030-01-01T00:00:00Z'::timestamptz"
 def fixture(duration):return f"BEGIN;INSERT INTO app.trusted_devices VALUES('{b.A}','{uuid.uuid4()}','{b.U}','{b.P}',decode('{uuid.uuid4().hex+uuid.uuid4().hex}','hex'),1,{at},{at}+interval '{duration}',NULL);ROLLBACK;"
 b.check('trusted-CHECK-exact30days',fixture('30 days'))
 b.check('trusted-CHECK-over30days-by-microsecond',fixture('30 days 0.000001 seconds'),failure='23514')
 b.check('trusted-CHECK-zero-duration',fixture('0 seconds'),failure='23514')
 # Verify actual function's stored pair in one transaction using fixture-owner inspection.
 # The function still executes under the identity service; inspection is a separate post-COMMIT fixture assertion.
 digest=uuid.uuid4().hex+uuid.uuid4().hex
 b.check('trusted-real-registration-persisted',"BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));SELECT auth_api.register_trusted_device(decode('"+digest+"','hex'),'"+str(uuid.uuid4())+"');COMMIT;",role=b.ROLE['identity'])
 b.check('trusted-real-registration-exact30days',"SELECT expires_at=created_at+interval '30 days' FROM app.trusted_devices WHERE token_digest=decode('"+digest+"','hex');",'t')
 def concurrent(_):return b.sql("BEGIN;SELECT auth_api.begin_verified_context(repeat('a',43));SELECT auth_api.register_trusted_device(decode('"+uuid.uuid4().hex+uuid.uuid4().hex+"','hex'),'"+str(uuid.uuid4())+"');ROLLBACK;",b.ROLE['identity'])
 with ThreadPoolExecutor(max_workers=4) as pool:parallel=list(pool.map(concurrent,range(8)))
 b.record('trusted-concurrent-registration-no-clock-constraint-failure','PASS' if all(r.returncode==0 for r in parallel) else 'FAIL',{'attempts':8,'sqlstates':[b.state(r) for r in parallel if r.returncode]})
 return all(c['status']=='PASS' for c in b.REPORT['checks'][start:])
