"""Sanitize the mandatory full reachable-history scanner result; never print secrets."""
import json
import os
from pathlib import Path
import subprocess
import sys

raw=Path('/tmp/b2-gitleaks-full-raw.json')
result={'scope':'ALL_HISTORY_REACHABLE_FROM_HEAD','status':'FAIL','scanner':'8.24.3',
        'exitCode':int(os.environ['B2_GITLEAKS_SCAN_EXIT']),
        'source':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
        'reachableCommits':int(subprocess.check_output(['git','rev-list','--count','HEAD'],text=True)),
        'findings':[]}
try:
    findings=json.loads(raw.read_text())
    if findings is None and result['exitCode']==0:findings=[]
    if not isinstance(findings,list):raise ValueError('INVALID_SCANNER_REPORT')
    allowed=['RuleID','Description','File','StartLine','EndLine','Commit','Fingerprint']
    result['findings']=[{key:f[key] for key in allowed if key in f} for f in findings]
    if result['exitCode']==0 and not findings:result['status']='PASS'
except (OSError,ValueError,KeyError,TypeError):
    result['error']='SCANNER_REPORT_INCOMPLETE'
finally:
    raw.unlink(missing_ok=True)
output=Path('artifacts/b2-security/gitleaks-full-history.json')
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
sys.exit(0 if result['status']=='PASS' else 1)
