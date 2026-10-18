"""Native09 owned BOOTSTRAP protocol; no privilege or SQL repairs."""
import hashlib
from concurrent.futures import ThreadPoolExecutor
import uuid

def gate(b):
 start=len(b.REPORT['checks']);role=b.ROLE['identity']
 raw=uuid.uuid4().hex+'b'*11;csrf=uuid.uuid4().hex+'c'*11
 dg=lambda v:"decode('"+hashlib.sha256(v.encode()).hexdigest()+"','hex')"
 key=dg('owned09-key');request=dg('owned09-keyed-request');corr=str(uuid.uuid4())
 oid=b.sql("SELECT 'auth_api.reserve_reset_owned(text,text,bytea,bytea)'::regprocedure::oid;").stdout.strip()
 if not oid.isdigit():raise RuntimeError('SQL09_FUNCTION_MISSING')
 b.check('09-owner-definer-pinned-path-no-PUBLIC',f"SELECT proowner='cleanops_auth_broker'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog'] AND NOT EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid={oid};",'t')
 b.check('09-broker-not-assumable-login',"SELECT count(*) FROM pg_roles WHERE rolcanlogin AND NOT rolsuper AND pg_has_role(oid,'cleanops_auth_broker','MEMBER');",'0')
 for caller in [*b.ROLE.values(),'pgtest_verifier']:
  b.check('09-execute-matrix-'+caller,f"SELECT has_function_privilege(current_user,{oid},'EXECUTE');",'t' if caller==role else 'f',caller)
  b.check('09-no-direct-reservation-table-'+caller,'SELECT * FROM identity_private.ceremony_idempotency;',role=caller,failure='42501')
  b.check('09-no-broker-assumption-'+caller,'SET ROLE cleanops_auth_broker;',role=caller,failure='42501')
  if caller!=role:b.check('09-direct-entry-denied-'+caller,f"SELECT auth_api.reserve_reset_owned('{raw}','{csrf}',{key},{request});",role=caller,failure='42501')
 b.check('09-real-bootstrap',f"SELECT auth_api.bootstrap_csrf({dg(raw)},{dg(csrf)});",role=role)
 reserve=lambda k=key,h=request,c=csrf:f"SELECT auth_api.reserve_reset_owned('{raw}','{c}',{k},{h});"
 for label,stmt in [('csrf',reserve(c='x'*43)),('malformed-key',reserve(k="decode('ab','hex')")),('unknown-bootstrap',reserve().replace(raw,'z'*43))]:
  b.check('09-invalid-'+label,stmt,role=role,failure='42501')
 b.check('09-bootstrap-is-not-ACTIVE',f"SELECT auth_api.issue_active_session('{raw}',{dg('new')},{dg('new-csrf')},28800,1800,'Synthetic','Synthetic','{corr}');",role=role,failure='42501')
 b.check('09-bootstrap-is-not-reset-proof',f"SELECT auth_api.reset_password_cas({dg('unknown-ticket')},1,NULL,'$argon2id$synthetic','{corr}');",'f',role)
 finish=f"SELECT auth_api.complete_owned('{raw}','resetPassword',{key},{request},NULL);"
 b.check('09-owned-rollback',"BEGIN;"+reserve()+finish+'ROLLBACK;',role=role)
 b.check('09-no-marker-after-rollback',f"SELECT count(*) FROM identity_private.ceremony_idempotency WHERE binding_digest={dg(raw)};",'0')
 b.check('09-owned-completion','BEGIN;'+reserve()+finish+'COMMIT;',role=role)
 b.check('09-one-time-replay-denied',reserve(),role=role,failure='P0001')
 b.check('09-same-key-changed-request-denied',reserve(h=dg('different-request')),role=role,failure='P0001')
 other=dg('foreign-owner-key');b.check('09-foreign-owner-fixture',reserve(k=other),role=role)
 b.check('09-new-xid-cannot-finish',f"SELECT auth_api.complete_owned('{raw}','resetPassword',{other},{request},NULL);",role=role,failure='P0001')
 b.check('09-new-xid-cannot-discard',f"SELECT auth_api.discard_owned('{raw}','resetPassword',{other},{request});",role=role,failure='P0001')
 racekey=dg('race-key');stmt='BEGIN;'+reserve(k=racekey)+f"SELECT auth_api.complete_owned('{raw}','resetPassword',{racekey},{request},NULL);COMMIT;"
 with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:b.sql(stmt,role),range(2)))
 b.record('09-concurrent-reservation-one-winner','PASS' if sum(r.returncode==0 for r in results)==1 and all(r.returncode==0 or b.state(r)=='P0001' for r in results) else 'FAIL')
 b.check('09-expire-synthetic-bootstrap',f"UPDATE identity_private.csrf_bootstrap SET expires_at=clock_timestamp()-interval '1s' WHERE cookie_digest={dg(raw)};")
 b.check('09-expired-bootstrap-denied',reserve(k=dg('expired-key')),role=role,failure='42501')
 return all(c['status']=='PASS' for c in b.REPORT['checks'][start:])
