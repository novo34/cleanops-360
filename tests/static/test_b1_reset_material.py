import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
def module():
 spec=importlib.util.spec_from_file_location('reset_review',ROOT/'scripts/consolidate-b1-reset.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
class ResetMaterialReview(unittest.TestCase):
 def test_one_complete_candidate_preserves_exact07_and_only_adds_private_reader(self):
  m=module();files=m.generate()
  for name,content in files.items():self.assertEqual((m.DEST/name).read_text(),content)
  base=m.BASE.read_text();source=(m.DEST/'password-reset-material.review.sql').read_text()
  self.assertEqual(files['schema.review.sql'].split('\n',1)[1].replace(source+files['ACL.delta.sql'],''),base)
  manifest=json.loads(files['manifest.json']);self.assertEqual(manifest['newTableGrants'],[]);self.assertEqual(manifest['newRoles'],[]);self.assertEqual(manifest['newRLSPolicies'],[])
  self.assertEqual(manifest['newFunctionExecute'],['cleanops_identity_service'])
  request=json.loads(files['EXECUTION_REQUEST.json']);self.assertFalse(request['ownerApproved']);self.assertFalse(request['executed'])
 def test_no_secret_projection_or_unbound_context_and_same_mutator_lock_order(self):
  m=module();source=(m.DEST/'password-reset-material.review.sql').read_text()
  self.assertIn('SECURITY DEFINER SET search_path=pg_catalog',source)
  self.assertIn("ticket.token_digest=ticket_digest AND ticket.purpose='PASSWORD'",source)
  for guard in ['locked.consumed_at IS NOT NULL','clock_timestamp()>=locked.expires_at','current_version IS DISTINCT FROM locked.credential_version','locked.admin_policy_version FOR SHARE',"evidence.grant_key='B1-SELF-06'",'identity_private.valid_session']:
   self.assertIn(guard,source)
  self.assertLess(source.index('lock_pair_nowait'),source.index('lock_memberships'))
  self.assertLess(source.index('lock_memberships'),source.index('FOR UPDATE'))
  projection=source[source.index('RETURN jsonb_build_object'):]
  for secret in ['argon2id_hash','recovery_hash','token_digest','email_normalized','recipient','password_hash']:
   self.assertNotIn(secret,projection)
 def test_extra_grants_or_mutations_cannot_be_generated_as_the_reviewed_reader(self):
  m=module();original=m.DEST;source=(original/'password-reset-material.review.sql').read_text()
  with tempfile.TemporaryDirectory() as temporary:
   m.DEST=Path(temporary)
   for forbidden in ['GRANT SELECT ON identity_private.credentials TO cleanops_identity_service;','DELETE FROM identity_private.reset_tickets;','ALTER ROLE cleanops_identity_service BYPASSRLS;']:
    (m.DEST/'password-reset-material.review.sql').write_text(source+'\n'+forbidden+'\n')
    with self.assertRaises(ValueError):m.generate()
if __name__=='__main__':unittest.main()
