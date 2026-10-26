import importlib.util
import re
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('e1_lifecycle',ROOT/'scripts/consolidate-b1-e1.py');e1=importlib.util.module_from_spec(spec);spec.loader.exec_module(e1)
class E1Lifecycle(unittest.TestCase):
 def test_original06_remains_exact_approved_bytes(self):
  raw=e1.generate('06')['schema.review.sql'].encode();self.assertEqual(e1.hashes(raw)['gitBlob'],'939a521911e34296e055eb05c57264cbeee6d785')
 def test_one_complete07_reproduces_and_preserves_public_signatures(self):
  for name,value in e1.generate('07').items():self.assertEqual((e1.DEST.with_name('07')/name).read_text(),value)
  before=e1.generate('06')['schema.review.sql'];after=e1.generate('07')['schema.review.sql']
  self.assertEqual(re.findall(r'CREATE(?: OR REPLACE)? FUNCTION auth_api\.[^(]+\([^)]*\)',before),re.findall(r'CREATE(?: OR REPLACE)? FUNCTION auth_api\.[^(]+\([^)]*\)',after))
 def test_gc_preserves_quarantine_and_email_null_invariant(self):
  sql=e1.generate('07')['schema.review.sql'];gc=sql.split('CREATE FUNCTION auth_api.gc_ephemeral()')[1].split('END $fn$;')[0]
  self.assertIn("NOT IN('SENT','CANCELLED','QUARANTINED')",gc);self.assertIn("state IN('CLAIMED','DISPATCHING')",gc)
  self.assertIn("secret_ciphertext=CASE WHEN kind='TOTP'",gc);self.assertIn("key_version=CASE WHEN kind='TOTP' THEN 'PURGED' ELSE NULL END",gc)
 def test_new_version_writes_have_exact_column_privileges(self):
  sql=e1.generate('07')['schema.review.sql'];self.assertIn('GRANT UPDATE(version) ON app.policy_versions TO cleanops_auth_broker;',sql)
  self.assertIn('GRANT UPDATE(credential_version) ON identity_private.credentials TO cleanops_auth_broker;',sql)
  self.assertNotIn('GRANT UPDATE ON identity_private.credentials',sql)
 def test_all_session_locks_compatible_with_context_fk(self):
  sql=e1.generate('07')['schema.review.sql'];self.assertFalse(re.search(r'FROM app\.sessions[^;]*?FOR UPDATE',sql))
  self.assertEqual(len(re.findall(r'FROM app\.sessions[^;]*?FOR NO KEY UPDATE',sql)),5)
 def test_reciprocal_admin_locking_fails_closed_without_deadlock(self):
  generated=e1.generate('07');sql=generated['schema.review.sql'];self.assertIn('FOR UPDATE NOWAIT',sql)
  self.assertIn('REVOKE ALL ON FUNCTION identity_private.lock_pair_nowait(uuid,uuid) FROM PUBLIC;',generated['ACL.sql'])
  self.assertNotIn('GRANT EXECUTE ON FUNCTION identity_private.lock_pair_nowait',generated['ACL.sql'])
  for name in ['admin_reset_mfa','authorize_password_reset','reset_password_cas']:
   body=sql.split('CREATE FUNCTION auth_api.'+name+'(')[1].split('END $fn$;')[0];self.assertIn('lock_pair_nowait',body)
if __name__=='__main__':unittest.main()
