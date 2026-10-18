#!/usr/bin/env python3
"""Real synthetic OpenBao drill, fresh network-none containers; no PostgreSQL or B1 runtime."""
import hashlib,importlib.util,json,os,shutil,subprocess,tarfile,tempfile,time,urllib.request,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'docs/implementation/b1/operational-acceptance/openbao'
REPORT={'scope':'B1_OPENBAO_SYNTHETIC_ISOLATED','B1':'OPEN','accepted':42,'AUTH-GATE-05':'OPEN','runtime':'closedBackend','checks':[],'productiveCustodyAccepted':False,'realSwissResidenceVerified':False,'signatureTrustVerified':False,'postgresExecuted':False}
containers=[];private={};tmp=None;PHASE="START"
RUN='b1-bao-'+uuid.uuid4().hex
ENV=dict(os.environ);ENV.pop('DOCKER_HOST',None);ENV.pop('DOCKER_CONTEXT',None)
def cmd(*args,data=None,timeout=120):
 r=subprocess.run(args,input=data,capture_output=True,text=not isinstance(data,bytes),timeout=timeout,env=ENV)
 if isinstance(r.stdout,bytes):r.stdout=r.stdout.decode('utf8',errors='replace');r.stderr=r.stderr.decode('utf8',errors='replace')
 return r
def docker(*args,**kw):return cmd('docker','--host=unix:///var/run/docker.sock',*args,**kw)
def require(r):
 if r.returncode:
  flags={'read-only':'READ_ONLY_FILESYSTEM','permission denied':'PERMISSION_DENIED','no such file':'FILE_NOT_FOUND','no space left':'NO_SPACE'}
  raise RuntimeError(next((v for k,v in flags.items() if k in r.stderr.lower()),'PROCESS_FAILED'))
 return r.stdout.strip()
def record(name,status='PASS',detail=None):
 x={'name':name,'status':status}
 if detail is not None:x['detail']=detail
 REPORT['checks'].append(x)
def inventory():
 return {kind:sorted(require(docker(*args)).split()) for kind,args in [('containers',('ps','-aq')),('networks',('network','ls','-q')),('volumes',('volume','ls','-q'))]}
def openssl(*args):require(cmd('openssl',*args))
def certificates(t):
 for prefix in ['ca','foreign-ca']:
  openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(t/(prefix+'-key.pem')),'-out',str(t/(prefix+'.pem')),'-days','1','-subj','/CN=B1 synthetic '+prefix)
 for prefix,ext in [('server','subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth'),('client','extendedKeyUsage=clientAuth')]:
  openssl('req','-newkey','rsa:2048','-nodes','-keyout',str(t/(prefix+'-key.pem')),'-out',str(t/(prefix+'.csr')),'-subj','/CN=B1 synthetic '+prefix)
  (t/'extension.txt').write_text(ext+'\n')
  openssl('x509','-req','-in',str(t/(prefix+'.csr')),'-CA',str(t/'ca.pem'),'-CAkey',str(t/'ca-key.pem'),'-CAcreateserial','-out',str(t/(prefix+'.pem')),'-days','1','-extfile',str(t/'extension.txt'))
