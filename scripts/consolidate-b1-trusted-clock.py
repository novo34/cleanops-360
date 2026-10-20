#!/usr/bin/env python3
"""Produce a complete REVIEW ONLY successor; never install or rewrite authorized bytes."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'docs/proposals/b1-consolidated-sql/revisions/09/schema.review.sql'
DEST=ROOT/'docs/proposals/b1-consolidated-sql/revisions/10'
OLD_BLOB='641886171bc24557ff5f49ae6bc7564036efc6b0'
OLD_SHA='660331857de2ea2d1f4c4dfa850361b73f37b807694054b9e0e03acb5d29786a'
def blob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def generate():
 raw=SOURCE.read_bytes()
 if blob(raw)!=OLD_BLOB or hashlib.sha256(raw).hexdigest()!=OLD_SHA:raise RuntimeError('AUTHORIZED09_SOURCE_BYTES_CHANGED')
 source=raw.decode();a=source.index('CREATE FUNCTION auth_api.register_trusted_device(');z=source.index('END $fn$;',a)+len('END $fn$;');before=source[a:z]
 old="DECLARE c identity_private.tx_context;s app.sessions;k uuid:=gen_random_uuid();"
 new=old[:-1]+';registered_at timestamptz;'
 insert=" INSERT INTO app.trusted_devices VALUES(c.tenant_id,k,c.user_id,s.principal_id,token_hash,s.credential_version,clock_timestamp(),clock_timestamp()+interval '30 days',NULL);"
 replacement=" registered_at:=clock_timestamp();\n INSERT INTO app.trusted_devices VALUES(c.tenant_id,k,c.user_id,s.principal_id,token_hash,s.credential_version,registered_at,registered_at+interval '30 days',NULL);"
 if before.count(old)!=1 or before.count(insert)!=1 or before.count('clock_timestamp()')!=2:raise RuntimeError('UNEXPECTED09_FUNCTION_SHAPE')
 after=before.replace(old,new).replace(insert,replacement)
 result=source[:a]+after+source[z:]
 # Every byte outside this existing function remains exactly09, including all ACL/RLS.
 if result.replace(after,before,1)!=source or after.count('clock_timestamp()')!=1:raise RuntimeError('UNEXPECTED_SQL10_SCOPE')
 sql=result.encode();diff=''.join(difflib.unified_diff(source.splitlines(True),result.splitlines(True),fromfile='authorized-SQL09',tofile='REVIEW-ONLY-SQL10'))
 manifest={'candidate':'PG-TEST-01-CONSOLIDATED-10','status':'REVIEW ONLY','installationAuthorized':False,'rootCause':'SQLSTATE23514: independent clock_timestamp calls may violate the exact trusted-device 30-day CHECK','source':{'gitBlob':OLD_BLOB,'sha256':OLD_SHA},'candidateArtifact':{'path':str((DEST/'schema.review.sql').relative_to(ROOT)),'gitBlob':blob(sql),'sha256':hashlib.sha256(sql).hexdigest(),'bytes':len(sql)},'fullDiff':{'path':str((DEST/'SQL09_TO_SQL10.diff').relative_to(ROOT)),'sha256':hashlib.sha256(diff.encode()).hexdigest()},'changedFunctions':['auth_api.register_trusted_device(bytea,uuid) RETURNS uuid'],'newSignatures':[],'aclChanges':[],'roleChanges':[],'tableChanges':[],'rlsChanges':[],'securityChanges':'None: same guards, MFA/ACTIVE context, token digest, audit, principal lock, owner, SECURITY DEFINER and pg_catalog search_path. One server timestamp enforces exactly30days.','runtime':'closedBackend','B1':'OPEN','AUTH-GATE-05':'OPEN'}
 return {'schema.review.sql':result,'SQL09_TO_SQL10.diff':diff,'manifest.json':json.dumps(manifest,indent=2)+'\n'}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
 for name,content in generate().items():
  path=DEST/name
  if args.check:
   if not path.exists() or path.read_text()!=content:raise RuntimeError('SQL10_REPRODUCIBILITY_MISMATCH:'+name)
  else:DEST.mkdir(parents=True,exist_ok=True);path.write_text(content)
 print('SQL10 REVIEW ONLY reproducibility PASS; no SQL executed')
if __name__=='__main__':main()
