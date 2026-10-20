"""Actual synthetic run provenance must never become operational/PO acceptance."""
import json,unittest
from pathlib import Path
R=Path(__file__).resolve().parents[2]
class Execution(unittest.TestCase):
 def test_real_cases_hash_cleanup_and_no_secret_bundle(self):
  d=json.loads((R/'docs/implementation/b1/operational-acceptance/openbao/isolated/EXECUTION.json').read_text())
  self.assertEqual(d['result'],'PASS');self.assertEqual(d['cleanup'],'PASS');self.assertEqual(d['run'],39147433440);self.assertEqual(d['source'],'80f441fd4c488f7856271e0487b206afcd667a4b')
  self.assertEqual(len(d['checks']),47);self.assertTrue(all(c['status']=='PASS' for c in d['checks']))
  names={c['name'] for c in d['checks']}
  for n in ['tenant-A-allowed-tenant-B-denied','mail-worker-purpose-isolation','concurrent-CAS-create-exactly-one-winner','least-privilege-snapshot-read-no-restore','normal-restore-identity-cannot-force','separately-scoped-fresh-target-force-restore','restored-original-custody-quorum-required','restored-ordinary-AppRole-keeps-tenant-and-purpose-isolation','preexisting-containers-networks-volumes-unchanged']:self.assertIn(n,names)
  self.assertEqual(next(c for c in d['checks'] if c['name']=='audit-full-observed-HTTP-status')['detail']['status'],500)
  self.assertEqual(d['release']['assetSha256'],'0e2f1ce10d124e03112b50dd2fbec6b78003783253bc3a91587938f39d1e2243')
  self.assertNotIn('privateResult',d);self.assertFalse(d['productiveCustodyAccepted']);self.assertFalse(d['realSwissResidenceVerified']);self.assertFalse(d['postgresExecuted'])
 def test_historical_failures_and_open_acceptance_retained(self):
  for i in [1,2,3]:
   d=json.loads((R/f'docs/implementation/b1/operational-acceptance/openbao/isolated/ATTEMPT_{i:02}.json').read_text());self.assertEqual(d['result'],'FAIL');self.assertEqual(d['cleanup'],'PASS')
  m=json.loads((R/'docs/implementation/b1/closure/requirements.json').read_text());self.assertEqual(m['accepted'],42);self.assertEqual(m['runtime'],'closedBackend');self.assertEqual({x['id'] for x in m['requirements'] if x['acceptance']=='OPEN'},{'REQ-PR-006','REQ-PR-007'})
if __name__=='__main__':unittest.main()
