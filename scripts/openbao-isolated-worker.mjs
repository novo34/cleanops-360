/** Synthetic, owned network-none container only; never imported by B1 runtime. */
import fs from 'node:fs'
import https from 'node:https'
import {spawn} from 'node:child_process'
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto'
const input=JSON.parse(fs.readFileSync(0,'utf8')),checks=[]
let child,root
const wait=ms=>new Promise(r=>setTimeout(r,ms))
function assert(v){if(!v)throw Error('ASSERTION_FAILED')}
async function check(name,fn){try{await fn();checks.push({name,status:'PASS'})}catch(e){checks.push({name,status:'FAIL',detail:{code:/^[A-Z0-9_]{1,45}$/.test(e.message)?e.message:'REDACTED'}})}}
const tls={ca:fs.readFileSync('/work/ca.pem'),cert:fs.readFileSync('/work/client.pem'),key:fs.readFileSync('/work/client-key.pem'),servername:'localhost',rejectUnauthorized:true}
async function request(path,{method='GET',token=root,body,raw,client=true,ca=tls.ca,headers={}}={}){
 const bytes=raw??(body===undefined?undefined:Buffer.from(JSON.stringify(body)))
 return new Promise((resolve,reject)=>{const r=https.request({hostname:'127.0.0.1',port:8200,path:'/v1/'+path,method,ca,servername:'localhost',rejectUnauthorized:true,...(client?{cert:tls.cert,key:tls.key}:{}),headers:{...(token?{'X-Vault-Token':token}:{}),...(bytes?{'Content-Type':raw?'application/octet-stream':'application/json','Content-Length':bytes.length}:{}),...headers}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{const raw=Buffer.concat(chunks);let json;try{json=JSON.parse(raw)}catch{ /* Expected failure is handled through safe status; never log raw material. */ }resolve({status:res.statusCode,raw,json})})});r.setTimeout(30000,()=>r.destroy(Error('REQUEST_TIMEOUT')));r.on('error',reject);r.end(bytes)})
}
async function api(path,body,token=root,method='POST',headers={}){const r=await request(path,{method,token,body,headers});if(r.status>=400)throw Error('HTTP_'+r.status);return r.json}
async function ready(){for(let n=0;n<100;n++){try{const r=await request('sys/health',{token:null});if([200,429,501,503].includes(r.status))return}catch{ /* Expected failure is handled through safe status; never log raw material. */ }await wait(100)}throw Error('SERVER_NOT_READY')}
async function start(){const f=fs.openSync('/work/server.private.log','a',0o600);child=spawn('/work/bao',['server','-config=/work/server.json'],{stdio:['ignore',f,f]});await ready()}
async function init(){const r=await api('sys/init',{secret_shares:2,secret_threshold:2},null,'PUT');root=r.root_token;return r.keys_base64}
async function unseal(keys){for(const key of keys)await api('sys/unseal',{key},null,'PUT');for(let n=0;n<100;n++){if((await request('sys/health')).status===200)return;await wait(100)}throw Error('UNSEALED_NOT_ACTIVE')}
async function policy(name,data){await api('sys/policies/acl/'+name,{policy:JSON.stringify(data)},root,'PUT')}
async function token(policies,ttl='300s'){return(await api('auth/token/create',{policies,no_default_policy:true,ttl,explicit_max_ttl:ttl})).auth.client_token}
function seal(bytes,key,aad){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(aad));return{iv:iv.toString('base64'),tag:null,data:Buffer.concat([c.update(bytes),c.final()]).toString('base64'),...(function(){return{tag:c.getAuthTag().toString('base64')}})()}}
function open(e,key,aad){const c=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));c.setAAD(Buffer.from(aad));c.setAuthTag(Buffer.from(e.tag,'base64'));return Buffer.concat([c.update(Buffer.from(e.data,'base64')),c.final()])}
let privateResult={}
const integration=input.integrationModule?await import(input.integrationModule):null
let integrationState
try{
 await check('native-server-config-TLS-Raft-audit-startup',start)
 if(!child||checks.at(-1).status!=='PASS')throw Error('STARTUP_BLOCKED')
 await check('TLS-reject-missing-client-certificate',async()=>{let denied=false;try{await request('sys/health',{client:false,token:null})}catch{denied=true}assert(denied)})
 await check('TLS-reject-foreign-server-CA',async()=>{let denied=false;try{await request('sys/health',{ca:fs.readFileSync('/work/foreign-ca.pem'),token:null})}catch{denied=true}assert(denied)})
 let keys
 await check('synthetic-Shamir-two-of-two-initialize',async()=>{keys=await init();assert(keys.length===2)})
 if(!keys)throw Error('INITIALIZATION_BLOCKED')
 await check('one-share-cannot-unseal',async()=>{assert((await api('sys/unseal',{key:keys[0]},null,'PUT')).sealed===true)})
 await check('two-shares-unseal',async()=>{await unseal(keys);assert((await request('sys/health')).status===200)})
 if(input.mode==='primary'){
  const A=input.pg?.tenant??'11111111-1111-1111-1111-111111111111',B=input.pg?.otherTenant??'22222222-2222-2222-2222-222222222222'
  const prefix='b1-keys/data/isolated-fixture/',old=prefix+A+'/totp-aead/key-v1',next=prefix+A+'/totp-aead/key-v2',mail=prefix+A+'/mail-aead/key-mail',foreign=prefix+B+'/totp-aead/key-v1'
  const k1=randomBytes(32),k2=randomBytes(32),km=randomBytes(32),secret=randomBytes(32)
  const put=(path,key,cas=0,t=root)=>api(path,{options:{cas},data:{value:key.toString('base64')}},t)
  await check('KVv2-enable-CAS-required',async()=>{await api('sys/mounts/b1-keys',input.pack['kv-mount.json']);await api('b1-keys/config',input.pack['kv-config.json']);assert((await request('b1-keys/config')).json.data.cas_required===true)})
  await put(old,k1);await put(mail,km);await put(foreign,randomBytes(32))
  if(integration)for(const purpose of ['audit-hmac','otp-hmac','recovery-hmac','cursor-hmac'])await put(prefix+A+'/'+purpose+'/key-v1',randomBytes(32))
  await api('sys/auth/b1-approle',{type:'approle'})
  async function workload(w){const name=input.pack[w+'.approle.json'].token_policies[0];await policy(name,input.pack[w+'.policy.json']);await api('auth/b1-approle/role/'+name,input.pack[w+'.approle.json']);const id=(await request('auth/b1-approle/role/'+name+'/role-id')).json.data.role_id;const wrapped=await api('auth/b1-approle/role/'+name+'/secret-id',{},root,'POST',{'X-Vault-Wrap-TTL':'60s'});const wrap=wrapped.wrap_info.token;const unwrapped=await api('sys/wrapping/unwrap',{},wrap);return{id,sid:unwrapped.data.secret_id,wrap}}
  let verifier,worker,credential
  await check('AppRole-wrapped-single-use-no-default-policy',async()=>{credential=await workload('identity-verifier');const r=await api('auth/b1-approle/login',{role_id:credential.id,secret_id:credential.sid},null);verifier=r.auth.client_token;assert(!r.auth.policies.includes('default'));const replay=await request('sys/wrapping/unwrap',{method:'POST',token:credential.wrap,body:{}});assert([400,403].includes(replay.status)&&!replay.json?.data);assert((await request('auth/b1-approle/login',{method:'POST',token:null,body:{role_id:credential.id,secret_id:credential.sid}})).status>=400)})
  await check('mail-worker-distinct-AppRole',async()=>{const c=await workload('mail-worker');worker=(await api('auth/b1-approle/login',{role_id:c.id,secret_id:c.sid},null)).auth.client_token})
  if(!verifier||!worker)throw Error('WORKLOAD_AUTH_BLOCKED')
  await check('tenant-A-allowed-tenant-B-denied',async()=>{assert((await request(old,{token:verifier})).status===200);assert((await request(foreign,{token:verifier})).status===403)})
  await check('mail-worker-purpose-isolation',async()=>{assert((await request(mail,{token:worker})).status===200);assert((await request(old,{token:worker})).status===403);assert((await request(mail,{token:verifier})).status===403)})
  for(const path of ['b1-keys/metadata/isolated-fixture/'+A+'/totp-aead/key-v1','sys/raw/anything','sys/policies/acl/root','b1-keys/metadata/isolated-fixture/'])await check('service-denied-'+(path.includes('metadata')?'metadata-'+createHash('sha256').update(path).digest('hex').slice(0,6):path),async()=>assert((await request(path,{token:verifier,method:path.endsWith('/')?'LIST':'GET'})).status===403))
  await check('service-cannot-mutate-key-or-policies',async()=>{assert((await request(old,{method:'POST',token:verifier,body:{options:{cas:1},data:{value:'forbidden'}}})).status===403);assert((await request('sys/policies/acl/escalate',{method:'PUT',token:verifier,body:{policy:'path "*" {capabilities=["sudo"]}'}})).status===403)})
  await policy('fixture-key-creator',input.pack['key-creator.policy.json']);const creator=await token(['fixture-key-creator'])
  await check('creator-missing-CAS-denied',async()=>assert((await request(next,{method:'POST',token:creator,body:{data:{value:k2.toString('base64')}}})).status>=400))
  await check('creator-only-new-ID-CAS-zero',async()=>{await put(next,k2,0,creator);assert((await request(next,{method:'POST',token:creator,body:{options:{cas:1},data:{value:'overwrite'}}})).status===403);assert((await request(next,{token:creator})).status===403);assert((await request(next,{method:'DELETE',token:creator})).status===403)})
  await check('concurrent-CAS-create-exactly-one-winner',async()=>{const race=input.racePath;const t=creator;const send=()=>request(race,{method:'POST',token:t,body:{options:{cas:0},data:{value:randomBytes(32).toString('base64')}}});const rr=await Promise.all([send(),send()]);assert(rr.filter(r=>r.status<300).length===1);assert(rr.filter(r=>r.status>=400).length===1)})
  let e1,e2
  const aad='v2|'+A+'|synthetic-user|synthetic-method|1|SHA256|'
  await check('old-new-exact-key-rotation-AEAD-and-tamper-denial',async()=>{const read=async p=>Buffer.from((await request(p,{token:verifier})).json.data.data.value,'base64');const before=await read(old),after=await read(next);e1=seal(secret,before,aad+'key-v1');e2=seal(open(e1,before,aad+'key-v1'),after,aad+'key-v2');assert(open(e2,after,aad+'key-v2').equals(secret));let rejected=0;for(const [e,k,a]of[[e1,after,aad+'key-v1'],[e1,before,aad.replace(A,B)+'key-v1'],[{...e2,tag:randomBytes(16).toString('base64')},after,aad+'key-v2']])try{open(e,k,a)}catch{rejected++}assert(rejected===3)})
  await check('short-lived-token-expires',async()=>{const t=await token([input.pack['identity-verifier.approle.json'].token_policies[0]],'1s');assert((await request(old,{token:t})).status===200);await wait(1300);assert((await request(old,{token:t})).status===403)})
  await policy('fixture-snapshot-reader',input.pack['snapshot-reader.policy.json']);const backupToken=await token(['fixture-snapshot-reader'])
  let snapshot
  if(integration)integrationState=await integration.beforeSnapshot({input:{...input,recoveryKeys:keys},request,api,check,verifier,worker,root,k1,k2,km,secret})
  await check('least-privilege-snapshot-read-no-restore',async()=>{const r=await request('sys/storage/raft/snapshot',{token:backupToken});assert(r.status===200&&r.raw.length>100);snapshot=r.raw;assert((await request('sys/storage/raft/snapshot-force',{method:'POST',raw:Buffer.from('invalid'),token:backupToken})).status===403)})
  const backupKey=randomBytes(32),backup=seal(snapshot,backupKey,'B1_SYNTHETIC_BACKUP_V1');fs.writeFileSync('/work/backup.enc',JSON.stringify(backup),{mode:0o600})
  await check('encrypted-backup-tamper-rejected',async()=>{let rejected=false;try{open({...backup,tag:randomBytes(16).toString('base64')},backupKey,'B1_SYNTHETIC_BACKUP_V1')}catch{rejected=true}assert(rejected);assert(open(backup,backupKey,'B1_SYNTHETIC_BACKUP_V1').equals(snapshot))})
  await check('token-revocation-effective-immediately',async()=>{await api('auth/token/revoke',{token:worker});assert((await request(mail,{token:worker})).status===403)})
  await check('audit-has-events-without-plaintext-material',async()=>{const audit=fs.readFileSync('/var/log/openbao/audit.json','utf8');assert(audit.includes('b1-keys/data/'));for(const s of[k1.toString('base64'),k2.toString('base64'),secret.toString('base64'),verifier,worker,credential.sid,root,...keys])assert(!audit.includes(s));assert(audit.split('\n').filter(Boolean).every(l=>JSON.parse(l).type))})
  await check('audit-disk-full-fails-closed-then-recovers',async()=>{
   let observed,filled=false
   try{
    const fd=fs.openSync('/var/log/openbao/fill','w')
    try{for(let i=0;i<40;i++)fs.writeSync(fd,Buffer.alloc(1024*1024,65))}catch(e){assert(e.code==='ENOSPC');filled=true}finally{fs.closeSync(fd)}
    assert(filled)
    try{observed=(await request(old,{token:verifier})).status}catch{observed=503}
    // Keep the actual denial status; never turn a successful read into PASS.
    checks.push({name:'audit-full-observed-HTTP-status',status:observed>=500?'PASS':'FAIL',detail:{status:observed}})
    assert(observed>=500)
   }finally{try{fs.unlinkSync('/var/log/openbao/fill')}catch{ /* Expected failure is handled through safe status; never log raw material. */ }}
   for(let n=0;n<100;n++){if((await request(old,{token:verifier})).status===200)return;await wait(100)}
   throw Error('AUDIT_DID_NOT_RECOVER')
  })
  privateResult={root,keys,backupKey:backupKey.toString('base64'),old,next,mail,verifier,backupToken,worker,key1:k1.toString('base64'),key2:k2.toString('base64'),secret:secret.toString('base64'),e1,e2,aad,integrationState}
 }else{
  const p=input.recovery
  const enc=JSON.parse(fs.readFileSync('/work/backup.enc','utf8')),snapshot=open(enc,Buffer.from(p.backupKey,'base64'),'B1_SYNTHETIC_BACKUP_V1')
  await policy('fixture-restore',input.pack['restore-operator.policy.json']);const normal=await token(['fixture-restore'])
  await check('new-target-normal-restore-rejects-different-seal',async()=>assert((await request('sys/storage/raft/snapshot',{method:'POST',token:normal,raw:snapshot})).status>=400))
  await policy('fixture-breakglass',input.pack['restore-breakglass.policy.json']);const recover=await token(['fixture-breakglass'])
  await check('normal-restore-identity-cannot-force',async()=>assert((await request('sys/storage/raft/snapshot-force',{method:'POST',token:normal,raw:snapshot})).status===403))
  await check('separately-scoped-fresh-target-force-restore',async()=>{const r=await request('sys/storage/raft/snapshot-force',{method:'POST',token:recover,raw:snapshot});assert(r.status<300);await wait(1000);await ready()})
  root=p.root
  await check('restored-original-custody-quorum-required',async()=>{assert((await request('sys/seal-status',{token:null})).json.sealed===true);assert((await api('sys/unseal',{key:p.keys[0]},null,'PUT')).sealed===true);await unseal(p.keys);assert((await request('sys/health')).status===200)})
  await check('restored-old-new-key-values-and-AEAD-integrity',async()=>{for(const[path,value]of[[p.old,p.key1],[p.next,p.key2]])assert((await request(path)).json.data.data.value===value);for(const[e,k,id]of[[p.e1,p.key1,'key-v1'],[p.e2,p.key2,'key-v2']])assert(open(e,Buffer.from(k,'base64'),p.aad+id).toString('base64')===p.secret)})
  await check('restore-quarantine-revokes-snapshot-era-identities-before-use',async()=>{for(const t of[p.verifier,p.worker,p.backupToken])await api('auth/token/revoke',{token:t});assert((await request(p.old,{token:p.verifier})).status===403);assert((await request(p.mail,{token:p.worker})).status===403)})
  await check('restored-ordinary-AppRole-keeps-tenant-and-purpose-isolation',async()=>{
   const role=input.pack['identity-verifier.approle.json'].token_policies[0]
   const id=(await request('auth/b1-approle/role/'+role+'/role-id')).json.data.role_id
   const sid=(await api('auth/b1-approle/role/'+role+'/secret-id',{})).data.secret_id
   const t=(await api('auth/b1-approle/login',{role_id:id,secret_id:sid},null)).auth.client_token
   assert((await request(p.old,{token:t})).json.data.data.value===p.key1)
   assert((await request(p.next,{token:t})).json.data.data.value===p.key2)
   assert((await request(p.mail,{token:t})).status===403)
   assert((await request(p.old.replace(input.pg?.tenant??'11111111-1111-1111-1111-111111111111',input.pg?.otherTenant??'22222222-2222-2222-2222-222222222222'),{token:t})).status===403)
  })
  if(integration)await integration.afterRestore({input,request,api,check,root,state:p.integrationState})
  await check('restored-KV-CAS-configuration',async()=>{assert((await request('b1-keys/config')).json.data.cas_required===true)})
 }
 await check('synthetic-initial-root-revoked-after-drill',async()=>{await api('auth/token/revoke-self',{});assert((await request('sys/mounts')).status===403)})
}catch(e){checks.push({name:'dependent-runtime-tests',status:'FAIL',detail:{code:/^[A-Z0-9_]{1,45}$/.test(e.message)?e.message:'REDACTED'}})}finally{child?.kill('SIGTERM');if(child)await new Promise(r=>{child.once('exit',r);setTimeout(r,3000)})}
const nativeMessages=[]
if(checks.some(c=>c.status==='FAIL'))try{for(const line of fs.readFileSync('/work/server.private.log','utf8').split('\n')){let obj;try{obj=JSON.parse(line)}catch{continue}if(['error','warn'].includes(obj['@level'])){const message=String(obj['@message']??'').replace(/[A-Za-z0-9+/_=-]{16,}/g,'REDACTED').slice(0,160);if(message&&!nativeMessages.includes(message))nativeMessages.push(message)}}}catch{ /* Expected failure is handled through safe status; never log raw material. */ }
process.stdout.write(JSON.stringify({checks,nativeMessages:nativeMessages.slice(-8),privateResult}));process.exitCode=checks.every(c=>c.status==='PASS')?0:1
