#!/usr/bin/env python3
"""Install only exact owner-authorized10 in the existing owned isolated PG16 harness."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sql11base',ROOT/'scripts/pg-trusted-browser.py');prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
runner=prior.runner;b=prior.b
runner.REVISION='11';runner.BLOB='3f13bb1132c5b1ffdd35d4993bb9aa2ca3c75f06';runner.SHA='54f9c0d94441ed3f72f6dc1c3d4d9bca1b9f0072a7d0f7c6059debe80eea9d6e'
def payload():
 a=json.loads((ROOT/'docs/implementation/b1/consolidated-test-11/AUTHORIZATION.json').read_text());raw=(ROOT/a['candidatePath']).read_bytes()
 if a.get('ownerApproved') is not True or a['candidate']['gitBlob']!=runner.BLOB or a['candidate']['sha256']!=runner.SHA or hashlib.sha256(raw).hexdigest()!=runner.SHA or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=runner.BLOB:raise RuntimeError('EXACT11_APPROVAL_BYTES_MISMATCH')
 g=runner.module('audit11','consolidate-b1-access-audit.py')
 for name,content in g.generate().items():
  if(g.DEST/name).read_text()!=content:raise RuntimeError('EXACT11_DIFF_ACL_RLS_MISMATCH')
 b.REPORT.update(scope='PG-TEST-01-CONSOLIDATED-11',increment='AUTHZ_REAL_VERTICAL',authorization=a,candidate=a['candidate'])
 runner.original_record('exact11-blob-sha256-full-reviewed-diff-and-ACL','PASS');return [('V4',raw.decode())]
def diagnostic_sql(text,role='postgres',database='core'):
 result=runner.sql(text,role,database)
 if result.returncode:
  import re
  # Only static PostgreSQL error categories/identifiers; never SQL, values or contexts.
  detail={'sqlstate':b.state(result)}
  match=re.search(r'(permission denied for (?:table|schema|function) [a-z_]+|column reference "[a-z_]+" is ambiguous|function [a-z_.]+\([^\n]*?\) does not exist)',result.stderr)
  if match:detail['category']=match.group(0)[:160]
  b.REPORT.setdefault('sqlDiagnostics',[]).append(detail)
 return result
def checks():
 tests=runner.module('sql11_security','pg11-access-security-tests.py')
 if not tests.gate(b):
  b.record('AUTHZ-dependent-tests','BLOCKED','SQL11 ACL prerequisites failed');return
 tests.run(b)
 browser=prior.nine.previous.browser
 browser.CONFIG='playwright.access11-b1.config.ts';browser.UI_SCOPE='EXECUTED_SQL11_AUTHZ_REAL_BROWSER';browser.SECURITY_GATE='pg11-access-security-tests.py'
 browser.browser()
runner.payload=payload;runner.checks=checks
# main() sets the transport; checks wrap it only after exact installation.
original_checks=checks
def with_diagnostics():
 b.sql=diagnostic_sql
 original_checks()
runner.checks=with_diagnostics
if __name__=='__main__':sys.exit(runner.main())
