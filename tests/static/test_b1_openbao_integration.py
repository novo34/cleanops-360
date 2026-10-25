"""Native B1/custody evidence must retain provenance and operational boundaries."""
import hashlib,json,subprocess,unittest
from pathlib import Path
R=Path(__file__).resolve().parents[2]
class Integration(unittest.TestCase):
 def test_actual_source_independent_restore_and_negative_results(self):
  d=json.loads((R/'docs/implementation/b1/operational-acceptance/openbao/integration/EXECUTION.json').read_text())
  self.assertEqual(d['source'],'08ecbab3e3816f660d635d0ee48b92f92850eb7f')
  self.assertEqual(d['run'],39150315948);self.assertEqual(d['job'],117742437707)
  self.assertEqual(d['result'],'PASS');self.assertEqual(d['cleanup'],'PASS')
  self.assertEqual(len(d['checks']),144);self.assertTrue(all(c['status']=='PASS' for c in d['checks']))
  names={c['name'] for c in d['checks']}
  for name in ['primary-B1-real-API-password-TOTP-PG-session-OpenBao-keys','primary-B1-actual-envelope-v2-rotation-old-new-authentication','primary-B1-deleted-key-version-denied-without-fallback','primary-B1-key-negative-wrong-tenant-version-revoked-token','primary-B1-unavailable-OpenBao-no-HTTP-operation-no-session-effect','frozen-source-security-checkpoint-unchanged','fresh-PG16-all-32-table-values-identical-after-independent-backup','restore-B1-restored-PG-MFA-ciphertext-old-new-OpenBao-versions','restore-B1-restored-mail-envelope-exact-AAD-purpose-permissions','restore-B1-restored-real-API-session-audit-multitenant-integrity','primary-audit-full-injection-no-free-blocks-and-append-denied','fresh-restore-container-owned-cleanup','preexisting-containers-networks-volumes-unchanged']:self.assertIn(name,names)
  self.assertEqual(next(c for c in d['checks'] if c['name']=='primary-audit-full-observed-HTTP-status')['detail']['status'],500)
  self.assertEqual(len(d['independentEncryptedBackups']),2)
  self.assertNotEqual(*d['independentEncryptedBackups'].values())
  self.assertGreater(d['freshCombinedRecoverySeconds'],d['openBaoAndPostRestoreCheckSeconds'])
  for path,expected in d['codeSha256'].items():
   # The frozen 144-check run belongs to its pinned source commit, not HEAD.
   # Never rewrite historical evidence to match later implementation changes.
   source=subprocess.run(['git','show',f'{d["source"]}:{path}'],cwd=R,capture_output=True,check=True).stdout
   self.assertEqual(hashlib.sha256(source).hexdigest(),expected,path)
 def test_failures_and_unaccepted_real_custody_are_not_hidden(self):
  folder=R/'docs/implementation/b1/operational-acceptance/openbao/integration'
  for number in [1,2,3]:
   d=json.loads((folder/f'ATTEMPT_{number:02}.json').read_text());self.assertEqual(d['result'],'FAIL');self.assertEqual(d['cleanup'],'PASS')
  d=json.loads((folder/'EXECUTION.json').read_text())
  self.assertEqual(d['accepted'],42);self.assertEqual(d['runtime'],'closedBackend')
  self.assertEqual(d['PR006'],'OPEN');self.assertEqual(d['PR007'],'OPEN');self.assertFalse(d['productiveCustodyAccepted']);self.assertFalse(d['realSwissResidenceVerified']);self.assertFalse(d['newBrowserExecuted'])
  self.assertEqual(d['principalCustodian'],'PROJECT_OWNER_CONFIRMED');self.assertEqual(d['productiveQuorum'],'NOT_APPROVED')
  self.assertNotIn('privateResult',d);self.assertNotIn('backupKey',d);self.assertNotIn('root',d)
  self.assertEqual(d['candidate']['gitBlob'],'1971a9fdc5c1f3fd1fcb5f6706459678e5399256')
  m=json.loads((R/'docs/implementation/b1/closure/requirements.json').read_text());self.assertEqual(m['accepted'],42)
  self.assertEqual({r['id'] for r in m['requirements'] if r['acceptance']=='OPEN'},{'REQ-PR-006','REQ-PR-007'})
if __name__=='__main__':unittest.main()
