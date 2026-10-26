import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
def module():
 spec=importlib.util.spec_from_file_location('reset_review',ROOT/'scripts/consolidate-b1-reset.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
class ResetMaterialReview(unittest.TestCase):
 def test_one_complete_candidate_changes_only_reviewed_recovery_predicates_and_private_reader(self):
  m=module();files=m.generate()
  for name,content in files.items():self.assertEqual((m.DEST/name).read_text(),content)
  base=m.BASE.read_text();source=(m.DEST/'password-reset-material.review.sql').read_text()
  reader_acl=files['ACL.delta.sql'][files['ACL.delta.sql'].index('ALTER FUNCTION '):]
  restored=files['schema.review.sql'].split('\n',1)[1].replace(source+reader_acl,'').replace(m.BINDING_DDL,'')
  patched,changes=m.bind_recovery(base)
  for old,new in changes.values():restored=restored.replace(new,old)
  self.assertEqual(restored,base)
  manifest=json.loads(files['manifest.json']);self.assertEqual(manifest['newTableGrants'],['SELECT,INSERT,DELETE ON identity_private.recovery_enrollments TO cleanops_auth_broker']);self.assertEqual(manifest['newRoles'],[]);self.assertEqual(manifest['newRLSPolicies'],['identity_private.recovery_enrollments:broker_internal'])
  self.assertEqual(len(manifest['changedFunctionBodies']),5)
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
 def test_recovery_binding_is_durable_and_completion_reset_scoped(self):
  m=module();base=m.BASE.read_text();patched,changes=m.bind_recovery(base)
  self.assertIn('FORCE ROW LEVEL SECURITY',m.BINDING_DDL)
  self.assertNotIn('expires_at',m.BINDING_DDL)
  self.assertNotIn('TO cleanops_identity_service',m.BINDING_DDL)
  self.assertNotIn('UPDATE ON',m.BINDING_DDL)
  checked=changes['identity_private.checked_preauth'][1]
  for field in ['pending.tenant_id=q.tenant_id','pending.user_id=q.user_id','pending.cookie_digest IS DISTINCT FROM q.cookie_digest','pending.credential_version IS DISTINCT FROM q.credential_version']:
   self.assertIn(field,checked)
  self.assertIn('INSERT INTO identity_private.recovery_enrollments',changes['auth_api.recover_to_enrollment'][1])
  issued=changes['auth_api.issue_active_session'][1]
  self.assertLess(issued.index("q.state<>'VERIFIED'"),issued.index('DELETE FROM identity_private.recovery_enrollments'))
  self.assertIn('cookie_digest=q.cookie_digest',issued)
  gc=patched[patched.index('CREATE FUNCTION auth_api.gc_ephemeral'):]
  gc=gc[:gc.index('END $fn$;')]
  self.assertNotIn('recovery_enrollments',gc)
 def test_extra_grants_or_mutations_cannot_be_generated_as_the_reviewed_reader(self):
  m=module();original=m.DEST;source=(original/'password-reset-material.review.sql').read_text()
  with tempfile.TemporaryDirectory() as temporary:
   m.DEST=Path(temporary)
   for forbidden in ['GRANT SELECT ON identity_private.credentials TO cleanops_identity_service;','DELETE FROM identity_private.reset_tickets;','ALTER ROLE cleanops_identity_service BYPASSRLS;']:
    (m.DEST/'password-reset-material.review.sql').write_text(source+'\n'+forbidden+'\n')
    with self.assertRaises(ValueError):m.generate()
if __name__=='__main__':unittest.main()
