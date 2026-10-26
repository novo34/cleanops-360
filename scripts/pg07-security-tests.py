"""New07 column privileges and role/tenant gate, no additional SQL installation."""
import uuid

def gate(b,table_count=30):
 start=len(b.REPORT['checks'])
 policy_oid=b.sql("SELECT 'app.policy_versions'::regclass::oid;").stdout.strip();credential_oid=b.sql("SELECT 'identity_private.credentials'::regclass::oid;").stdout.strip()
 if not policy_oid.isdigit() or not credential_oid.isdigit():raise RuntimeError('CATALOG_OID_LOOKUP_FAILED')
 b.check('07-broker-nonlogin-nobypass',"SELECT (NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole)::text FROM pg_roles WHERE rolname='cleanops_auth_broker';",'true')
 b.check('07-exact-new-column-privileges',"SELECT has_column_privilege('cleanops_auth_broker','app.policy_versions','version','UPDATE') AND has_column_privilege('cleanops_auth_broker','identity_private.credentials','credential_version','UPDATE') AND NOT has_table_privilege('cleanops_auth_broker','app.policy_versions','UPDATE') AND NOT has_table_privilege('cleanops_auth_broker','identity_private.credentials','UPDATE');",'t')
 b.check('07-no-credential-key-update',"SELECT has_column_privilege('cleanops_auth_broker','identity_private.credentials','principal_id','UPDATE');",'f')
 b.check('07-no-security-log-read-delete',"SELECT has_any_column_privilege('cleanops_auth_broker','identity_private.security_log','SELECT') OR has_table_privilege('cleanops_auth_broker','identity_private.security_log','DELETE');",'f')
 b.check(f'07-all{table_count}-tables-forced-RLS',"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN('app','identity_private') AND c.relrowsecurity AND c.relforcerowsecurity;",str(table_count))
 for caller in [*b.ROLE.values(),'pgtest_verifier']:
  b.check('07-no-broker-membership-'+caller,"SELECT pg_has_role(current_user,'cleanops_auth_broker','MEMBER');",'f',caller)
  b.check('07-no-caller-version-write-'+caller,f"SELECT has_column_privilege(current_user,{policy_oid}::oid,'version','UPDATE') OR has_column_privilege(current_user,{credential_oid}::oid,'credential_version','UPDATE');",'f',caller)
  b.check('07-no-direct-private-helper-'+caller,'SELECT identity_private.lock_pair_nowait(NULL,NULL);',role=caller,failure='42501')
 return all(c['status']=='PASS' for c in b.REPORT['checks'][start:])
