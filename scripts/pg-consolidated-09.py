#!/usr/bin/env python3
"""Exact owner-authorized09; no extra SQL/ACL installation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('previous08',ROOT/'scripts/pg-consolidated-08.py');previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous)
runner=previous.runner;b=previous.b
runner.REVISION='09';runner.BLOB='641886171bc24557ff5f49ae6bc7564036efc6b0';runner.SHA='660331857de2ea2d1f4c4dfa850361b73f37b807694054b9e0e03acb5d29786a'
def payload():
 a=json.loads((ROOT/'docs/implementation/b1/consolidated-test-09/AUTHORIZATION.json').read_text())
 raw=(ROOT/a['candidatePath']).read_bytes()
 if a['ownerApproved'] is not True or a['candidate']['gitBlob']!=runner.BLOB or a['candidate']['sha256']!=runner.SHA or hashlib.sha256(raw).hexdigest()!=runner.SHA or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=runner.BLOB:raise RuntimeError('EXACT09_AUTHORIZATION_BYTES_MISMATCH')
 generator=runner.module('generator09','consolidate-b1-bootstrap-reset.py')
 for name,content in generator.generate().items():
  if (generator.DEST/name).read_text()!=content:raise RuntimeError('EXACT09_FULL_DIFF_ACL_MISMATCH')
 b.REPORT.update(scope='PG-TEST-01-CONSOLIDATED-09',authorization=a,candidate=a['candidate'],prior08={'run':39111607391,'PASS':134,'realE2E':23,'reexecuted':False})
 runner.original_record('exact09-blob-sha256-full-diff-acl','PASS');return [('V4',raw.decode())]
def checks():
 if not runner.module('security09','pg09-security-tests.py').gate(b):
  b.record('reset-UI-API-PG','BLOCKED','Mandatory09 security gate failed');return
 runner.module('backup09','pg-e1-native-tests.py').backup(b,31)
 b.REPORT['newUIE2E']='NOT_YET_EXECUTED';b.REPORT['b1RequirementsAccepted']=0
runner.payload=payload;runner.sql=previous.sql;runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
