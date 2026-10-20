#!/usr/bin/env python3
"""Bounded static authorization/ACL precheck; no database or Docker execution."""
import hashlib
import importlib.util
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BLOB='099345e43c03a2ee3759fa0c2d5ef875121621fc'
SHA='4c304916a76a700e37a069c947426874d73dace0016f3d2a5d3504ce9ba05456'
def verify():
 p=ROOT/'docs/proposals/b1-consolidated-sql/revisions/07';raw=(p/'schema.review.sql').read_bytes()
 assert hashlib.sha256(raw).hexdigest()==SHA
 assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==BLOB
 spec=importlib.util.spec_from_file_location('e107',ROOT/'scripts/consolidate-b1-e1.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 for name,value in m.generate('07').items():assert (p/name).read_text()==value,name
 delta=(p/'APPROVED_06_TO_07.diff').read_text();added=[l[1:] for l in delta.splitlines() if l.startswith('+') and not l.startswith('+++')]
 grants=[l for l in added if re.match(r'\s*GRANT\b',l)]
 assert grants==['GRANT UPDATE(version) ON app.policy_versions TO cleanops_auth_broker;','GRANT UPDATE(credential_version) ON identity_private.credentials TO cleanops_auth_broker;']
 assert not any(re.search(r'\bCREATE ROLE\b|\bCREATE POLICY\b|\bALTER POLICY\b|\bDISABLE ROW LEVEL\b|\bNO FORCE\b|\bBYPASSRLS\b',l) for l in added)
 sql=raw.decode();src=(p/'e1-source.review.sql').read_text();oldsrc=(p.with_name('06')/'e1-source.review.sql').read_text()
 public=lambda t:re.findall(r'CREATE FUNCTION (auth_api\.[^(]+\([^)]*\))',t)
 assert public(src)==public(oldsrc)
 assert 'REVOKE ALL ON FUNCTION identity_private.lock_pair_nowait(uuid,uuid) FROM PUBLIC;' in sql
 assert 'GRANT EXECUTE ON FUNCTION identity_private.lock_pair_nowait' not in sql
 for role in ['cleanops_identity_service','cleanops_runtime','cleanops_mail_worker','cleanops_recipient_verifier']:
  assert not any(re.match(r'GRANT\b',l) and (' TO '+role) in l for l in added)
 for name in ['set_user_access_rule','set_access_role','set_role_membership','set_role_access_rule','revoke_access_assignment']:
  body=src.split('CREATE FUNCTION auth_api.'+name+'(')[1].split('END $fn$;')[0]
  assert 'effective_access' in body and 'c.tenant_id' in body and 'expected_policy' in body
 body=src.split('CREATE FUNCTION auth_api.reset_password_cas(')[1].split('END $fn$;')[0]
 assert 'r.principal_id' in body and 'r.credential_version IS DISTINCT FROM expected_version' in body and 'recovery_hash' in body and 'r.admin_policy_version' in body
 result={'status':'PASS_STATIC_PREINSTALL_SCOPE','gitBlob':BLOB,'sha256':SHA,'bytes':len(raw),'exactDeltaReproduced':True,'newGrants':grants,'newDirectServiceGrants':[],'newPublicSQLSignatures':[],'newPrivateHelper':'identity_private.lock_pair_nowait(uuid,uuid)','RLS_Owners_Memberships_Unchanged':True,'broker':'NOLOGIN_NOBYPASSRLS_NO_SERVICE_MEMBERSHIP','limits':'Static proof of exact bounded delta, not native ACL/tenant/concurrency proof. Native negative gate required immediately after install.'}
 return result
if __name__=='__main__':print(json.dumps(verify(),indent=2))
