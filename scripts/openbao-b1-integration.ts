/** Synthetic private composition only; never imported by runtime or public routes. */
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { hash, argon2id } from 'argon2'
import { Secret, TOTP } from 'otpauth'
import { createOpenBaoKeys, type PrivateKeyReference } from '../lib/b1/openbao-keys.ts'
import { createApprovedPrivateBackend } from '../lib/b1/approved-backend.ts'
import { createAuthHandler, digest, names, token } from '../lib/b1/service.ts'
import { numeric } from '../lib/b1/config.ts'
import { sealEnrollmentSecret, openEnrollmentSecret, rewrapEnrollmentSecret } from '../lib/b1/ceremony-preparation.ts'
import { sealMailPayload, openMailPayload } from '../lib/b1/mail-envelope.ts'

type Harness = {
 input: { pg: { tenant: string; otherTenant: string; user: string; principal: string; identityRole: string } }
 request: (path: string, options?: Record<string, unknown>) => Promise<{status:number;json?:unknown}>
 api: (path:string,body?:unknown,token?:string,method?:string) => Promise<Record<string, unknown>>
 check: (name:string,fn:()=>Promise<void>)=>Promise<void>
 verifier?:string; worker?:string; root:string; k1?:Buffer;k2?:Buffer;km?:Buffer;secret?:Buffer
 state?: State
}
type State = { method:string; passwordHash:string; dummyHash:string; jar:Record<string,string>; session:string;
 envelope:string; rotatedEnvelope:string; mailEnvelope:string; mailContext:Parameters<typeof sealMailPayload>[3]; mailExpires:number; auditCount:number; secret:string }
