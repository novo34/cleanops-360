#!/usr/bin/env python3
"""Real EMAIL browser vertical, exact authorized SQL07; no extra SQL/ACL."""
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sql07',ROOT/'scripts/pg-consolidated-07.py');seven=importlib.util.module_from_spec(spec);spec.loader.exec_module(seven)
runner=seven.runner;b=seven.b
CONFIG='playwright.email-b1.config.ts'
UI_SCOPE='EXECUTED_EMAIL_AND_EXISTING_TOTP'
def browser():
 if not runner.module('email_gate','pg07-security-tests.py').gate(b):
  b.record('EMAIL-browser','BLOCKED','Native role gate failed');return
 runner.module('email_runtime','pg-http-integration.py').copy_runtime(b,('scripts/pg05-browser-backend.ts',))
 fixture={'container':b.CID,'run':b.RUN,'tenant':b.A,'user':b.V,'principal':b.Q,'identityRole':b.ROLE['identity']}
 result=subprocess.run(['npx','--no-install','playwright','test','--config='+CONFIG],cwd=ROOT,env=dict(b.ENV,B1_BROWSER_FIXTURE=json.dumps(fixture)),capture_output=True,text=True,timeout=480)
 path=ROOT/'artifacts/b1-real-browser/playwright.json'
 if path.exists():
  data=json.loads(path.read_text())
  def collect(s):
   for item in s.get('specs',[]):
    results=[r['status'] for t in item['tests'] for r in t['results']]
    phases=[a['description'] for t in item['tests'] for a in t.get('annotations',[]) if a.get('type')=='phase' and re.fullmatch('[A-Z][A-Z0-9_]{0,39}',a.get('description',''))]
    locations=[int(line) for t in item['tests'] for r in t['results'] for e in [*r.get('errors',[]),r.get('error',{})] for line in re.findall(r'e2e/b1-[a-z-]+\.spec\.ts:(\d+):',e.get('stack','')+'\n'+e.get('message',''))]
    b.record('Browser-PG-'+item['title'],'PASS' if results==['passed'] else 'FAIL',{'attemptStatuses':results,'phases':phases,'testLineNumbers':sorted(set(locations))})
   for child in s.get('suites',[]):collect(child)
  for s in data.get('suites',[]):collect(s)
  path.unlink()
 b.record('EMAIL-real-browser-process','PASS' if result.returncode==0 else 'FAIL','No HTTP mocks, injected cookies, external SMTP or raw secret-bearing output.')
 runner.module('email_backup','pg-e1-native-tests.py').backup(b)
 b.REPORT['newUIE2E']=UI_SCOPE;b.REPORT['b1RequirementsAccepted']=0
runner.checks=browser
if __name__=='__main__':sys.exit(runner.main())
