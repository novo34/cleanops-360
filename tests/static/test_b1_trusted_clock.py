"""No database: exact candidate scope, unchanged security contracts and hashes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('trusted_clock',ROOT/'scripts/consolidate-b1-trusted-clock.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TrustedClock(unittest.TestCase):
 def test_reproducible_full_candidate(self):
  for name,content in m.generate().items():self.assertEqual((m.DEST/name).read_text(),content)
 def test_only_existing_function_clock_changes(self):
  source=m.SOURCE.read_text();target=m.generate()['schema.review.sql']
  a=source.index('CREATE FUNCTION auth_api.register_trusted_device(');z=source.index('END $fn$;',a)+len('END $fn$;')
  aa=target.index('CREATE FUNCTION auth_api.register_trusted_device(');zz=target.index('END $fn$;',aa)+len('END $fn$;')
  self.assertEqual(source[:a],target[:aa]);self.assertEqual(source[z:],target[zz:])
  body=target[aa:zz];self.assertEqual(body.count('clock_timestamp()'),1)
  for rule in ["identity_private.guard('B1-SELF-06',true)",'SECURITY DEFINER SET search_path=pg_catalog','octet_length(token_hash)<>32',"registered_at,registered_at+interval '30 days'",'identity_private.append_audit']:self.assertIn(rule,body)
 def test_manifest_exact_hashes_no_installation_or_privilege_changes(self):
  files=m.generate();manifest=json.loads(files['manifest.json']);raw=files['schema.review.sql'].encode()
  self.assertEqual(manifest['candidateArtifact']['gitBlob'],m.blob(raw));self.assertEqual(manifest['candidateArtifact']['sha256'],hashlib.sha256(raw).hexdigest())
  self.assertFalse(manifest['installationAuthorized'])
  for key in ['newSignatures','aclChanges','roleChanges','tableChanges','rlsChanges']:self.assertEqual(manifest[key],[])
 def test_runner_remains_pinned_to_authorized09(self):
  source=(ROOT/'scripts/pg-consolidated-09.py').read_text()
  self.assertIn(m.OLD_BLOB,source);self.assertIn(m.OLD_SHA,source);self.assertNotIn('revisions/10',source)
if __name__=='__main__':unittest.main()
