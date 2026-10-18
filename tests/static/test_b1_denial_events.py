"""No privilege/contract drift in the one complete uninstalled proposal."""
import importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('events13',ROOT/'scripts/consolidate-b1-denial-events.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class DenialProposal(unittest.TestCase):
 def test_reproducibility_and_no_installation_authority(self):
  files=m.generate()
  for name,text in files.items():self.assertEqual((m.DEST/name).read_text(),text)
  meta=json.loads(files['manifest.json']);self.assertFalse(meta['installationAuthorized'])
  for field in ['tableChanges','roleChanges','rlsChanges','directTablePrivilegeChanges','existingSignatureChanges']:self.assertEqual(meta[field],[])
 def test_only_two_allowlisted_failure_codes_beyond_exact_uninstalled12(self):
  result=m.generate()['schema.review.sql'];base=m.BASE.read_text()
  self.assertEqual(result.replace(m.NEW,m.OLD),base)
  self.assertEqual(result.count(m.NEW),1)
  self.assertEqual(result.count('CREATE FUNCTION auth_api.select_tenant_rotated_owned('),1)
  self.assertNotIn('GRANT SELECT ON identity_private.security_log',result)
if __name__=='__main__':unittest.main()
