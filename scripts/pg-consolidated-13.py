"""Exact authorized SQL13 only, reusing the isolated PG16 transport and cleanup."""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sql13prior',ROOT/'scripts/pg-consolidated-11.py');prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
runner=prior.runner;b=prior.b
runner.REVISION='13';runner.BLOB='7a2df8463e6c1a45b2a2c9005187c0269d2cf423';runner.SHA='a052d028206d004b17c375bc56868d86c4014fc4dd72e0d78d8fdb49b741b279'
def payload():
 a=json.loads((ROOT/'docs/implementation/b1/consolidated-test-13/AUTHORIZATION.json').read_text());raw=(ROOT/a['candidatePath']).read_bytes()
 if a.get('ownerApproved') is not True or a['candidate']['gitBlob']!=runner.BLOB or a['candidate']['sha256']!=runner.SHA or hashlib.sha256(raw).hexdigest()!=runner.SHA or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=runner.BLOB:raise RuntimeError('EXACT13_APPROVAL_BYTES_MISMATCH')
 g=runner.module('review13','consolidate-b1-denial-events.py')
 for name,text in g.generate().items():
  if (g.DEST/name).read_text()!=text:raise RuntimeError('EXACT13_DIFF_ACL_RLS_MISMATCH')
 b.REPORT.update(scope='PG-TEST-01-CONSOLIDATED-13',authorization=a,candidate=a['candidate'],increment='SQL13_DIRECTED_NATIVE_AND_REAL_BROWSER')
 runner.original_record('exact13-approved-blob-sha256-full-diff-ACL-RLS','PASS');return [('V4',raw.decode())]
def checks():
 group=os.environ.get('B1_SQL13_GROUP','native')
 if group in {'native','locks'}:
  if not runner.module('sql13gate','pg11-access-security-tests.py').gate(b):b.record('SQL13-dependent-native','BLOCKED');return
  script='pg13-locks.ts' if group=='locks' else 'pg13-real.ts'
  runner.module('sql13runtime','pg-http-integration.py').copy_runtime(b,('scripts/'+script,))
  result=b.docker('exec','-i',b.CID,'/opt/b1-pg05/node','--experimental-strip-types','/opt/b1-pg05/scripts/'+script,data=json.dumps({'tenant':b.A,'otherTenant':b.B,'user':b.U,'principal':b.P,'identityRole':b.ROLE['identity'],'roles':list(b.ROLE.values())+['pgtest_verifier']}),timeout=180)
  try:
   report=json.loads(result.stdout)
   for c in report['checks']:b.record(c['name'],c['status'],c.get('detail'))
   b.REPORT['nativePlanCoverage']=report.get('coverage',{})
   if result.returncode:b.record('SQL13-native-process','FAIL','REDACTED')
  except Exception:b.record('SQL13-native-report','FAIL','REDACTED')
  runner.module('sql13backup','pg-e1-native-tests.py').backup(b,31)
  b.REPORT['newUIE2E']='NOT_RUN_NATIVE_PREREQUISITE_ONLY'
 else:
  allowed={'browser','policy','regression'}
  if group not in allowed:raise RuntimeError('UNKNOWN_SQL13_GROUP')
  browser=prior.prior.nine.previous.browser
  browser.CONFIG='playwright.sql13-'+group+'.config.ts';browser.UI_SCOPE='EXECUTED_SQL13_'+group.upper()+'_REAL_BROWSER';browser.SECURITY_GATE='pg11-access-security-tests.py';browser.browser()
 b.REPORT['fullB1Result']='OPEN_NOT_FORMALLY_ACCEPTED'
original_fixtures=runner.fixtures
def fixtures():
 if not original_fixtures():return False
 return b.check('SQL13-approved-12h24h-configuration-data-only',"UPDATE identity_private.configuration SET values_json=jsonb_set(jsonb_set(values_json,'{absolute_sensitive}','43200'::jsonb),'{absolute_operational}','86400'::jsonb);")
runner.fixtures=fixtures
runner.payload=payload;runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
