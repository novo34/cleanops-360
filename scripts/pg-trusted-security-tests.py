"""Targeted trusted-device privilege regression on unchanged approved SQL09."""
import uuid
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
 return all(c['status']=='PASS' for c in b.REPORT['checks'][start:])
