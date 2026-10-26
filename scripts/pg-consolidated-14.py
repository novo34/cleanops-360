"""Exact authorized SQL14 only, reusing the isolated PG16 transport and cleanup."""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sql14prior',ROOT/'scripts/pg-consolidated-13.py');prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
runner=prior.runner;b=prior.b
runner.REVISION='14';runner.BLOB='1971a9fdc5c1f3fd1fcb5f6706459678e5399256';runner.SHA='965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa'
def payload():
 a=json.loads((ROOT/'docs/implementation/b1/consolidated-test-14/AUTHORIZATION.json').read_text());raw=(ROOT/a['candidatePath']).read_bytes()
 if a.get('ownerApproved') is not True or a['candidate']['gitBlob']!=runner.BLOB or a['candidate']['sha256']!=runner.SHA or hashlib.sha256(raw).hexdigest()!=runner.SHA or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=runner.BLOB:raise RuntimeError('EXACT14_APPROVAL_BYTES_MISMATCH')
 g=runner.module('review13','consolidate-b1-role-risk.py')
 for name,text in g.generate().items():
  if (g.DEST/name).read_text()!=text:raise RuntimeError('EXACT14_DIFF_ACL_RLS_MISMATCH')
 b.REPORT.update(scope='PG-TEST-01-CONSOLIDATED-14',authorization=a,candidate=a['candidate'],increment='SQL14_DIRECTED_NATIVE_AND_REAL_BROWSER')
 runner.original_record('exact14-approved-blob-sha256-full-diff-ACL-RLS','PASS');return [('V4',raw.decode())]
def checks():
 group=os.environ.get('B1_SQL14_GROUP','native')
 if not runner.module('sql14gate','pg11-access-security-tests.py').gate(b,32):b.record('SQL14-dependent-tests','BLOCKED');return
 if group=='native':
  runner.module('sql14runtime','pg-http-integration.py').copy_runtime(b,('scripts/pg14-role-risk-tests.ts','scripts/pg14-native.ts'))
  result=b.docker('exec','-i',b.CID,'/opt/b1-pg05/node','--experimental-strip-types','/opt/b1-pg05/scripts/pg14-native.ts',data=json.dumps({'tenant':b.A,'otherTenant':b.B,'user':b.U,'otherUser':b.W,'principal':b.P,'identityRole':b.ROLE['identity'],'roles':list(b.ROLE.values())+['pgtest_verifier']}),timeout=180)
  try:
   report=json.loads(result.stdout)
   for c in report['checks']:b.record(c.get('name','SQL14-'+c.get('id','unknown')),c['status'],c.get('detail'))
   if result.returncode:b.record('SQL14-native-process','FAIL','REDACTED')
  except Exception:b.record('SQL14-native-report','FAIL','REDACTED')
  runner.module('sql14backup','pg-e1-native-tests.py').backup(b,32)
  b.REPORT['newUIE2E']='NOT_RUN_NATIVE_ONLY'
 else:
  if group not in {'browser','policy','regression'}:raise RuntimeError('UNKNOWN_SQL14_GROUP')
  b.ENV['B1_SQL14_APPROVED_BLOB']=runner.BLOB
  browser=prior.prior.prior.nine.previous.browser
  browser.CONFIG='playwright.sql14-'+group+'.config.ts';browser.UI_SCOPE='EXECUTED_SQL14_'+group.upper()+'_REAL_BROWSER';browser.SECURITY_GATE='pg11-access-security-tests.py';browser.TABLE_COUNT=32;browser.browser()
 b.REPORT['fullB1Result']='OPEN_NOT_FORMALLY_ACCEPTED'
previous_sql=runner.sql
def sql(text,role='postgres',database='core'):
 if text=="SELECT count(*)=21 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r';":text=text.replace('=21','=32')
 return previous_sql(text,role,database)
runner.sql=sql
runner.payload=payload;runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
