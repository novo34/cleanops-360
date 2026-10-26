#!/usr/bin/env python3
"""One minimal consolidated12 proposal. Never installs or executes SQL."""
import argparse
import hashlib
import difflib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DEST=ROOT/'docs/proposals/b1-consolidated-sql/revisions/12';SOURCE=ROOT/'docs/proposals/b1-consolidated-sql/revisions/11/schema.review.sql'
BLOB='3f13bb1132c5b1ffdd35d4993bb9aa2ca3c75f06';SHA='54f9c0d94441ed3f72f6dc1c3d4d9bca1b9f0072a7d0f7c6059debe80eea9d6e'
def blob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def generate():
 raw=SOURCE.read_bytes()
 if blob(raw)!=BLOB or hashlib.sha256(raw).hexdigest()!=SHA:raise RuntimeError('EXACT_AUTHORIZED11_SOURCE_MISMATCH')
 original=raw.decode();assert original.endswith('COMMIT;\n')
 extension=(DEST/'preauth-selection.review.sql').read_text();full=original[:-len('COMMIT;\n')]+extension+'\nCOMMIT;\n';data=full.encode()
 diff=''.join(difflib.unified_diff(original.splitlines(True),full.splitlines(True),fromfile='authorized-SQL11',tofile='REVIEW-ONLY-SQL12'))
 manifest={'candidate':'PG-TEST-01-CONSOLIDATED-12','status':'REVIEW ONLY','installationAuthorized':False,'source':{'gitBlob':BLOB,'sha256':SHA},'candidateArtifact':{'gitBlob':blob(data),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'path':str((DEST/'schema.review.sql').relative_to(ROOT))},'fullDiff':{'path':str((DEST/'SQL11_TO_SQL12.diff').relative_to(ROOT)),'sha256':hashlib.sha256(diff.encode()).hexdigest()},'newSignature':'auth_api.select_tenant_rotated_owned(text,bytea,bytea,uuid,bytea,bytea,uuid) RETURNS jsonb','existingFunctionBodiesChanged':[],'tableChanges':[],'roleChanges':[],'rlsChanges':[],'directTablePrivilegeChanges':[],'newFunctionAcl':{'owner':'cleanops_auth_broker','securityDefiner':True,'searchPath':'pg_catalog','publicExecute':False,'executeOnly':'cleanops_identity_service'},'runtime':'closedBackend','B1':'OPEN','AUTH-GATE-05':'OPEN'}
 return {'schema.review.sql':full,'SQL11_TO_SQL12.diff':diff,'manifest.json':json.dumps(manifest,indent=2)+'\n'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
 for name,content in generate().items():
  target=DEST/name
  if args.check:
   if not target.exists() or target.read_text()!=content:raise RuntimeError('SQL12_REPRODUCIBILITY_MISMATCH:'+name)
  else:target.write_text(content)
 print('SQL12 REVIEW ONLY reproducibility PASS; no SQL executed')
