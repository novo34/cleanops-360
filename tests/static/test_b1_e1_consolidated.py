import importlib.util
import json
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('e1',ROOT/'scripts/consolidate-b1-e1.py')
e1=importlib.util.module_from_spec(spec);spec.loader.exec_module(e1)
class E1Consolidated(unittest.TestCase):
 def test_reproducible_candidate_and_full_diff(self):
  for name,value in e1.generate().items():self.assertEqual((e1.DEST/name).read_text(),value,name)
  m=json.loads(e1.generate()['manifest.json']);self.assertFalse(m['installationAuthorized']);self.assertFalse(m['sqlCompiled']);self.assertEqual(m['runtime'],'closedBackend')
 def test_no_legacy_email_bypass_or_direct_service_grants(self):
  sql=e1.generate()['schema.review.sql'];acl=e1.generate()['ACL.sql']
  self.assertIn("method_kind IS DISTINCT FROM 'TOTP'",sql)
  self.assertIn('FROM cleanops_mail_worker;',acl);self.assertIn('auth_api.consume_email_otp',acl)
  for line in sql.split('-- BEGIN E1 CONSOLIDATED REVIEW ONLY')[1].splitlines():
   if line.startswith('GRANT ') and ' ON app.' in line:self.assertTrue(line.endswith('TO cleanops_auth_broker;'),line)
   self.assertNotIn('BYPASSRLS;',line.replace('NOBYPASSRLS;',''))
 def test_owners_acl_and_search_path_are_explicit(self):
  m=json.loads(e1.generate()['manifest.json']);acl=e1.generate()['ACL.sql']
  self.assertTrue(m['functions'])
  for f in m['functions']:
   self.assertIn('ALTER FUNCTION '+f['signature']+' OWNER TO cleanops_auth_broker;',acl)
   self.assertIn('REVOKE ALL ON FUNCTION '+f['signature']+' FROM PUBLIC;',acl)
  source=(e1.DEST/'e1-source.review.sql').read_text()
  self.assertEqual(source.count('CREATE FUNCTION '),source.count('SECURITY DEFINER SET search_path=pg_catalog'))
  self.assertEqual(source.count('CREATE FUNCTION '),len(m['functions']))
  for name in ['auth_api.claim_mail_v2(bytea,uuid)','auth_api.consume_email_v2(text,uuid,bytea,bigint,bigint,uuid)']:
   self.assertIn('REVOKE ALL ON FUNCTION '+name+' FROM PUBLIC;',acl)
 def test_uncertain_delivery_no_reclaim_and_expiry_guard(self):
  source=(e1.DEST/'e1-source.review.sql').read_text()
  self.assertIn("outcome='UNKNOWN' THEN 'QUARANTINED'",source)
  self.assertIn("next_state='PENDING' THEN next_at ELSE available_at",source)
  claim=source.split('CREATE FUNCTION auth_api.claim_mail_v2')[1].split('CREATE FUNCTION ')[0]
  self.assertNotIn("IN('PENDING','CLAIMED')",claim)
  self.assertIn("WHERE state='PENDING'",claim)
  self.assertIn('expected_version IS NULL OR expected_version<1 OR recipient_version IS NULL',source)
 def test_recovery_never_issues_session_or_promotes_verified(self):
  source=(e1.DEST/'e1-source.review.sql').read_text()
  recovery=source.split('CREATE FUNCTION auth_api.recover_to_enrollment')[1].split('CREATE FUNCTION ')[0]
  self.assertIn("'ENROLLMENT_REQUIRED'",recovery);self.assertNotIn('issue_active_session',recovery)
  reset=source.split('CREATE FUNCTION auth_api.reset_password_cas')[1].split('CREATE FUNCTION ')[0]
  self.assertIn('recovery_hash',reset);self.assertIn('credential_version=credential_version+1',reset);self.assertNotIn('issue_active_session',reset)
 def test_runtime_unchanged(self):
  self.assertIn('closedBackend',(ROOT/'lib/b1/runtime.ts').read_text())
if __name__=='__main__':unittest.main()
