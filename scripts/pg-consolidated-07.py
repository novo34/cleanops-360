#!/usr/bin/env python3
"""Install ONLY the exact owner-authorized07; reuse the existing isolated PG transport."""
import hashlib
import json
import sys
from pathlib import Path
import importlib.util
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('runner06',ROOT/'scripts/pg-consolidated-06.py');runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
runner.REVISION='07';runner.BLOB='099345e43c03a2ee3759fa0c2d5ef875121621fc';runner.SHA='4c304916a76a700e37a069c947426874d73dace0016f3d2a5d3504ce9ba05456'
b=runner.b;b.E1_REVISION='07'
def payload():
 a=json.loads((ROOT/'docs/implementation/b1/consolidated-test-07/AUTHORIZATION.json').read_text())
 if not a['ownerApproved'] or a['authorization']!='PG-TEST-01-CONSOLIDATED-07' or a['candidate']['gitBlob']!=runner.BLOB or a['candidate']['sha256']!=runner.SHA:raise RuntimeError('EXACT07_APPROVAL_MISSING')
 pre=runner.module('pre07','precheck-b1-07.py').verify();raw=(ROOT/a['candidatePath']).read_bytes()
 b.REPORT.update(scope='PG-TEST-01-CONSOLIDATED-07-NEW-CONTRACTS',authorization=a,candidate=pre,prior06={'run':39101669219,'PASS':210,'FAIL':19},prior294={'run':39068144839,'reexecuted':False})
 runner.original_record('exact07-blob-sha256-diff-acl-precheck','PASS');return [('V4',raw.decode())]
previous_checks=runner.checks
def checks():
 extra=runner.module('security07','pg07-security-tests.py')
 if not extra.gate(b):
  b.record('07-functional-battery','BLOCKED','New privilege/role/RLS gate failed; no functional success inferred')
  return
 previous_checks()
runner.payload=payload;runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
