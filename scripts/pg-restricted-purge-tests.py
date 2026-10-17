"""Authorized PG05 security negatives; fixture/admin assertions separated from service calls."""
from concurrent.futures import ThreadPoolExecutor
import uuid


def run(b):
    table='identity_private.security_log'; helper='identity_private.purge_expired_security_log()'
    purger='cleanops_security_log_purger'; broker='cleanops_auth_broker'
    b.check('PG05-purger-no-login-super-bypass-or-membership',f"SELECT (NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolinherit AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid)) FROM pg_roles r WHERE rolname='{purger}';",'t')
    b.check('PG05-broker-log-insert-only',f"SELECT has_table_privilege('{broker}','{table}','INSERT') AND NOT has_table_privilege('{broker}','{table}','DELETE') AND NOT has_any_column_privilege('{broker}','{table}','SELECT') AND NOT has_any_column_privilege('{broker}','{table}','UPDATE');",'t')
    b.check('PG05-purger-exact-column-rights',f"SELECT has_table_privilege('{purger}','{table}','DELETE') AND NOT has_table_privilege('{purger}','{table}','INSERT') AND NOT has_any_column_privilege('{purger}','{table}','UPDATE') AND NOT has_schema_privilege('{purger}','identity_private','CREATE') AND bool_and(has_column_privilege('{purger}','{table}',a.attname,'SELECT')=(a.attname='expires_at')) FROM pg_attribute a WHERE a.attrelid='{table}'::regclass AND a.attnum>0 AND NOT a.attisdropped;",'t')
    b.check('PG05-helper-owner-signature-void-definer-searchpath',f"SELECT p.proowner='{purger}'::regrole AND p.pronargs=0 AND p.prorettype='void'::regtype AND p.prosecdef AND p.proconfig @> ARRAY['search_path=pg_catalog'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee NOT IN('{purger}'::regrole,'{broker}'::regrole)) FROM pg_proc p WHERE oid='{helper}'::regprocedure;",'t')
    b.check('PG05-force-RLS-distinct-owner',f"SELECT relrowsecurity AND relforcerowsecurity AND relowner<>'{purger}'::regrole AND relowner<>'{broker}'::regrole FROM pg_class WHERE oid='{table}'::regclass;",'t')
    for role in b.ROLE.values():
        b.check(role+'-PG05-cannot-assume-purger',f'SET ROLE {purger};',role=role,failure='42501')
        b.check(role+'-PG05-no-direct-helper',f'SELECT {helper};',role=role,failure='42501')
    for expression in ['expires_at','id','count(*)']:
        b.check('PG05-broker-no-read-'+expression,f'BEGIN;SET LOCAL ROLE {broker};SELECT {expression} FROM {table};ROLLBACK;',failure='42501')
    b.check('PG05-broker-no-direct-delete',f'BEGIN;SET LOCAL ROLE {broker};DELETE FROM {table};ROLLBACK;',failure='42501')
    setup=''
    for i in range(4):
        expiry="now()-interval '1 hour'" if i<2 else "now()+interval '1 hour'"
        setup+=f"INSERT INTO {table} VALUES('{uuid.uuid4()}',decode(repeat('{i%2+1:02x}',32),'hex'),NULL,NULL,'PG05_PURGE_FIXTURE','{uuid.uuid4()}',now()-interval '2 hours',{expiry});"
    b.check('PG05-two-principal-expiry-fixtures',setup)
    b.check('PG05-purger-sees-expired-only',f'BEGIN;SET LOCAL ROLE {purger};SELECT count(expires_at) FROM {table};ROLLBACK;','2')
    b.check('PG05-purger-no-other-log-columns',f'BEGIN;SET LOCAL ROLE {purger};SELECT id FROM {table};ROLLBACK;',failure='42501')
    b.check('PG05-purger-cannot-delete-future',f'BEGIN;SET LOCAL ROLE {purger};DELETE FROM {table} WHERE expires_at>statement_timestamp();ROLLBACK;')
    b.check('PG05-future-records-remain',f"SELECT count(*) FROM {table} WHERE event_code='PG05_PURGE_FIXTURE' AND expires_at>now();",'2')
    b.check('PG05-purger-cannot-update',f'BEGIN;SET LOCAL ROLE {purger};UPDATE {table} SET expires_at=now();ROLLBACK;',failure='42501')
    b.check('PG05-functional-GC-rollback','BEGIN;SELECT auth_api.gc_ephemeral();ROLLBACK;',role=b.ROLE['maintenance'])
    b.check('PG05-rollback-keeps-expired',f"SELECT count(*) FROM {table} WHERE event_code='PG05_PURGE_FIXTURE' AND expires_at<=now();",'2')
    def collect(_):return b.sql('BEGIN;SELECT auth_api.gc_ephemeral();COMMIT;',b.ROLE['maintenance'])
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(collect,range(2)))
    b.record('PG05-concurrent-GC-returns-no-data','PASS' if all(not r.returncode and not r.stdout.strip() for r in results) else 'FAIL')
    b.check('PG05-expired-deleted-future-preserved',f"SELECT count(*) FILTER(WHERE expires_at<=now())||':'||count(*) FILTER(WHERE expires_at>now()) FROM {table} WHERE event_code='PG05_PURGE_FIXTURE';",'0:2')
