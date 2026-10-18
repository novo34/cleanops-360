"""Already owner-authorized SQL11; targeted remaining B1 criteria only."""
import importlib.util
from pathlib import Path
import sys
import os
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('remaining11',ROOT/'scripts/pg-consolidated-11.py');eleven=importlib.util.module_from_spec(spec);spec.loader.exec_module(eleven)
runner=eleven.runner;b=eleven.b
def checks():
 browser=eleven.prior.nine.previous.browser
 group=os.environ.get('B1_REMAINING_GROUP','abuse')
 if group not in ['abuse','mfa-admin','enrollment','policy','isolation','csrf','switch','policy-negative','email','recovery','reset-only','trusted','access11','compat']:raise RuntimeError('INVALID_REMAINING_GROUP')
 if group=='isolation':
  import json
  if not runner.module('pool_gate','pg11-access-security-tests.py').gate(b):b.record('POOL-prerequisite','BLOCKED');return
  runner.module('pool_runtime','pg-http-integration.py').copy_runtime(b,('scripts/pg-b1-pool-real.ts',))
  result=b.docker('exec','-i',b.CID,'/opt/b1-pg05/node','--experimental-strip-types','/opt/b1-pg05/scripts/pg-b1-pool-real.ts',data=json.dumps({'identityRole':b.ROLE['identity'],'tenant':b.A,'user':b.U,'otherTenant':b.B,'otherUser':b.W}),timeout=90)
  try:
   data=json.loads(result.stdout)
   for check in data['checks']:b.record(check['name'],check['status'])
   if result.returncode:b.record('POOL-real-process','FAIL')
  except Exception:b.record('POOL-real-process','FAIL','REDACTED_POOL_TRANSPORT_FAILURE')
  runner.module('pool_backup','pg-e1-native-tests.py').backup(b,31)
  b.REPORT['newUIE2E']='NOT_RUN_NEW_NATIVE_POOL_ONLY';return
 if group=='compat':
  import subprocess,re
  applications=[]
  for executable,name in [('keepassxc-cli','KeePassXC'),('oathtool','OATH Toolkit')]:
   try:
    result=subprocess.run([executable,'--version'],env=dict(b.ENV,QT_QPA_PLATFORM='offscreen'),capture_output=True,text=True,timeout=10)
    version=re.search(r'\b[0-9]+\.[0-9]+\.[0-9]+\b',result.stdout)
    if result.returncode or not version:raise ValueError('APP_VERSION_UNAVAILABLE')
    applications.append({'application':name,'version':version.group(0),'interface':'installed Linux CLI; no mobile/GUI claim'})
   except Exception:b.record('COMPAT-real-application-availability','FAIL','REDACTED_APP_SETUP');return
  b.REPORT['authenticatorApplications']=applications
  b.record('COMPAT-real-application-availability','PASS',applications)
 browser.CONFIG='playwright.'+group+'-b1.config.ts';browser.UI_SCOPE='EXECUTED_SQL11_'+group.upper().replace('-','_')+'_REAL_BROWSER';browser.SECURITY_GATE='pg11-access-security-tests.py'
 browser.browser()
 b.REPORT['increment']='REMAINING_B1_OTP_ABUSE_ANTIENUM'
runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
