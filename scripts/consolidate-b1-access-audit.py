#!/usr/bin/env python3
"""Consolidated11 proposal only; immutable approved10 retained, no SQL execution."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DEST=ROOT/'docs/proposals/b1-consolidated-sql/revisions/11'
SOURCE=ROOT/'docs/proposals/b1-consolidated-sql/revisions/10/schema.review.sql'
BLOB10='68c0545f79cf15fa780566ebf4aab14b3ccb892b';SHA10='d95e9896ebd12f840f00c12c97ffb9e8b17f3cfe28052655d7f4c4e80d3f5e4b'
def blob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def generate():
 raw=SOURCE.read_bytes()
 if blob(raw)!=BLOB10 or hashlib.sha256(raw).hexdigest()!=SHA10:raise RuntimeError('AUTHORIZED10_SOURCE_CHANGED')
 source=raw.decode();extension=(DEST/'access-owned.review.sql').read_text()
 if not source.endswith('COMMIT;\n'):raise RuntimeError('UNEXPECTED10_TRANSACTION_END')
 full=source[:-len('COMMIT;\n')]+extension+'\nCOMMIT;\n';data=full.encode();diff=''.join(difflib.unified_diff(source.splitlines(True),full.splitlines(True),fromfile='authorized-SQL10',tofile='REVIEW-ONLY-SQL11'))
 manifest={'candidate':'PG-TEST-01-CONSOLIDATED-11','status':'REVIEW ONLY','installationAuthorized':False,'source':{'gitBlob':BLOB10,'sha256':SHA10},'candidateArtifact':{'gitBlob':blob(data),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'path':str((DEST/'schema.review.sql').relative_to(ROOT))},'fullDiff':{'path':str((DEST/'SQL10_TO_SQL11.diff').relative_to(ROOT)),'sha256':hashlib.sha256(diff.encode()).hexdigest()},'newSignature':'auth_api.change_access_owned(jsonb,bytea,bytea,uuid) RETURNS jsonb','owner':'cleanops_auth_broker','securityDefiner':True,'searchPath':'pg_catalog','executeOnly':'cleanops_identity_service','legacyMutationExecuteRevocations':['set_user_access_rule','set_access_role','set_role_membership','set_role_access_rule','revoke_access_assignment'],'existingFunctionBodiesChanged':[],'tableChanges':[],'roleChanges':[],'rlsChanges':[],'directTablePrivilegeChanges':[],'securityScope':'Mandatory owned reservation, durable before/after/actor/reason and DENY audit, and no-overdelegation on revoked-role reactivation; no productive grants or runtime activation.','runtime':'closedBackend','B1':'OPEN','AUTH-GATE-05':'OPEN'}
 return {'schema.review.sql':full,'SQL10_TO_SQL11.diff':diff,'manifest.json':json.dumps(manifest,indent=2)+'\n'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
 for name,content in generate().items():
  path=DEST/name
  if args.check:
   if not path.exists() or path.read_text()!=content:raise RuntimeError('SQL11_REPRODUCIBILITY_MISMATCH:'+name)
  else:path.write_text(content)
 print('SQL11 REVIEW ONLY reproducibility PASS; no SQL executed')