def configuration():
 spec=importlib.util.spec_from_file_location('prep',ROOT/'scripts/prepare-b1-openbao.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 tenant='11111111-1111-1111-1111-111111111111'
 reads=[{'tenant':tenant,'purpose':p,'key_id':k,'workload':w} for w,p,k in [('identity-verifier','totp-aead','key-v1'),('identity-verifier','totp-aead','key-v2'),('mail-worker','mail-aead','key-mail')]]
 creates=[{'tenant':tenant,'purpose':'totp-aead','key_id':k} for k in ['key-v2','race-key']]
 pack=m.prepare(dict(environment='isolated-fixture',private_ipv4='10.42.1.2',api_dns='bao.fixture.invalid',node_id='synthetic-node',token_ttl_seconds=120,token_max_ttl_seconds=300,secret_id_ttl_seconds=60,workload_cidrs=['10.42.2.0/24'],approved_key_reads=reads,approved_key_creates=creates))
 server=json.loads(json.dumps(pack['server.json']).replace('10.42.1.2','127.0.0.1').replace('bao.fixture.invalid','localhost').replace('/run/openbao-tls/server-chain.pem','/work/server.pem').replace('/run/openbao-tls/server-key.pem','/work/server-key.pem').replace('/run/openbao-tls/workload-ca.pem','/work/ca.pem'))
 for name,data in pack.items():
  if name.endswith('.approle.json'):data['secret_id_bound_cidrs']=['127.0.0.1/32'];data['token_bound_cidrs']=['127.0.0.1/32']
 REPORT['fixtureOnlyDifferences']=['Private RFC1918 binding/DNS replaced by loopback inside network-none sandbox','TLS paths point to synthetic24h test certificates','Workload CIDRs narrowed to127.0.0.1/32; TTL120/300/60 trial only','Two-of-two synthetic Shamir initialization is not productive quorum approval']
 REPORT['serverConfigSha256']=hashlib.sha256(json.dumps(server,sort_keys=True).encode()).hexdigest()
 return pack,server
before=None
try:
 before=inventory();tmp=Path(tempfile.mkdtemp(prefix=RUN+'-'));os.chmod(tmp,0o700)
 pin=json.loads((BASE/'release-pin.json').read_text());asset=next(a for a in pin['assets'] if a['name']=='openbao_2.7.1_linux_amd64.tar.gz')
 archive=tmp/'bao.tar.gz'
 with urllib.request.urlopen(asset['url'],timeout=90) as r,archive.open('wb') as f:shutil.copyfileobj(r,f)
 digest=hashlib.sha256(archive.read_bytes()).hexdigest()
 if 'sha256:'+digest!=asset['githubApiDigest']:raise RuntimeError('PINNED_BINARY_DIGEST_MISMATCH')
 with tarfile.open(archive) as a:
  member=next(m for m in a.getmembers() if m.name in {'bao','./bao'} and m.isfile())
  with a.extractfile(member) as src,(tmp/'bao').open('wb') as dst:shutil.copyfileobj(src,dst)
 os.chmod(tmp/'bao',0o755);REPORT['release']={'version':pin['tag'],'assetSha256':digest,'digestSource':'committed GitHub release metadata; independent signer trust not claimed'};record('exact-pinned-OpenBao-binary-SHA256')
 manifest=json.loads(require(docker('manifest','inspect','node:24-bookworm-slim')))
 dg=next(x['digest'] for x in manifest['manifests'] if x['platform'].get('os')=='linux' and x['platform'].get('architecture')=='amd64')
 image='node@'+dg;require(docker('pull',image,timeout=180));REPORT['sandboxImage']=image
 certificates(tmp);pack,server=configuration();(tmp/'server.json').write_text(json.dumps(server));shutil.copy(ROOT/'scripts/openbao-isolated-worker.mjs',tmp/'worker.mjs')
 def transfer(cid,source,target):
  require(docker('exec','-i',cid,'node','-e',"const fs=require('node:fs');const f=fs.createWriteStream(process.argv[1],{mode:0o600});process.stdin.pipe(f);f.on('finish',()=>fs.chmodSync(process.argv[1],process.argv[1].endsWith('/bao')?0o700:0o600));",target,data=source.read_bytes()))
 def container(mode):
  global PHASE
  PHASE='CREATE_'+mode.upper()
  cid=require(docker('create','--name',RUN+'-'+mode,'--label','cleanops.b1.openbao='+RUN,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/work:rw,exec,size=256m','--tmpfs','/tmp:rw,noexec,size=32m','--tmpfs','/var/lib/openbao:rw,noexec,size=64m','--tmpfs','/var/log/openbao:rw,noexec,size=4m',image,'sleep','600'))
  containers.append(cid);require(docker('start',cid))
  ins=json.loads(require(docker('inspect',cid)))[0]
  if ins['HostConfig']['NetworkMode']!='none' or ins['HostConfig']['PortBindings'] or any(m['Type'] in ['bind','volume'] for m in ins['Mounts']):raise RuntimeError('ISOLATION_FAILED')
  for f in ['bao','worker.mjs','server.json','ca.pem','foreign-ca.pem','server.pem','server-key.pem','client.pem','client-key.pem']:
   PHASE='TRANSFER_'+f.upper().replace('.','_').replace('-','_');transfer(cid,tmp/f,'/work/'+f)
  record(mode+'-owned-network-none-no-ports-no-shared-mounts');return cid
 def run(cid,payload):
  result=docker('exec','-i',cid,'node','/work/worker.mjs',data=json.dumps(payload),timeout=240)
  try:r=json.loads(result.stdout)
  except Exception:raise RuntimeError('REDACTED_WORKER_PROTOCOL_FAILURE')
  for check in r['checks']:REPORT['checks'].append(dict(check,phase=payload['mode']))
  if r.get('nativeMessages'):REPORT.setdefault('nativeDiagnostics',[]).append({'phase':payload['mode'],'messages':r['nativeMessages']})
  return r.get('privateResult',{})
 primary=container('primary');private=run(primary,{'mode':'primary','pack':pack,'racePath':'b1-keys/data/isolated-fixture/11111111-1111-1111-1111-111111111111/totp-aead/race-key'})
 if not private.get('backupKey'):raise RuntimeError('PRIMARY_BACKUP_BLOCKED')
 require(docker('cp',primary+':/work/backup.enc',str(tmp/'backup.enc')))
 REPORT['encryptedBackupSha256']=hashlib.sha256((tmp/'backup.enc').read_bytes()).hexdigest()
 restore=container('restore');transfer(restore,tmp/'backup.enc','/work/backup.enc')
 started=time.monotonic();run(restore,{'mode':'restore','pack':pack,'recovery':private});REPORT['syntheticRestoreSeconds']=round(time.monotonic()-started,3)
 REPORT['recoveryTargets']='Synthetic OpenBao snapshot only; not full B1/PG PITR RPO/RTO or real custody/residence acceptance'
except Exception as e:record('isolated-harness','FAIL',{'exception':type(e).__name__,'phase':PHASE,'code':str(e) if str(e).isupper() and len(str(e))<70 else 'REDACTED'})
finally:
 cleanup=True
 for cid in containers:
  try:
   inspect=json.loads(require(docker('inspect',cid)))[0]
   if inspect['Config']['Labels'].get('cleanops.b1.openbao')!=RUN:raise RuntimeError('OWNER_MISMATCH')
   require(docker('rm','-f',cid));cleanup=cleanup and docker('inspect',cid).returncode!=0
  except Exception:cleanup=False
 private.clear()
 if tmp:shutil.rmtree(tmp,ignore_errors=False)
 if before is not None:
  try:record('preexisting-containers-networks-volumes-unchanged','PASS' if inventory()==before else 'FAIL')
  except Exception:record('preexisting-resource-verification','FAIL')
 REPORT['cleanup']='PASS' if cleanup and (tmp is None or not tmp.exists()) else 'FAIL'
 REPORT['result']='PASS' if REPORT['cleanup']=='PASS' and REPORT['checks'] and all(c['status']=='PASS' for c in REPORT['checks']) else 'FAIL'
 out=ROOT/'artifacts/openbao-isolated';out.mkdir(parents=True,exist_ok=True);(out/'report.json').write_text(json.dumps(REPORT,indent=2)+'\n')
 print(json.dumps(REPORT,indent=2))
raise SystemExit(0 if REPORT['result']=='PASS' else 1)
