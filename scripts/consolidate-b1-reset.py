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
def generate():
 raw=BASE.read_bytes();base=hashes(raw)
 if base['gitBlob']!='099345e43c03a2ee3759fa0c2d5ef875121621fc' or base['sha256']!='4c304916a76a700e37a069c947426874d73dace0016f3d2a5d3504ce9ba05456':raise ValueError('APPROVED07_BYTES_CHANGED')
 source=(DEST/'password-reset-material.review.sql').read_text()
 if re.search(r'(?im)^\s*(?:GRANT|REVOKE|ALTER|DROP|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|EXECUTE|SET\s+ROLE)\b',source) or re.search(r'\b(?:BYPASSRLS|set_config)\b',source):raise ValueError('UNREVIEWED_PRIVILEGE_OR_EFFECT')
 if source.count('CREATE FUNCTION ')!=1 or 'CREATE FUNCTION auth_api.password_reset_material(ticket_digest bytea)' not in source:raise ValueError('UNREVIEWED_SIGNATURE')
 acl='ALTER FUNCTION auth_api.password_reset_material(bytea) OWNER TO cleanops_auth_broker;\nREVOKE ALL ON FUNCTION auth_api.password_reset_material(bytea) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION auth_api.password_reset_material(bytea) TO cleanops_identity_service;\n'
 text=raw.decode();assert text.endswith('COMMIT;\n')
 complete='-- CONSOLIDATED-08 REVIEW ONLY. Exact new owner authorization required before installation.\n'+text[:-len('COMMIT;\n')]+source+acl+'COMMIT;\n'
 diff=''.join(difflib.unified_diff(text.splitlines(True),complete.splitlines(True),fromfile='approved07/schema.review.sql',tofile='review-only08/schema.review.sql'))
 candidate=hashes(complete.encode())
 manifest={'revision':'08','status':'REVIEW_ONLY_NOT_INSTALLED','base':base,'candidate':candidate,'existingSQLSignaturesUnchanged':True,'newSQLSignatures':['auth_api.password_reset_material(bytea)'],'newTableGrants':[],'newRoles':[],'newRLSPolicies':[],'newFunctionOwner':'cleanops_auth_broker','newFunctionExecute':['cleanops_identity_service'],'publicExecute':False,'searchPath':'pg_catalog','diffSha256':hashlib.sha256(diff.encode()).hexdigest()}
 request={'authorization':'PG-TEST-01-CONSOLIDATED-08','ownerApproved':False,'executed':False,'candidate':candidate,'base':base,'changes':['One private ticket-bound reset-material reader','Owner/revoke PUBLIC/EXECUTE to identity service only'],'environment':{'postgres':16,'newDockerOnly':True,'network':'none','publicPorts':False,'sharedVolumes':False,'data':'SYNTHETIC_ONLY'},'runtime':'closedBackend','b1':'OPEN','authGate05':'OPEN','production':False,'externalSMTP':False,'merge':False}
 return {'schema.review.sql':complete,'ACL.delta.sql':acl,'APPROVED_07_TO_08.diff':diff,'manifest.json':json.dumps(manifest,indent=2)+'\n','EXECUTION_REQUEST.json':json.dumps(request,indent=2)+'\n'}
def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
 for name,content in generate().items():
  if args.check:
   if (DEST/name).read_text()!=content:raise SystemExit('UNREPRODUCIBLE:'+name)
  else:(DEST/name).write_text(content)
 print('SQL08_REVIEW_ONLY_REPRODUCIBLE_NO_EXECUTION')
if __name__=='__main__':main()
