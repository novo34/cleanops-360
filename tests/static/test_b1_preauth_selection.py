"""SQL12 proposal scope and reproducibility, no database execution/acceptance."""
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('selection12',ROOT/'scripts/consolidate-b1-preauth-selection.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PreauthSelectionReview(unittest.TestCase):
 def test_exact_approved11_and_full_consolidated_reproducible(self):
  expected=m.generate()
  for name,content in expected.items():self.assertEqual((m.DEST/name).read_text(),content)
  self.assertEqual(expected['schema.review.sql'],m.SOURCE.read_text()[:-len('COMMIT;\n')]+(m.DEST/'preauth-selection.review.sql').read_text()+'\nCOMMIT;\n')
 def test_only_new_function_acl_and_no_existing_security_contract_rewrite(self):
  s=(m.DEST/'preauth-selection.review.sql').read_text();meta=json.loads(m.generate()['manifest.json'])
  self.assertEqual(s.count('CREATE FUNCTION '),1);self.assertEqual(s.count('GRANT EXECUTE ON FUNCTION'),1)
  for text in ['CREATE ROLE','ALTER TABLE','CREATE TABLE','GRANT SELECT','CREATE POLICY','issue_active_session','new_preauth(']:self.assertNotIn(text,s)
  self.assertIn('SECURITY DEFINER SET search_path=pg_catalog',s);self.assertIn('FROM PUBLIC',s);self.assertFalse(meta['installationAuthorized'])
 def test_verified_unbound_context_owned_cas_true_rotation_no_lifetime_extension(self):
  s=(m.DEST/'preauth-selection.review.sql').read_text()
  for text in ["q.state<>'SELECTION'",'q.factor_verified_at IS NOT NULL','q.origin_session_id IS NOT NULL','q.credential_version IS DISTINCT FROM','r.owner_backend=pg_backend_pid()','r.owner_xid=pg_current_xact_id()','r.one_time_result',"r.operation='switchTenant'",'r.key_digest=key_hash','r.request_digest=request_hash','r.expires_at>clock_timestamp()','new_cookie_hash=q.cookie_digest','new_csrf_hash=q.csrf_digest','auth_api.select_tenant(raw_preauth,target_tenant,corr)','EXCEPTION WHEN insufficient_privilege',"jsonb_build_object('selected',false,'error','POLICY_DENIED')"]:self.assertIn(text,s)
  self.assertGreaterEqual(s.count('r.expires_at>clock_timestamp()'),2)
  self.assertNotIn('SET expires_at',s);self.assertNotIn('UPDATE app.sessions',s)
if __name__=='__main__':unittest.main()
