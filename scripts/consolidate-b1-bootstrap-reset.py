#!/usr/bin/env python3
"""One fresh SQL09 candidate. REVIEW ONLY; never installs SQL or invokes Docker."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'docs/proposals/b1-consolidated-sql/revisions/08/schema.review.sql'
DEST=ROOT/'docs/proposals/b1-consolidated-sql/revisions/09'
def identity(raw):
 return {'gitBlob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
def generate():
 raw=BASE.read_bytes();base=identity(raw)
 if base['gitBlob']!='a585147fa19452de0f28d9c1d7542b3d77b058f7' or base['sha256']!='566777536442e5ebe40a0fe7022eceb412c6089c23dfb9094611f934006780a2':raise ValueError('EXACT_AUTHORIZED08_BASE_MISMATCH')
 source=(DEST/'bootstrap-reset-owned.review.sql').read_text()
 if hashlib.sha256(source.encode()).hexdigest()!='87c5647346883e4ea24756f7d412b0a811c16acef5f7b9c0fd48dca87b43250b':raise ValueError('REVIEWED_BOOTSTRAP_SOURCE_MISMATCH')
 if source.count('CREATE FUNCTION ')!=1 or source.count('GRANT ')!=1 or source.count('REVOKE ')!=1 or source.count('ALTER FUNCTION ')!=1:raise ValueError('UNREVIEWED_STATEMENT_COUNT')
 if not source.endswith('GRANT EXECUTE ON FUNCTION auth_api.reserve_reset_owned(text,text,bytea,bytea) TO cleanops_identity_service;\n'):raise ValueError('UNREVIEWED_ACL')
 original=raw.decode();end=original.rfind('COMMIT;\n')
 if end<0 or end+len('COMMIT;\n')!=len(original):raise ValueError('BASE_TRANSACTION_LAYOUT')
 complete='-- CONSOLIDATED-09 REVIEW ONLY; separate exact owner authorization required.\n'+original[:end]+source+original[end:]
 diff=''.join(difflib.unified_diff(original.splitlines(True),complete.splitlines(True),fromfile='authorized08/schema.review.sql',tofile='review-only09/schema.review.sql'))
 manifest={'revision':'09','status':'REVIEW_ONLY_NOT_INSTALLED','base':base,'candidate':identity(complete.encode()),'newSQLSignatures':['auth_api.reserve_reset_owned(text,text,bytea,bytea)'],'existingSQLBodiesUnchanged':True,'newRoles':[],'newTables':[],'newTableGrants':[],'newRLSPolicies':[],'functionOwner':'cleanops_auth_broker','execute':['cleanops_identity_service'],'publicExecute':False,'diffSha256':hashlib.sha256(diff.encode()).hexdigest()}
 request={'authorization':'PG-TEST-01-CONSOLIDATED-09','ownerApproved':False,'executed':False,'candidate':manifest['candidate'],'environment':{'postgres':16,'newDockerOnly':True,'network':'none','publicPorts':False,'sharedVolumes':False,'data':'SYNTHETIC_ONLY'},'runtime':'closedBackend','B1':'OPEN','AUTH-GATE-05':'OPEN','scope':'Exact new bootstrap owned-reservation function and EXECUTE only; fresh isolated synthetic PG16; no other SQL/ACL, runtime activation, SMTP, production, deployment or merge.'}
 return {'schema.review.sql':complete,'APPROVED_08_TO_09.diff':diff,'manifest.json':json.dumps(manifest,indent=2)+'\n','EXECUTION_REQUEST.json':json.dumps(request,indent=2)+'\n'}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
 for name,content in generate().items():
  if args.check:
   if (DEST/name).read_text()!=content:raise SystemExit('UNREPRODUCIBLE:'+name)
  else:(DEST/name).write_text(content)
 print('SQL09_REVIEW_ONLY_REPRODUCIBLE_NO_EXECUTION')
if __name__=='__main__':main()
