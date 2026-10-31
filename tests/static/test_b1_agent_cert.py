import copy, fnmatch, importlib.util, json, os, re, shutil, ssl, subprocess, tempfile, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('agent_renderer',ROOT/'scripts/prepare-b1-openbao.py')
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)

class AgentCert(unittest.TestCase):
 def test_web_copy_recipe_keeps_reader_and_json_dependencies_importable_on_node24(self):
  recipe=(ROOT/'deploy/staging/Dockerfile').read_text()
  self.assertEqual(recipe.rsplit('FROM ',1)[1].splitlines()[0],'node:24-bookworm-slim')
  self.assertIn('COPY . .',recipe)
  self.assertIn('COPY --from=build --chown=cleanops:cleanops /app /app',recipe)
  self.assertIn('USER cleanops',recipe)
  ignored=[line.strip() for line in (ROOT/'.dockerignore').read_text().splitlines()
           if line.strip() and not line.startswith(('#','!'))]
  pending=[ROOT/'lib/b1/openbao-keys.ts']; dependencies=set()
  while pending:
   path=pending.pop()
   if path in dependencies:continue
   dependencies.add(path)
   if path.suffix=='.ts':
    pending.extend((path.parent/imported).resolve() for imported in
                   re.findall(r'''\bfrom\s*['"](\./[^'"]+)['"]''',path.read_text()))
  dependencies.update([ROOT/'package.json',ROOT/'scripts/prepare-b1-openbao.py'])
  with tempfile.TemporaryDirectory(prefix='agent-web-package-offline-') as directory:
   app=Path(directory)/'app'
   for path in dependencies:
    relative=path.relative_to(ROOT)
    self.assertFalse(any(fnmatch.fnmatchcase(str(relative),rule) or
                         any(fnmatch.fnmatchcase(part,rule) for part in relative.parts) for rule in ignored),str(relative))
    destination=app/relative;destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(path,destination)
   env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')}
   probe='''try {
    const module=await import('./lib/b1/openbao-keys.ts');
    process.stdout.write(JSON.stringify({nodeMajor:Number(process.versions.node.split('.')[0]),reader:typeof module.createAgentSinkToken==='function'}));
   } catch(error) {
    process.stdout.write(JSON.stringify({reader:false,code:error.code==='ERR_MODULE_NOT_FOUND'?'ERR_MODULE_NOT_FOUND':'IMPORT_FAILED'}));
   }'''
   def inspect_package():
    result=subprocess.run(['node','--experimental-strip-types','--input-type=module','-e',probe],
                          cwd=app,env=env,capture_output=True,text=True,timeout=15)
    self.assertEqual(result.returncode,0,'Packaged reader import process failed')
    return json.loads(result.stdout)
   self.assertEqual(inspect_package(),dict(nodeMajor=24,reader=True))
   # The deployed recipe must retain JSON imports, not just the TypeScript file.
   (app/'lib/b1/security-values.json').unlink()
   self.assertEqual(inspect_package(),dict(reader=False,code='ERR_MODULE_NOT_FOUND'))
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
