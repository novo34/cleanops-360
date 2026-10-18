"""Proposed11 only: exact consolidated shape and required security boundaries, no DB."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('access_audit',ROOT/'scripts/consolidate-b1-access-audit.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class AccessAuditReview(unittest.TestCase):
 def test_full_consolidated_reproducible_preserves_every_approved_body(self):
  files=m.generate();source=m.SOURCE.read_text();extension=(m.DEST/'access-owned.review.sql').read_text()
  self.assertEqual(files['schema.review.sql'],source[:-len('COMMIT;\n')]+extension+'\nCOMMIT;\n')
  for name,content in files.items():self.assertEqual((m.DEST/name).read_text(),content)
 def test_private_owned_actor_and_exclusive_policy_before_share_authorization(self):
  s=(m.DEST/'access-owned.review.sql').read_text()
  for text in ['c:=identity_private.context()','r.tenant_id=c.tenant_id','r.user_id=c.user_id',"r.operation='changeAccess'",'r.owner_backend=pg_backend_pid()','r.owner_xid=pg_current_xact_id()','r.one_time_result','r.request_digest=request_hash','r.key_digest=key_hash','r.expires_at>clock_timestamp()','RESERVATION_NOT_OWNED']:
   self.assertIn(text,s)
  self.assertLess(s.index('SELECT p.version INTO actual'),s.index('auth_api.effective_access('))
  self.assertIn('SET search_path=pg_catalog',s);self.assertNotIn('SET ROLE',s);self.assertNotIn('BYPASSRLS',s)
 def test_audit_is_server_derived_private_and_denials_are_not_raised_after_logging(self):
  s=(m.DEST/'access-owned.review.sql').read_text()
  for text in ["'reason',reason_value","'before',before_state","'after',after_state",'actor_user_id',"'SUCCESS' ELSE 'DENY'",'ELSE before_state:=NULL;after_state:=NULL;audit_resource:=NULL',"jsonb_build_object('changed',false,'error',denial)",'EXCEPTION WHEN insufficient_privilege']:
   self.assertIn(text,s)
  self.assertNotIn("payload->'before'",s);self.assertNotIn("payload->'after'",s)
 def test_reactivation_cannot_bypass_approved_no_overdelegation(self):
  s=(m.DEST/'access-owned.review.sql').read_text()
  self.assertIn('IF revoked_role IS TRUE THEN',s);self.assertIn("r.effect='ALLOW'",s)
  self.assertIn('auth_api.effective_access(r.action,r.resource_kind,r.resource_id) IS DISTINCT FROM true',s)
  self.assertLess(s.index('IF NOT delegation_denied THEN'),s.index('changed:=auth_api.set_access_role'))
 def test_exact_wrapper_acl_replaces_only_five_legacy_execute_grants(self):
  s=(m.DEST/'access-owned.review.sql').read_text();meta=json.loads(m.generate()['manifest.json'])
  self.assertEqual(s.count('CREATE FUNCTION '),1);self.assertEqual(s.count('GRANT EXECUTE ON FUNCTION'),1);self.assertEqual(s.count('REVOKE EXECUTE ON FUNCTION'),5)
  self.assertIn('TO cleanops_identity_service;',s)
  self.assertNotIn('CREATE ROLE ',s);self.assertNotIn('ALTER TABLE ',s);self.assertNotIn('GRANT SELECT',s)
  self.assertFalse(meta['installationAuthorized']);self.assertEqual(meta['tableChanges'],[]);self.assertEqual(meta['rlsChanges'],[])
  raw=m.generate()['schema.review.sql'].encode();self.assertEqual(m.blob(raw),meta['candidateArtifact']['gitBlob']);self.assertEqual(hashlib.sha256(raw).hexdigest(),meta['candidateArtifact']['sha256'])
if __name__=='__main__':unittest.main()
