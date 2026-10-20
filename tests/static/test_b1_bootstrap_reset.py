import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
def generator():
 spec=importlib.util.spec_from_file_location('bootstrap_review',ROOT/'scripts/consolidate-b1-bootstrap-reset.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
class BootstrapResetReview(unittest.TestCase):
 def test_one_function_no_existing_body_or_table_acl_changes(self):
  m=generator();files=m.generate();source=(m.DEST/'bootstrap-reset-owned.review.sql').read_text()
  for name,content in files.items():self.assertEqual((m.DEST/name).read_text(),content)
  restored=files['schema.review.sql'].split('\n',1)[1].replace(source,'')
  self.assertEqual(restored,m.BASE.read_text())
  manifest=json.loads(files['manifest.json'])
  for field in ['newRoles','newTables','newTableGrants','newRLSPolicies']:self.assertEqual(manifest[field],[])
  self.assertEqual(manifest['execute'],['cleanops_identity_service'])
  self.assertTrue(manifest['existingSQLBodiesUnchanged'])
  self.assertFalse(json.loads(files['EXECUTION_REQUEST.json'])['ownerApproved'])
 def test_no_auth_authority_and_existing_owned_completion_reused(self):
  m=generator();source=(m.DEST/'bootstrap-reset-owned.review.sql').read_text()
  for guard in ["resolve_binding(raw_bootstrap,raw_csrf,'BOOTSTRAP')",'boot.consumed_at IS NOT NULL','boot.expires_at<=clock_timestamp()',"boot.csrf_digest IS DISTINCT FROM",'reservation.request_digest IS DISTINCT FROM request_hash','reservation.owner_backend IS DISTINCT FROM pg_backend_pid()','reservation.owner_xid IS DISTINCT FROM pg_current_xact_id()',"reservation.state='COMPLETED'","'resetPassword'"]:
   self.assertIn(guard,source)
  for forbidden in ['CREATE TABLE','ALTER TABLE','GRANT SELECT','GRANT INSERT','GRANT UPDATE','GRANT DELETE','issue_active_session','new_preauth','reset_password_cas','RETURN QUERY EXECUTE']:
   self.assertNotIn(forbidden,source)
  self.assertEqual(source.count('CREATE FUNCTION '),1)
  self.assertIn("operation='resetPassword'",source)
  base=m.BASE.read_text();finish=base[base.index('CREATE FUNCTION identity_private.finish_owned'):base.index('CREATE FUNCTION auth_api.discard_owned')]
  self.assertIn('owner_xid=pg_current_xact_id()',finish)
  self.assertIn('owner_backend=pg_backend_pid()',finish)
  self.assertIn('ONE_TIME_PLAINTEXT_FORBIDDEN',finish)
if __name__=='__main__':unittest.main()
