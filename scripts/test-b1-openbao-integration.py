#!/usr/bin/env python3
"""Exact SQL14 + real OpenBao/B1, synthetic independent-backup recovery only."""
import base64,hashlib,importlib.util,json,os,secrets,shutil,sys,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
pg=module('bao_pg14','pg-consolidated-14.py');b=pg.b;runner=pg.runner
bao=module('bao_drill','test-b1-openbao-isolated.py')
original_payload=runner.payload
original_docker=runner.docker
RESTORE=None
TEMP=None
PRIVATE={}
def docker(*args,**kwargs):
 if args and args[0]=='run':
  args=(*args[:1],'--tmpfs','/work:rw,exec,size=256m','--tmpfs','/var/lib/openbao:rw,noexec,size=64m','--tmpfs','/var/log/openbao:rw,noexec,size=4m',*args[1:])
 return original_docker(*args,**kwargs)
runner.docker=docker

def require(r):
 if r.returncode:raise RuntimeError('INTEGRATION_PRIVATE_PROCESS_FAILED')
 return r.stdout.strip()
def payload():
 data=original_payload();b.REPORT.update(scope='B1_OPENBAO_PG14_INTEGRATED_SYNTHETIC',accepted=42,PR006='OPEN',PR007='OPEN',productiveCustodyAccepted=False,realSwissResidenceVerified=False,principalCustodian='PROJECT_OWNER_CONFIRMED',additionalCustodians='PENDING',productiveQuorum='NOT_APPROVED')
 return data

def config():
 prep=module('bao_prep','prepare-b1-openbao.py')
 reads=[{'tenant':b.A,'purpose':p,'key_id':k,'workload':w} for w,p,k in [('identity-verifier','totp-aead','key-v1'),('identity-verifier','totp-aead','key-v2'),('identity-verifier','totp-aead','retired-key'),('mail-worker','mail-aead','key-mail')]+[('identity-verifier',p,'key-v1') for p in ['audit-hmac','otp-hmac','recovery-hmac','cursor-hmac']]]
 pack=prep.prepare(dict(environment='isolated-fixture',private_ipv4='10.42.1.2',api_dns='bao.fixture.invalid',node_id='synthetic-node',token_ttl_seconds=120,token_max_ttl_seconds=300,secret_id_ttl_seconds=60,workload_cidrs=['10.42.2.0/24'],approved_key_reads=reads,approved_key_creates=[{'tenant':b.A,'purpose':'totp-aead','key_id':k} for k in ['key-v2','race-key']]))
 server=json.loads(json.dumps(pack['server.json']).replace('10.42.1.2','127.0.0.1').replace('bao.fixture.invalid','localhost').replace('/run/openbao-tls/server-chain.pem','/work/server.pem').replace('/run/openbao-tls/server-key.pem','/work/server-key.pem').replace('/run/openbao-tls/workload-ca.pem','/work/ca.pem'))
 for name,value in pack.items():
  if name.endswith('.approle.json'):value['secret_id_bound_cidrs']=['127.0.0.1/32'];value['token_bound_cidrs']=['127.0.0.1/32']
 return pack,server

def copy(cid,source,target):
 # Docker archive-copy can target the underlying layer rather than a live tmpfs.
 # Stream via the container process, exactly as the validated standalone drill.
 require(b.docker('exec','-i',cid,'/opt/b1-pg05/node','-e',"const fs=require('node:fs'),b=[];process.stdin.on('data',x=>b.push(x));process.stdin.on('end',()=>{fs.writeFileSync(process.argv[1],Buffer.from(Buffer.concat(b).toString('utf8'),'base64'),{mode:process.argv[1].endsWith('/bao')?0o700:0o600});});",target,data=base64.b64encode(source.read_bytes()).decode('ascii')))
def runtime(cid):
 previous=b.CID;b.CID=cid
 try:module('bao_runtime','pg-http-integration.py').copy_runtime(b,('scripts/openbao-isolated-worker.mjs','scripts/openbao-b1-integration.ts'))
 finally:b.CID=previous
 require(b.docker('exec',cid,'mkdir','-p','/var/log/openbao','/var/lib/openbao'))
 for f in ['bao','server.json','ca.pem','foreign-ca.pem','server.pem','server-key.pem','client.pem','client-key.pem']:copy(cid,TEMP/f,'/work/'+f)