const tls={ca:fs.readFileSync('/work/ca.pem'),cert:fs.readFileSync('/work/client.pem'),key:fs.readFileSync('/work/client-key.pem')}
const origin='https://b1-openbao.fixture.invalid'
const pool=(user:string)=>new Pool({host:'/var/run/postgresql',database:'core',user,max:2,connectionTimeoutMillis:5000,statement_timeout:8000,query_timeout:10000})
const purposes=['totp-aead','totp-aead','audit-hmac','otp-hmac','recovery-hmac','cursor-hmac'] as const
function refs(t:string):PrivateKeyReference[]{return purposes.map((purpose,i)=>({tenantId:t,purpose,keyId:i===1?'key-v2':'key-v1',version:1}))}
function reader(t:string,credential:string,allowed=refs(t)){
 return createOpenBaoKeys({origin:'https://127.0.0.1:8200',mount:'b1-keys',environment:'isolated-fixture',...tls,token:async()=>credential,timeoutMs:5000,allowed})
}
async function role(h:Harness,workload:string){
 const pack=(h.input as unknown as {pack:Record<string,{token_policies:string[]}>}).pack
 const role=pack[workload+'.approle.json'].token_policies[0]
 const id=await h.api('auth/b1-approle/role/'+role+'/role-id',undefined,h.root,'GET') as {data:{role_id:string}}
 const sid=await h.api('auth/b1-approle/role/'+role+'/secret-id',{},h.root) as {data:{secret_id:string}}
 const auth=await h.api('auth/b1-approle/login',{role_id:id.data.role_id,secret_id:sid.data.secret_id},undefined) as {auth:{client_token:string}}
 return auth.auth.client_token
}
function client(h:Harness,state:State,credential:string){
 const p=h.input.pg,identity=pool(p.identityRole),keys=refs(p.tenant),vault=reader(p.tenant,credential)
 async function compose<T>(work:(backend:ReturnType<typeof createApprovedPrivateBackend>)=>Promise<T>){
  return vault.withKeys(keys,30000,async borrow=>{
   const key=(i:number)=>borrow(keys[i],b=>b)
   const backend=createApprovedPrivateBackend(identity,{
    factors:{dummyPasswordHash:state.dummyHash,auditKey:key(2),otpKey:key(3),recoveryKey:key(4),
     async decryptTotp(bytes,version,record){
      assert.equal(record.binding.tenantId,p.tenant);assert.equal(record.binding.userId,p.user);assert.equal(record.binding.methodId,state.method)
      assert.equal(record.algorithm,'SHA256');assert.ok(['key-v1','key-v2'].includes(version))
      return borrow(keys[version==='key-v1'?0:1],k=>openEnrollmentSecret(bytes,k,version,{tenantId:p.tenant,userId:p.user,methodId:state.method,initialMethodVersion:'1',algorithm:'SHA256'}))
     }},cursorKey:key(5),transport:()=>({network:Buffer.alloc(32,1),device:Buffer.alloc(32,2)}),normalizeEmail:s=>s.trim().toLowerCase(),maxEligibleTotpMethods:4,
    sessionLabels:()=>({device:'Synthetic OpenBao integration',browser:'Isolated API'})
   });return work(backend)
  })
 }
 async function request(path:string,operation:string,body?:unknown,method?:string){
  return compose(async backend=>{
   const response=await createAuthHandler(backend,origin).handle(new Request(origin+path,{method:method??(body===undefined?'GET':'POST'),headers:{cookie:Object.entries(state.jar).map(([k,v])=>`${k}=${v}`).join('; '),origin,'sec-fetch-site':'same-origin','x-csrf-token':state.jar[names.csrf]??'','content-type':'application/json','idempotency-key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body)}),operation)
   const data=await response.json()
   for(const cookie of response.headers.getSetCookie()){const[k,v]=cookie.split(';')[0].split('=');if(v)state.jar[k]=v;else delete state.jar[k]}
   // Actual HTTP projection must not contain any private crypto material.
   const text=JSON.stringify(data);assert.ok(!/ciphertext|password_hash|secret_ciphertext|otpauth:\/\//i.test(text))
   assert.ok(!text.includes(state.secret));assert.ok(!text.includes(credential))
   return{response,data}
  })
 }
 return{compose,request,end:()=>identity.end(),vault,keys}
}
export async function beforeSnapshot(h:Harness){
 const p=h.input.pg,admin=pool('postgres'),method=randomUUID(),secret=h.secret!
 const context={tenantId:p.tenant,userId:p.user,methodId:method,initialMethodVersion:'1' as const,algorithm:'SHA256' as const}
 const envelope=sealEnrollmentSecret(secret,h.k1!,'key-v1',context)
 const rotated=rewrapEnrollmentSecret(envelope,h.k1!,'key-v1',h.k2!,'key-v2',context)
 const mailContext={tenantId:p.tenant,userId:p.user,methodId:randomUUID(),methodVersion:'1',recipientVersion:'1',outboxId:randomUUID(),challengeId:randomUUID()}
 const mailExpires=Date.now()+240000
 const mailEnvelope=sealMailPayload({recipient:'synthetic@fixture.invalid',code:'123456',issuedAt:Date.now(),expiresAt:mailExpires},h.km!,'key-mail',mailContext)
 const password='B1 OpenBao synthetic password only!'
 const state:State={method,passwordHash:await hash(password,{type:argon2id,memoryCost:65536,timeCost:3,parallelism:1}),dummyHash:await hash('Synthetic never an identity',{type:argon2id,memoryCost:65536,timeCost:3,parallelism:1}),jar:{},session:'',envelope:envelope.toString('base64'),rotatedEnvelope:rotated.toString('base64'),mailEnvelope:mailEnvelope.toString('base64'),mailContext,mailExpires,auditCount:0,secret:secret.toString('base64')}
 const c=client(h,state,h.verifier!)
 try{
  await h.check('B1-actual-envelope-v2-rotation-old-new-authentication',async()=>{
   await c.vault.withKeys(c.keys,30000,async borrow=>{
    for(const[e,i,v]of[[envelope,0,'key-v1'],[rotated,1,'key-v2']] as const){const plain=borrow(c.keys[i],k=>openEnrollmentSecret(e,k,v,context));assert.equal(Buffer.from(plain).toString('base64'),state.secret);plain.fill(0)}
    assert.throws(()=>borrow(c.keys[1],k=>openEnrollmentSecret(envelope,k,'key-v1',context)))
    assert.throws(()=>borrow(c.keys[0],k=>openEnrollmentSecret(envelope,k,'key-v1',{...context,tenantId:p.otherTenant})))
   })
  })
  await admin.query('UPDATE identity_private.credentials SET argon2id_hash=$1 WHERE principal_id=$2',[state.passwordHash,p.principal])
  await admin.query("UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id=$1 AND user_id=$2",[p.tenant,p.user])
  await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,method_version,algorithm) VALUES($1,$2,$3,'TOTP','ACTIVE',$4,'key-v1',now(),1,'SHA256')",[p.tenant,method,p.user,envelope])
  await h.check('B1-real-API-password-TOTP-PG-session-OpenBao-keys',async()=>{
   const bootstrap=token(),csrf=token();await c.compose(b=>b.bootstrap(digest(bootstrap),digest(csrf),Date.now()+numeric('preauth_ttl')*1000-1000));state.jar[names.preauth]=bootstrap;state.jar[names.csrf]=csrf
   const login=await c.request('/auth/login','login',{email:'u2@fixture.invalid',password});assert.equal(login.response.status,200);assert.equal(login.data.data.state,'PENDING_MFA')
   const proof=TOTP.generate({secret:new Secret({buffer:Uint8Array.from(secret).buffer}),algorithm:'SHA256',period:numeric('totp_period'),digits:numeric('totp_digits')})
   const verified=await c.request('/auth/mfa/verify','verifyMfa',{challenge_id:login.data.data.challenge_id,method:'TOTP',proof});assert.equal(verified.response.status,200);assert.equal(verified.data.data.state,'ACTIVE');state.session=verified.data.data.session_id
   assert.equal((await c.request('/auth/me','getCurrentIdentity')).data.data.id,p.user)
   const r=(await admin.query('SELECT state FROM app.sessions WHERE id=$1',[state.session])).rows[0];assert.equal(r.state,'ACTIVE')
  })
  await h.check('B1-key-negative-wrong-tenant-version-revoked-token',async()=>{
   let ran=0
   await assert.rejects(()=>c.vault.withKeys([{...c.keys[0],tenantId:p.otherTenant}],5000,async()=>{ran++}))
   const wrong={...c.keys[0],version:2};await assert.rejects(()=>reader(p.tenant,h.verifier!,[wrong]).withKeys([wrong],5000,async()=>{ran++}))
   await assert.rejects(()=>reader(p.tenant,'invalid-revoked-fixture').withKeys(c.keys,5000,async()=>{ran++}));assert.equal(ran,0)
  })
  await h.check('B1-unavailable-OpenBao-no-HTTP-operation-no-session-effect',async()=>{
   const before=(await admin.query('SELECT count(*)::int AS n FROM app.sessions')).rows[0].n
   await h.api('sys/seal',{},h.root)
   let ran=false;try{await assert.rejects(()=>c.compose(async()=>{ran=true}))}finally{
    const rootInput=h.input as unknown as {recoveryKeys:string[]}
    for(const key of rootInput.recoveryKeys)await h.api('sys/unseal',{key},undefined,'PUT')
    for(let i=0;i<100;i++){if((await h.request('sys/health')).status===200)break;await new Promise(r=>setTimeout(r,100))}
   }
   assert.equal(ran,false);assert.equal((await admin.query('SELECT count(*)::int AS n FROM app.sessions')).rows[0].n,before)
  })
  state.auditCount=Number((await admin.query('SELECT count(*) FROM identity_private.security_log')).rows[0].count)
  assert.ok(state.auditCount>0)
  return state
 }finally{await c.end();await admin.end();envelope.fill(0);rotated.fill(0);mailEnvelope.fill(0)}
}
export async function afterRestore(h:Harness){
 const p=h.input.pg,state=h.state!,admin=pool('postgres'),credential=await role(h,'identity-verifier'),mailCredential=await role(h,'mail-worker'),c=client(h,state,credential)
 try{
  await h.check('B1-restored-PG-MFA-ciphertext-old-new-OpenBao-versions',async()=>{
   const row=(await admin.query('SELECT secret_ciphertext,key_version,last_totp_counter FROM app.mfa_methods WHERE tenant_id=$1 AND id=$2',[p.tenant,state.method])).rows[0]
   assert.equal(row.secret_ciphertext.toString('base64'),state.envelope);assert.equal(row.key_version,'key-v1');assert.notEqual(row.last_totp_counter,null)
   const context={tenantId:p.tenant,userId:p.user,methodId:state.method,initialMethodVersion:'1' as const,algorithm:'SHA256' as const}
   await c.vault.withKeys(c.keys,30000,async borrow=>{
    for(const[e,i,v]of[[state.envelope,0,'key-v1'],[state.rotatedEnvelope,1,'key-v2']]as const){const plain=borrow(c.keys[i],k=>openEnrollmentSecret(Buffer.from(e,'base64'),k,v,context));assert.equal(Buffer.from(plain).toString('base64'),state.secret);plain.fill(0)}
   })
  })
  await h.check('B1-restored-mail-envelope-exact-AAD-purpose-permissions',async()=>{
   const ref:PrivateKeyReference={tenantId:p.tenant,purpose:'mail-aead',keyId:'key-mail',version:1}
   const mail=reader(p.tenant,mailCredential,[ref])
   await mail.withKeys([ref],30000,async borrow=>{const payload=borrow(ref,k=>openMailPayload(Buffer.from(state.mailEnvelope,'base64'),k,'key-mail',state.mailContext,Date.now()));assert.equal(payload.recipient,'synthetic@fixture.invalid');assert.equal(payload.code,'123456')})
   await assert.rejects(()=>reader(p.tenant,credential,[ref]).withKeys([ref],30000,async()=>{}))
  })
  await h.check('B1-restored-real-API-session-audit-multitenant-integrity',async()=>{
   const me=await c.request('/auth/me','getCurrentIdentity');assert.equal(me.response.status,200);assert.equal(me.data.data.id,p.user);assert.equal(me.data.data.tenant_id,p.tenant)
   const sessions=await c.request('/me/sessions','listSelfSessions');assert.equal(sessions.response.status,200);assert.ok(sessions.data.data.items.some((i:{id:string})=>i.id===state.session))
   assert.ok(sessions.data.data.items.every((i:{user_id?:string;tenant_id?:string})=>(!i.user_id||i.user_id===p.user)&&(!i.tenant_id||i.tenant_id===p.tenant)))
   assert.ok(Number((await admin.query('SELECT count(*) FROM identity_private.security_log')).rows[0].count)>=state.auditCount)
   const foreign=(await admin.query("SELECT count(*)::int AS n FROM app.sessions WHERE tenant_id=$1 AND state='ACTIVE'",[p.otherTenant])).rows[0].n;assert.ok(foreign>0)
   const logout=await c.request('/auth/logout','logout',undefined,'POST');assert.equal(logout.response.status,200);assert.equal((await c.request('/auth/me','getCurrentIdentity')).response.status,401)
   assert.equal((await admin.query('SELECT state FROM app.sessions WHERE id=$1',[state.session])).rows[0].state,'REVOKED')
  })
 }finally{await c.end();await admin.end()}
}
