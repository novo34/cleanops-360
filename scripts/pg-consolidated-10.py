#!/usr/bin/env python3
"""Install only exact owner-authorized10 in the existing owned isolated PG16 harness."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('trusted09',ROOT/'scripts/pg-trusted-browser.py');prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
runner=prior.runner;b=prior.b
runner.REVISION='10';runner.BLOB='68c0545f79cf15fa780566ebf4aab14b3ccb892b';runner.SHA='d95e9896ebd12f840f00c12c97ffb9e8b17f3cfe28052655d7f4c4e80d3f5e4b'
def payload():
 a=json.loads((ROOT/'docs/implementation/b1/consolidated-test-10/AUTHORIZATION.json').read_text());raw=(ROOT/a['candidatePath']).read_bytes()
 if a.get('ownerApproved') is not True or a['candidate']['gitBlob']!=runner.BLOB or a['candidate']['sha256']!=runner.SHA or hashlib.sha256(raw).hexdigest()!=runner.SHA or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=runner.BLOB:raise RuntimeError('EXACT10_APPROVAL_BYTES_MISMATCH')
 g=runner.module('clock10','consolidate-b1-trusted-clock.py')
 for name,content in g.generate().items():
  if(g.DEST/name).read_text()!=content:raise RuntimeError('EXACT10_DIFF_ACL_RLS_MISMATCH')
 b.REPORT.update(scope='PG-TEST-01-CONSOLIDATED-10',increment='TRUSTED_DEVICE_REAL_VERTICAL',authorization=a,candidate=a['candidate'])
 runner.original_record('exact10-blob-sha256-full-diff-no-ACL-RLS-change','PASS');return [('V4',raw.decode())]
def checks():
 browser=prior.nine.previous.browser
 browser.CONFIG='playwright.trusted-commit-b1.config.ts';browser.UI_SCOPE='EXECUTED_SQL10_TRUSTED_COMMIT_REAL_BROWSER';browser.SECURITY_GATE='pg-trusted-security-tests.py'
 browser.browser()
runner.payload=payload;runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