def worker(cid,mode,pack,recovery=None):
 body={'mode':mode,'pack':pack,'pg':{'tenant':b.A,'otherTenant':b.B,'user':b.V,'principal':b.Q,'identityRole':b.ROLE['identity']},'integrationModule':'./openbao-b1-integration.ts','racePath':'b1-keys/data/isolated-fixture/'+b.A+'/totp-aead/race-key'}
 if recovery is not None:body['recovery']=recovery
 r=b.docker('exec','-i',cid,'/opt/b1-pg05/node','--experimental-strip-types','/opt/b1-pg05/scripts/openbao-isolated-worker.mjs',data=json.dumps(body),timeout=300)
 try:report=json.loads(r.stdout)
 except Exception:
  import re
  code=re.search(r'\b(?:ERR_[A-Z_]+|ENOENT|EACCES|SyntaxError|TypeError|ReferenceError)\b',r.stderr)
  missing=re.search(r"Cannot find (?:package|module) ['\"]([a-zA-Z0-9@_./-]+)['\"]",r.stderr)
  b.REPORT['workerTransportDiagnostic']={'exitCode':r.returncode,'code':code.group(0) if code else 'REDACTED','missingModule':missing.group(1).split('/opt/b1-pg05/')[-1] if missing else None,'stdoutBytes':len(r.stdout)}
  raise RuntimeError('INTEGRATION_WORKER_REDACTED_PROTOCOL_FAILURE')
 for check in report['checks']:b.record(mode+'-'+check['name'],check['status'],check.get('detail'))
 if r.returncode:raise RuntimeError('INTEGRATION_WORKER_CHECK_FAILED')
 return report['privateResult']

