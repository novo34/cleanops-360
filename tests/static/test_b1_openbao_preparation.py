"""Offline preparation invariants, not OpenBao runtime/security acceptance."""
import hashlib,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('prepare_bao',ROOT/'scripts/prepare-b1-openbao.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def fixture():
 return dict(environment='isolated-fixture',private_ipv4='10.42.1.2',api_dns='bao.fixture.invalid',node_id='fixture-node',token_ttl_seconds=60,token_max_ttl_seconds=300,secret_id_ttl_seconds=60,workload_cidrs=['10.42.2.0/24'],approved_key_reads=[dict(tenant='11111111-1111-1111-1111-111111111111',purpose='mail-aead',key_id='fixture-key-1',workload='mail-worker')],approved_key_creates=[dict(tenant='11111111-1111-1111-1111-111111111111',purpose='mail-aead',key_id='fixture-key-2')])
class Preparation(unittest.TestCase):
 def test_reproducible_private_tls_and_no_unreviewed_services(self):
  a=m.prepare(fixture());self.assertEqual(a,m.prepare(fixture()));c=a['server.json'];l=c['listener'][0]['tcp']
  self.assertFalse(c['ui']);self.assertFalse(l['tls_disable']);self.assertTrue(l['tls_require_and_verify_client_cert']);self.assertFalse(c['raw_storage_endpoint']);self.assertFalse(c['unsafe_allow_api_audit_creation']);self.assertFalse(c['plugin_auto_download'])
  audit=c['audit'][0]['file']['b1-private']['options'];self.assertEqual(audit['log_raw'],'false');self.assertNotEqual(audit['file_path'],'stdout')
 def test_exact_read_scopes_no_inherited_default_or_mutation(self):
  a=m.prepare(fixture());p=a['mail-worker.policy.json']['path'];self.assertEqual(len(p),1)
  for path,value in p.items():self.assertNotIn('*',path);self.assertNotIn('+',path);self.assertEqual(value['capabilities'],['read'])
  r=a['mail-worker.approle.json'];self.assertTrue(r['token_no_default_policy']);self.assertTrue(r['bind_secret_id']);self.assertEqual(r['secret_id_num_uses'],1)
  self.assertNotIn('identity-verifier.approle.json',a)
  self.assertIn('11111111-1111-1111-1111-111111111111',r['token_policies'][0])
  d=fixture();d['approved_key_creates'][0]['tenant']='22222222-2222-2222-2222-222222222222'
  with self.assertRaises(ValueError):m.prepare(d)
 def test_creator_has_no_update_or_delete_and_backup_no_restore(self):
  a=m.prepare(fixture());self.assertTrue(a['kv-config.json']['cas_required'])
  for v in a['key-creator.policy.json']['path'].values():self.assertEqual(v['capabilities'],['create']);self.assertNotIn('allowed_parameters',v)
  self.assertEqual(a['snapshot-reader.policy.json']['path'],{'sys/storage/raft/snapshot':{'capabilities':['read']}})
  self.assertEqual(a['restore-operator.policy.json']['path'],{'sys/storage/raft/snapshot':{'capabilities':['update']}})
 def test_public_addresses_missing_ttls_unknown_purpose_and_path_injection_rejected(self):
  cases=[('private_ipv4','8.8.8.8'),('workload_cidrs',['0.0.0.0/0']),('token_ttl_seconds',None),('token_ttl_seconds',301),('environment','production'),('node_id','../../secrets')]
  for key,value in cases:
   with self.subTest(key=key),self.assertRaises((ValueError,TypeError)):d=fixture();d[key]=value;m.prepare(d)
  for key,value in [('purpose','totp-aead'),('tenant','*'),('key_id','../key')]:
   with self.subTest(key=key),self.assertRaises(ValueError):d=fixture();d['approved_key_reads'][0][key]=value;m.prepare(d)
 def test_blank_record_cannot_render_and_no_operational_acceptance_fabricated(self):
  d=json.loads((m.BASE/'inputs.example.json').read_text());self.assertIsNone(d['secondary_custodian']);self.assertIsNone(d['primary_custodian_confirmed'])
  with self.assertRaises((ValueError,TypeError)):m.prepare(d)
  state=json.loads((ROOT/'docs/implementation/b1/closure/requirements.json').read_text());self.assertEqual(state['accepted'],42);self.assertEqual(state['runtime'],'closedBackend');self.assertEqual(state['authGate05'],'OPEN')
  self.assertEqual({r['id'] for r in state['requirements'] if r['acceptance']=='OPEN'},{'REQ-PR-006','REQ-PR-007'})
 def test_approved_sql14_unchanged(self):
  raw=(ROOT/'docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql').read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),'965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa')
if __name__=='__main__':unittest.main()
