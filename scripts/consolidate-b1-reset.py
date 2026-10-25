#!/usr/bin/env python3
"""One complete reproducible SQL08 REVIEW ONLY candidate; NEVER executes SQL."""
import argparse
import difflib
import hashlib
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'docs/proposals/b1-consolidated-sql/revisions/08'
BASE=DEST.with_name('07')/'schema.review.sql'
def hashes(raw):
 return {'gitBlob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
BINDING_DDL="""-- Durable recovery authorization: expiration never grants a password-only fallback.
CREATE TABLE identity_private.recovery_enrollments (
 tenant_id uuid NOT NULL,user_id uuid NOT NULL,principal_id uuid NOT NULL,
 cookie_digest bytea NOT NULL CHECK(octet_length(cookie_digest)=32),
 credential_version bigint NOT NULL CHECK(credential_version>0),created_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id,principal_id) REFERENCES app.users(tenant_id,id,principal_id) ON DELETE RESTRICT
);
ALTER TABLE identity_private.recovery_enrollments OWNER TO cleanops_ddl_owner;
ALTER TABLE identity_private.recovery_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_private.recovery_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY broker_internal ON identity_private.recovery_enrollments TO cleanops_auth_broker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,DELETE ON identity_private.recovery_enrollments TO cleanops_auth_broker;
"""
def bind_recovery(base):
 changes={};text=base
 def change(name,anchor,insertion):
  nonlocal text
  matches=list(re.finditer(r'CREATE (?:OR REPLACE )?FUNCTION '+re.escape(name)+r'\(.*?\$fn\$;',base,re.S))
  if not matches:raise ValueError('MISSING_APPROVED_FUNCTION:'+name)
  old=matches[-1].group()
  if old.count(anchor)!=1:raise ValueError('REVIEWED_INSERTION_DRIFT:'+name)
  new=old.replace(anchor,insertion+anchor)
  if text.count(old)!=1:raise ValueError('AMBIGUOUS_APPROVED_BODY:'+name)
  text=text.replace(old,new);changes[name]=(old,new)
 change('identity_private.checked_preauth',' RETURN q;',""" IF EXISTS(SELECT 1 FROM identity_private.recovery_enrollments AS pending
 WHERE pending.tenant_id=q.tenant_id AND pending.user_id=q.user_id
 AND (pending.principal_id IS DISTINCT FROM q.principal_id
 OR pending.cookie_digest IS DISTINCT FROM q.cookie_digest
 OR pending.credential_version IS DISTINCT FROM q.credential_version))
 THEN RAISE EXCEPTION 'RECOVERY_CONTEXT_REQUIRED' USING ERRCODE='42501'; END IF;
""")
 change('auth_api.recover_to_enrollment'," PERFORM identity_private.append_audit(q.tenant_id,q.user_id,'auth.recovery.enrollment_required'",""" INSERT INTO identity_private.recovery_enrollments(tenant_id,user_id,principal_id,cookie_digest,credential_version,created_at)
 VALUES(q.tenant_id,q.user_id,q.principal_id,new_cookie,q.credential_version,clock_timestamp());
""")
 change('auth_api.issue_active_session'," UPDATE identity_private.preauth SET state='CONSUMED' WHERE id=q.id;",""" DELETE FROM identity_private.recovery_enrollments WHERE tenant_id=q.tenant_id AND user_id=q.user_id
 AND principal_id=q.principal_id AND cookie_digest=q.cookie_digest AND credential_version=q.credential_version;
""")
 change('auth_api.admin_reset_mfa'," UPDATE app.mfa_methods SET state='REVOKED'",""" -- Existing independently attested/admin-authorized reset is the recovery escape path.
 DELETE FROM identity_private.recovery_enrollments WHERE tenant_id=c.tenant_id AND user_id=target;
""")
 change('auth_api.reset_password_cas'," UPDATE identity_private.reset_tickets SET consumed_at=clock_timestamp() WHERE principal_id=r.principal_id AND consumed_at IS NULL;",""" -- A successful independently proven credential reset supersedes old recovery bindings.
 DELETE FROM identity_private.recovery_enrollments WHERE principal_id=r.principal_id;
""")
 anchor='CREATE FUNCTION auth_api.issue_active_session('
 assert text.count(anchor)==1;text=text.replace(anchor,BINDING_DDL+anchor)
 return text,changes
def generate():
 raw=BASE.read_bytes();base=hashes(raw)
 if base['gitBlob']!='099345e43c03a2ee3759fa0c2d5ef875121621fc' or base['sha256']!='4c304916a76a700e37a069c947426874d73dace0016f3d2a5d3504ce9ba05456':raise ValueError('APPROVED07_BYTES_CHANGED')
 source=(DEST/'password-reset-material.review.sql').read_text()
 if re.search(r'(?im)^\s*(?:GRANT|REVOKE|ALTER|DROP|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|EXECUTE|SET\s+ROLE)\b',source) or re.search(r'\b(?:BYPASSRLS|set_config)\b',source):raise ValueError('UNREVIEWED_PRIVILEGE_OR_EFFECT')
 if source.count('CREATE FUNCTION ')!=1 or 'CREATE FUNCTION auth_api.password_reset_material(ticket_digest bytea)' not in source:raise ValueError('UNREVIEWED_SIGNATURE')
 acl='ALTER FUNCTION auth_api.password_reset_material(bytea) OWNER TO cleanops_auth_broker;\nREVOKE ALL ON FUNCTION auth_api.password_reset_material(bytea) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION auth_api.password_reset_material(bytea) TO cleanops_identity_service;\n'
 text=raw.decode();assert text.endswith('COMMIT;\n')
 patched,changes=bind_recovery(text)
 complete='-- CONSOLIDATED-08 REVIEW ONLY. Exact new owner authorization required before installation.\n'+patched[:-len('COMMIT;\n')]+source+acl+'COMMIT;\n'
 diff=''.join(difflib.unified_diff(text.splitlines(True),complete.splitlines(True),fromfile='approved07/schema.review.sql',tofile='review-only08/schema.review.sql'))
 candidate=hashes(complete.encode())
 manifest={'revision':'08','status':'REVIEW_ONLY_NOT_INSTALLED','base':base,'candidate':candidate,'existingSQLSignaturesUnchanged':True,'newSQLSignatures':['auth_api.password_reset_material(bytea)'],'changedFunctionBodies':list(changes),'newTableGrants':['SELECT,INSERT,DELETE ON identity_private.recovery_enrollments TO cleanops_auth_broker'],'newRoles':[],'newRLSPolicies':['identity_private.recovery_enrollments:broker_internal'],'newTables':['identity_private.recovery_enrollments'],'newFunctionOwner':'cleanops_auth_broker','newFunctionExecute':['cleanops_identity_service'],'publicExecute':False,'searchPath':'pg_catalog','diffSha256':hashlib.sha256(diff.encode()).hexdigest()}
 request={'authorization':'PG-TEST-01-CONSOLIDATED-08','ownerApproved':False,'executed':False,'candidate':candidate,'base':base,'changes':['One private ticket-bound reset-material reader','One durable recovery binding table with broker-only SELECT/INSERT/DELETE and forced RLS','Five existing function bodies bind/check/complete recovery or clear it only on independently proven reset; signatures unchanged','Owner/revoke PUBLIC/EXECUTE of reader to identity service only'],'environment':{'postgres':16,'newDockerOnly':True,'network':'none','publicPorts':False,'sharedVolumes':False,'data':'SYNTHETIC_ONLY'},'runtime':'closedBackend','b1':'OPEN','authGate05':'OPEN','production':False,'externalSMTP':False,'merge':False}
 return {'schema.review.sql':complete,'recovery-binding.review.sql':BINDING_DDL+'\n'+'\n'.join(new for old,new in changes.values())+'\n','ACL.delta.sql':'\n'.join(line for line in BINDING_DDL.splitlines() if line.startswith(('ALTER TABLE','CREATE POLICY','GRANT ')))+'\n'+acl,'APPROVED_07_TO_08.diff':diff,'manifest.json':json.dumps(manifest,indent=2)+'\n','EXECUTION_REQUEST.json':json.dumps(request,indent=2)+'\n'}
def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
 for name,content in generate().items():
  if args.check:
   if (DEST/name).read_text()!=content:raise SystemExit('UNREPRODUCIBLE:'+name)
  else:(DEST/name).write_text(content)
 print('SQL08_REVIEW_ONLY_REPRODUCIBLE_NO_EXECUTION')
if __name__=='__main__':main()
