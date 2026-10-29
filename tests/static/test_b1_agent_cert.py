import copy, importlib.util, ssl, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('agent_renderer',ROOT/'scripts/prepare-b1-openbao.py')
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)

class AgentCert(unittest.TestCase):
 def inputs(self,environment='staging'):
  ca=ssl.DER_cert_to_PEM_cert(ssl.create_default_context().get_ca_certs(binary_form=True)[0])
  return dict(environment=environment,private_ipv4='10.1.2.3',api_dns='bao.example.invalid',node_id='node-a',token_ttl_seconds=300,token_max_ttl_seconds=900,secret_id_ttl_seconds=300,workload_cidrs=['10.1.2.0/24'],approved_key_creates=[],approved_key_reads=[dict(tenant='11111111-1111-4111-8111-111111111111',purpose='totp-aead',key_id='key-a',workload='identity-verifier')],agent=dict(workload='identity-verifier',address='https://bao.example.invalid:8200',ca_file='/private/ca.pem',client_cert_file='/private/client.pem',client_key_file='/private/client-key.pem',sink_file='/run/identity/token',cert_mount='workload-cert',cert_name='identity-a',certificate_common_name='identity-a',public_auth_ca_pem=ca,sink_mode='0600',sink_uid=1000,sink_gid=1000,directory_uid=1000,directory_gid=1000,directory_mode='0700',read_timeout_ms=1000))
 def test_same_canonical_agent_in_both_environments(self):
  for env in ['staging','production']:
   inputs=self.inputs(env)
   for field in ['private_ipv4','api_dns','node_id','secret_id_ttl_seconds','approved_key_creates']:inputs.pop(field)
   out=renderer.prepare(inputs,agent_only=True)
   self.assertEqual(set(out),{'agent.hcl','identity-verifier.sink-reader.json','identity-verifier.policy.json','identity-verifier.cert-role.json'})
   agent=out['agent.hcl']
   for forbidden in ['listener','api_proxy','cache','template','tls_disable']:self.assertNotIn(forbidden,agent)
   for required in ['tls_skip_verify = false','reload = true','method "cert"','sink "file"','mount_path = "auth/workload-cert"']:self.assertIn(required,agent)
   policy=out['identity-verifier.policy.json']['path'];self.assertEqual(len(policy),2)
   self.assertEqual(policy['auth/token/renew-self'],{'capabilities':['update']})
   self.assertTrue(out['identity-verifier.cert-role.json']['token_no_default_policy'])
   self.assertEqual(out['identity-verifier.sink-reader.json']['mode'],0o600)
 def test_rejects_unbounded_or_ambiguous_inputs(self):
  for field,value in [('address','http://bao.invalid'),('address','https://${ENV}/'),('cert_mount','*'),('cert_name',''),('sink_uid',-1),('sink_file','relative'),('sink_file','/run/${TOKEN}'),('public_auth_ca_pem','PRIVATE KEY')]:
   data=copy.deepcopy(self.inputs());data['agent'][field]=value
   with self.subTest(field=field),self.assertRaises((ValueError,ssl.SSLError)):
    renderer.prepare(data,agent_only=True)
  data=self.inputs();data['approved_key_reads']=[]
  with self.assertRaises(ValueError):renderer.prepare(data,agent_only=True)

if __name__=='__main__':unittest.main()