def fingerprint(cid):
 query="SELECT format('SELECT %L,md5(coalesce(string_agg(to_jsonb(t)::text,E''\\\\n'' ORDER BY to_jsonb(t)::text),'''')) FROM %I.%I t;',n.nspname||'.'||c.relname,n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r' ORDER BY n.nspname,c.relname"
 commands=require(b.docker('exec',cid,'psql','-X','-qAt','-U','postgres','-d','core','-c',query))
 return require(b.docker('exec','-i',cid,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','core',data=commands))

def checks():
 global RESTORE,TEMP,PRIVATE
 if not runner.module('bao_security_gate','pg11-access-security-tests.py').gate(b,32):b.record('B1-OpenBao-dependent','BLOCKED');return
 try:
  TEMP=Path(tempfile.mkdtemp(prefix='b1-openbao-integration-'));os.chmod(TEMP,0o700)
  pin=json.loads((bao.BASE/'release-pin.json').read_text());asset=next(a for a in pin['assets'] if a['name']=='openbao_2.7.1_linux_amd64.tar.gz')
  with urllib.request.urlopen(asset['url'],timeout=90) as r,(TEMP/'bao.tar.gz').open('wb') as f:shutil.copyfileobj(r,f)
  raw=(TEMP/'bao.tar.gz').read_bytes();digest=hashlib.sha256(raw).hexdigest()
  if 'sha256:'+digest!=asset['githubApiDigest']:raise RuntimeError('PINNED_OPENBAO_DIGEST_MISMATCH')
  import tarfile
  with tarfile.open(TEMP/'bao.tar.gz') as archive:
   member=next(m for m in archive.getmembers() if m.name in {'bao','./bao'} and m.isfile())
   with archive.extractfile(member) as src,(TEMP/'bao').open('wb') as dst:shutil.copyfileobj(src,dst)
  os.chmod(TEMP/'bao',0o700);b.REPORT['openbaoAssetSha256']=digest
  bao.certificates(TEMP);pack,server=config();(TEMP/'server.json').write_text(json.dumps(server))
  runtime(b.CID)
  PRIVATE=worker(b.CID,'primary',pack)
  if not PRIVATE.get('integrationState',{}).get('session'):raise RuntimeError('REAL_B1_SESSION_PREREQUISITE_FAILED')
  before=fingerprint(b.CID)
  require(b.docker('exec',b.CID,'pg_dump','-U','postgres','-d','core','-Fc','-f','/tmp/b1-independent.dump'))
  # Encrypt database + separate roles backup inside the isolated source. Never publish either.
  encrypt="const fs=require('node:fs'),c=require('node:crypto'),cp=require('node:child_process');const key=c.randomBytes(32),iv=c.randomBytes(12);const roles=cp.execFileSync('pg_dumpall',['-U','postgres','--roles-only','--no-role-passwords'],'utf8');const raw=Buffer.from(JSON.stringify({db:fs.readFileSync('/tmp/b1-independent.dump').toString('base64'),roles:String(roles)}));const cipher=c.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('B1_PG_BACKUP_1'));const data=Buffer.concat([cipher.update(raw),cipher.final()]);fs.writeFileSync('/work/pg-backup.enc',JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}),{mode:0o600});raw.fill(0);process.stdout.write(key.toString('base64'));key.fill(0);"
  # execFileSync options must be an object on supported Node releases.
  encrypt=encrypt.replace("'--no-role-passwords'],'utf8'","'--no-role-passwords'],{encoding:'utf8'}")
  pg_key=require(b.docker('exec',b.CID,'/opt/b1-pg05/node','-e',encrypt))
  for file in ['backup.enc','pg-backup.enc']:(TEMP/file).write_text(require(b.docker('exec',b.CID,'/opt/b1-pg05/node','-e',"process.stdout.write(require('node:fs').readFileSync(process.argv[1]))",'/work/'+file)))
  b.REPORT['independentEncryptedBackups']={f:hashlib.sha256((TEMP/f).read_bytes()).hexdigest() for f in ['backup.enc','pg-backup.enc']}
  if pg_key==PRIVATE['backupKey']:raise RuntimeError('INDEPENDENT_BACKUP_KEY_COLLISION')
  image=b.REPORT['image']
  RESTORE=require(b.docker('run','-d','--pull=never','--name','cleanops-pgbao-restore-'+b.RUN,'--label','cleanops.pgtest01='+b.RUN,'--network=none','--security-opt=no-new-privileges','--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=1g','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--shm-size=128m','-e','POSTGRES_DB=core','-e','POSTGRES_PASSWORD='+secrets.token_urlsafe(32),image))
  meta=json.loads(require(b.docker('inspect',RESTORE)))[0]
  if meta['HostConfig']['NetworkMode']!='none' or meta['HostConfig']['PortBindings'] or any(m['Type'] in ['bind','volume'] for m in meta['Mounts']):raise RuntimeError('RESTORE_ISOLATION_FAILED')
  for _ in range(100):
   if b.docker('exec',RESTORE,'pg_isready','-U','postgres','-d','core').returncode==0:break
   time.sleep(.2)
  else:raise RuntimeError('RESTORE_PG16_NOT_READY')
  runtime(RESTORE)
  for file in ['backup.enc','pg-backup.enc']:copy(RESTORE,TEMP/file,'/work/'+file)
  decrypt="const fs=require('node:fs'),c=require('node:crypto'),cp=require('node:child_process');const key=Buffer.from(fs.readFileSync(0,'utf8'),'base64'),e=JSON.parse(fs.readFileSync('/work/pg-backup.enc'));const d=c.createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));d.setAAD(Buffer.from('B1_PG_BACKUP_1'));d.setAuthTag(Buffer.from(e.tag,'base64'));const bytes=Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]);const payload=JSON.parse(bytes);const roles=payload.roles.replace(/^CREATE ROLE postgres;$/m,'');cp.execFileSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','core'],{input:roles,stdio:['pipe','pipe','pipe']});fs.writeFileSync('/tmp/restored.dump',Buffer.from(payload.db,'base64'),{mode:0o600});bytes.fill(0);key.fill(0);"
  require(b.docker('exec','-i',RESTORE,'/opt/b1-pg05/node','-e',decrypt,data=pg_key))
  require(b.docker('exec',RESTORE,'pg_restore','-U','postgres','--exit-on-error','-d','core','/tmp/restored.dump'))
  b.record('frozen-source-security-checkpoint-unchanged','PASS' if fingerprint(b.CID)==before else 'FAIL')
  b.record('fresh-PG16-all-32-table-values-identical-after-independent-backup','PASS' if fingerprint(RESTORE)==before else 'FAIL')
  started=time.monotonic();worker(RESTORE,'restore',pack,PRIVATE);b.REPORT['combinedRestoreCheckSeconds']=round(time.monotonic()-started,3)
  b.REPORT['technicalScope']='Real private B1 HTTP/API + PostgreSQL16 + native OpenBao; no new Chromium run or productive acceptance'
 except Exception as e:
  b.record('B1-OpenBao-integrated-harness','FAIL',str(e) if isinstance(e,RuntimeError) else type(e).__name__)
 finally:
  PRIVATE.clear()
  if RESTORE:
   label=b.docker('inspect','--format','{{index .Config.Labels "cleanops.pgtest01"}}',RESTORE)
   ok=label.returncode==0 and label.stdout.strip()==b.RUN and b.docker('rm','-f',RESTORE).returncode==0
   b.record('fresh-restore-container-owned-cleanup','PASS' if ok else 'FAIL')
  if TEMP:shutil.rmtree(TEMP);b.record('synthetic-TLS-and-encrypted-transfer-material-removed','PASS' if not TEMP.exists() else 'FAIL')
runner.payload=payload;runner.checks=checks
if __name__=='__main__':sys.exit(runner.main())
