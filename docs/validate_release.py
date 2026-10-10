#!/usr/bin/env python3
from pathlib import Path
import re, json, collections, zipfile
D=Path(__file__).resolve().parent
srs=(D/'CLEANOPS_360_SRS_V1_1.md').read_text()
cv=(D/'REQUIREMENTS_COVERAGE.md').read_text()
tc=(D/'TEST_CASE_REGISTER.md').read_text()
pat=re.compile(r'REQ-[A-Z]+(?:-[A-Z]+)*-\d{3}')
reqs=set(pat.findall(srs))
rows=[re.match(r'\|\s*(REQ-[A-Z]+(?:-[A-Z]+)*-\d{3})\s*\|',l).group(1) for l in cv.splitlines() if re.match(r'\|\s*(REQ-[A-Z]+(?:-[A-Z]+)*-\d{3})\s*\|',l)]
cases=re.findall(r'^### (TC-\d{3}) — (REQ-[A-Z]+(?:-[A-Z]+)*-\d{3})$',tc,re.M)
gates=re.findall(r'^\| `([A-Z]+(?:-[A-Z]+)*-(?:G\d+|GATE-\d+)|G-[A-Z-]+)` \|', (D/'IMPLEMENTATION_GATES.md').read_text(),re.M)
checks={
 'requirement_ids_unique_in_coverage':len(rows)==len(set(rows)),
 'coverage_set_equals_srs':set(rows)==reqs,
 'test_case_count_matches':len(cases)==len(reqs),
 'test_case_req_set_equals_srs':{r for _,r in cases}==reqs,
 'test_case_ids_unique':len({t for t,_ in cases})==len(cases),
 'master_and_srs_present':all((D/x).exists() for x in ['CLEANOPS_360_PRODUCT_MASTER_V3.md','CLEANOPS_360_SRS_V1_1.md']),
 'gate_count_30':len(gates)==30 and len(set(gates))==30,
 'no_false_claim_test_executed':'NOT_RUN' in tc,
 'release_policy_present':(D/'DOCUMENTATION_RELEASE_POLICY.md').exists(),
}
info={'checks':checks,'srs_unique':len(reqs),'coverage_rows':len(rows),'test_cases':len(cases),'gates':len(gates),'md_files':len(list(D.glob('*.md'))),'passed':all(checks.values())}
print(json.dumps(info,indent=2,ensure_ascii=False))
raise SystemExit(0 if info['passed'] else 1)
