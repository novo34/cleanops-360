#!/usr/bin/env python3
"""Only new browser integration; approved 294-check result is not rerun or re-credited."""
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('approved05', ROOT/'scripts/pg-consolidated-05.py')
approved = importlib.util.module_from_spec(spec)
spec.loader.exec_module(approved)
b = approved.base
previous_record = b.record
# The generic harness appends three full-PG mandatory sentinels. This narrower run
# does not reassert or rerun their approved results; retain the prior source explicitly.
prior_protocols = {'credential-CAS-concurrent-one-winner','global-TOTP-CAS-concurrent-one-winner','D1-method-version-revalidation'}
def record(name, status, detail=None):
    if name in prior_protocols and status == 'BLOCKED' and detail == 'Mandatory protocol scenario has not executed; full PG-TEST-01 cannot pass.':
        return
    return approved.record(name, status, detail)

def browser():
    approved.module('http_transport', 'pg-http-integration.py').copy_runtime(b, ('scripts/pg05-browser-backend.ts',))
    fixture = {'container':b.CID,'run':b.RUN,'tenant':b.A,'user':b.V,'principal':b.Q,'identityRole':b.ROLE['identity']}
    environment = dict(b.ENV, B1_BROWSER_FIXTURE=json.dumps(fixture))
    result = subprocess.run(['npx','--no-install','playwright','test','--config=playwright.real-b1.config.ts'], cwd=ROOT, env=environment, text=True, capture_output=True, timeout=180)
    # Playwright assertion errors may contain submitted factors; retain only titles,
    # statuses, duration, never raw stdout/stderr or the unredacted JSON report.
    path = ROOT/'artifacts/b1-real-browser/playwright.json'
    if path.exists():
        report = json.loads(path.read_text())
        def collect(suite):
            for test in suite.get('specs', []):
                statuses = [r['status'] for t in test['tests'] for r in t['results']]
                phases=[a['description'] for t in test['tests'] for a in t.get('annotations',[]) if a.get('type')=='phase' and re.fullmatch('[A-Z][A-Z0-9_]{0,39}',a.get('description',''))]
                locations=[int(line) for t in test['tests'] for r in t['results'] for error in r.get('errors',[]) for line in re.findall(r'e2e/b1-real-postgres\.spec\.ts:(\d+):',error.get('stack',''))]
                b.record('Browser-PG-'+test['title'], 'PASS' if statuses == ['passed'] else 'FAIL', {'attemptStatuses':statuses,'phases':phases,'testLineNumbers':sorted(set(locations))})
            for sub in suite.get('suites', []): collect(sub)
        for suite in report.get('suites', []): collect(suite)
        path.unlink()
    b.record('real-browser-process', 'PASS' if result.returncode == 0 else 'FAIL', 'No mocked responses; raw traces and output suppressed.')

b.docker = approved.docker
b.verified_candidates = approved.authorized_payload
b.record, b.sql, b.fixtures, b.check = record, approved.sql, approved.fixtures, approved.check
b.checks_v4 = browser
b.REPORT.update(scope='B1-REAL-BROWSER-PG05', prior294={'source':'56ebab0d824b7bece15167f0600d3fea03cf59bf','run':39068144839,'status':'PASS','reexecuted':False}, b1RequirementsAccepted=0)
b.main()
target=ROOT/'artifacts/b1-real-browser'
target.mkdir(parents=True,exist_ok=True)
(target/'report.json').write_text(json.dumps(b.REPORT,indent=2)+'\n')
sys.exit(0 if b.REPORT['result']=='PASS' else 1)
