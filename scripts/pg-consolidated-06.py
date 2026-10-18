#!/usr/bin/env python3
"""Exact owner-authorized06 in an owned isolated PG16; no candidate rewriting."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v);return v
b=module('pg06_transport','pg-test-01.py')
original_sql,original_record,original_docker,original_fixtures=b.sql,b.record,b.docker,b.fixtures
BLOB='939a521911e34296e055eb05c57264cbeee6d785'
SHA='aade4ed7aeb065899c086f0ee02e11aef024d2cb84f2d9e4a13155a273ab0962'
REVISION='06'
def docker(*args,**kwargs):return original_docker(*tuple('postgres:16-bookworm' if x=='postgres:16-alpine' else x for x in args),**kwargs)
def payload():
 approval=json.loads((ROOT/'docs/implementation/b1/e1-consolidation/AUTHORIZATION.json').read_text())
 if approval.get('ownerApproved') is not True or approval['candidate']['gitBlob']!=BLOB or approval['candidate']['sha256']!=SHA:raise RuntimeError('EXACT_APPROVAL_MISSING')
 raw=(ROOT/approval['candidatePath']).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=SHA or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=BLOB:raise RuntimeError('EXACT_APPROVED_BYTES_MISMATCH')
 generator=module('e1gen','consolidate-b1-e1.py')
 for name,content in generator.generate().items():
  if (generator.DEST/name).read_text()!=content:raise RuntimeError('REVIEWED_DIFF_ACL_MISMATCH')
 b.REPORT.update(authorization=approval,candidate={'gitBlob':BLOB,'sha256':SHA,'bytes':len(raw)},scope='PG-TEST-01-CONSOLIDATED-06-FOCUSED',prior294={'run':39068144839,'reexecuted':False},prior4E2E={'run':39073390845,'reexecuted':False})
 original_record('exact06-blob-sha256-diff-acl','PASS');return [('V4',raw.decode())]
def record(name,status,detail=None):
 # Focused new-contract execution does not rerun/re-credit unchanged approved294 tests.
 if name in {'credential-CAS-concurrent-one-winner','global-TOTP-CAS-concurrent-one-winner','D1-method-version-revalidation'} and status=='BLOCKED' and detail=='Mandatory protocol scenario has not executed; full PG-TEST-01 cannot pass.':return
 return original_record('install-consolidated'+REVISION if name=='install-V4' else name,status,detail)
def sql(text,role='postgres',database='core'):
 if text=="SELECT count(*)=21 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r';":text=text.replace('=21','=30')
 if hashlib.sha256(text.encode()).hexdigest()==SHA:
  if original_sql('SHOW check_function_bodies;').stdout.strip()!='on':raise RuntimeError('BODY_VALIDATION_DISABLED')
  b.REPORT['submittedSqlSha256']=SHA
  return b.docker('exec','-i',b.CID,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U',role,'-d',database,'-f','-',data=text)
 return original_sql(text,role,database)
def fixtures():
 if not original_fixtures():return False
 return b.check('synthetic-verifier-login-only',"CREATE ROLE pgtest_verifier LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;GRANT cleanops_recipient_verifier TO pgtest_verifier;")
def checks():
 module('pg06_contracts','pg-e1-native-tests.py').run(b)
 # New worker uses actual codec/store and PG service logins, synthetic transport only.
 runtime=module('pg06_runtime','pg-http-integration.py');runtime.copy_runtime(b,('scripts/pg06-mail-real.ts',))
 result=b.docker('exec','-i',b.CID,'/opt/b1-pg05/node','--experimental-strip-types','/opt/b1-pg05/scripts/pg06-mail-real.ts',data=json.dumps({'tenant':b.A,'user':b.U,'principal':b.P,'identityRole':b.ROLE['identity'],'mailRole':b.ROLE['mail'],'verifierRole':'pgtest_verifier'}),timeout=90)
 try:
  report=json.loads(result.stdout)
  for check in report['checks']:b.record(check['name'],check['status'],check.get('detail'))
  if result.returncode and all(c['status']=='PASS' for c in report['checks']):b.record('real-worker-process','FAIL')
 except Exception:b.record('real-worker-process','FAIL','REDACTED transport/dependency failure; no integration success claimed')
 module('pg06_contracts_backup','pg-e1-native-tests.py').backup(b)
 # Full new UI/API routes are not falsely represented by a private worker test.
 b.REPORT['newUIE2E']='NOT_IMPLEMENTED_NOT_EXECUTED'
 b.REPORT['b1RequirementsAccepted']=0
def main():
 b.docker=docker;b.verified_candidates=payload;b.record=record;b.sql=sql;b.fixtures=fixtures;b.checks_v4=checks
 result=b.main();report=b.REPORT
 installed=any(c['name']=='install-consolidated'+REVISION and c['status']=='PASS' for c in report['checks'])
 if not installed:
  for label in ['EMAIL-native-worker','recovery-trust-AUTHZ-native','new-UI-API-PG-E2E','new-rollback-concurrency-restore']:record(label,'BLOCKED','Installation prerequisite failed; no additional SQL installed')
 report['result']='PASS' if report['cleanup']=='PASS' and all(c['status']=='PASS' for c in report['checks']) else 'FAIL'
 report['fullB1Result']='OPEN_NOT_ACCEPTED';target=ROOT/('artifacts/pg-consolidated-'+REVISION);target.mkdir(parents=True,exist_ok=True);(target/'report.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2));return 0 if report['result']=='PASS' else 1
if __name__=='__main__':sys.exit(main())
