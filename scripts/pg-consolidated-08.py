#!/usr/bin/env python3
"""Exact authorized SQL08 only; existing isolated transport and real browser vertical."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('recovery08',ROOT/'scripts/pg-recovery-browser.py')
recovery=importlib.util.module_from_spec(spec);spec.loader.exec_module(recovery)
browser=recovery.run;runner=browser.runner;b=browser.b
runner.REVISION='08'
runner.BLOB='a585147fa19452de0f28d9c1d7542b3d77b058f7'
runner.SHA='566777536442e5ebe40a0fe7022eceb412c6089c23dfb9094611f934006780a2'
browser.TABLE_COUNT=31;browser.SECURITY_GATE='pg08-security-tests.py'
browser.UI_SCOPE='EXECUTED_SQL08_RECOVERY_AND_EMAIL_REAL_BROWSER'
original_sql=runner.sql

def payload():
 a=json.loads((ROOT/'docs/implementation/b1/consolidated-test-08/AUTHORIZATION.json').read_text())
 if a['ownerApproved'] is not True or a['candidate']['gitBlob']!=runner.BLOB or a['candidate']['sha256']!=runner.SHA:raise RuntimeError('EXACT08_APPROVAL_MISSING')
 raw=(ROOT/a['candidatePath']).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=runner.SHA or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=runner.BLOB:raise RuntimeError('EXACT08_BYTES_MISMATCH')
 generator=runner.module('review08','consolidate-b1-reset.py')
 for name,content in generator.generate().items():
  if (generator.DEST/name).read_text()!=content:raise RuntimeError('EXACT08_DIFF_ACL_MISMATCH')
 b.REPORT.update(scope='PG-TEST-01-CONSOLIDATED-08',authorization=a,candidate=a['candidate'],prior07={'run':39102962461,'PASS':253,'reexecuted':False},recoverySecurityRegression={'run':39109078160,'previousResult':'FAIL'},increment='RECOVERY_BINDING_AND_EMAIL_REGRESSION')
 runner.original_record('exact08-blob-sha256-full-diff-acl-precheck','PASS')
 return [('V4',raw.decode())]

def sql(text,role='postgres',database='core'):
 if text=="SELECT count(*)=21 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r';":
  text=text.replace('=21','=31')
 return original_sql(text,role,database)

runner.payload=payload;runner.sql=sql
if __name__=='__main__':sys.exit(runner.main())
