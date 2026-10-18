/** Synthetic isolated PG06 only; never imported by routes/runtime. */
import { Pool, type PoolClient } from 'pg'
import { hash, argon2id } from 'argon2'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { verifyPasswordFactor } from '../lib/b1/password.ts'
import { createPgIdentityUnitOfWork, type IdentityPool } from '../lib/b1/pg-identity-driver.ts'
import { createMailDispatchStore } from '../lib/b1/mail-dispatch-store.ts'
import { dispatchOneMail, type MailOutcome } from '../lib/b1/mail-worker.ts'
import { sealMailPayload } from '../lib/b1/mail-envelope.ts'
import { prepareEmailOtp, emailOtpDigest } from '../lib/b1/ceremony-preparation.ts'
import { numeric } from '../lib/b1/config.ts'
let serialized='';for await(const chunk of process.stdin)serialized+=chunk
const input=JSON.parse(serialized)
const pool=(user:string)=>new Pool({host:'/var/run/postgresql',database:'core',user,max:3,connectionTimeoutMillis:5000,statement_timeout:8000,query_timeout:10000})
const admin=pool('postgres'),identity=pool(input.identityRole),mail=pool(input.mailRole),verifier=pool(input.verifierRole),maintenance=pool('pgtest_maintenance')
const unit=createPgIdentityUnitOfWork(identity as unknown as IdentityPool)
const key=randomBytes(32),hmac=randomBytes(32),password=randomBytes(32).toString('base64url')
const d=(s:string)=>createHash('sha256').update(s).digest();const token=()=>randomBytes(32).toString('base64url')
const checks:{name:string;status:string;detail?:unknown}[]=[]
async function test(name:string,fn:()=>Promise<void>){try{await fn();checks.push({name,status:'PASS'});return true}catch(e){const code=(e as {code?:string})?.code;checks.push({name,status:'FAIL',detail:{sqlstate:typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code)?code:'ASSERTION_OR_DEPENDENCY'}});return false}}
function blocked(name:string){checks.push({name,status:'BLOCKED',detail:'Prerequisite failed; not simulated'})}
async function value(c:Pick<PoolClient,'query'>,sql:string,params:unknown[]=[]){return (await c.query(sql,params)).rows[0]?.value}
let encoded='',version='';const stage='setup'
async function preauth(){
 const cookie=token(),csrf=token()
 await unit.run(async c=>{
  const rows=await c.query('SELECT * FROM auth_api.credential_material_locked($1::text)',['u1@fixture.invalid']) as {rows:{password_hash:string;credential_version:string}[]}
  assert.equal(rows.rows.length,1);const r=rows.rows[0]
  const proof=await verifyPasswordFactor(password,r.password_hash,async()=>false);assert.equal('verified' in proof,true)
  const result=await c.query('SELECT auth_api.new_preauth_verified($1::uuid,$2::uuid,$3::bigint,$4::text,$5::bytea,$6::bytea) AS value',[input.principal,input.tenant,r.credential_version,r.password_hash,d(cookie),d(csrf)]) as {rows:{value:string}[]}
  assert.equal(typeof result.rows[0].value,'string')
 })
 return cookie
}
const method=randomUUID()
let cookie='',challenge='',outbox='',otp:ReturnType<typeof prepareEmailOtp>|undefined
let lastOutbox=''
async function issue(purpose:'ENROLLMENT'|'LOGIN',outcome:MailOutcome='ACCEPTED'){
 challenge=randomUUID();outbox=randomUUID();otp=prepareEmailOtp(cookie,hmac)
 const expiresAt=Math.floor(Date.now()+200000),issuedAt=Date.now()
 const context={tenantId:input.tenant,userId:input.user,methodId:method,methodVersion:purpose==='ENROLLMENT'?'1':'2',recipientVersion:'1',outboxId:outbox,challengeId:challenge}
 const sealed=sealMailPayload({recipient:'u1@fixture.invalid',code:otp.code,issuedAt,expiresAt},key,'synthetic-mail-v1',context)
 try{await unit.run(async c=>{
  const sql=purpose==='ENROLLMENT'?'SELECT auth_api.issue_email_enrollment($1::text,$2::uuid,$3::bigint,$4::bigint,$5::uuid,$6::uuid,$7::bytea,$8::bytea,$9::text,$10::timestamptz,$11::uuid) AS value':'SELECT auth_api.issue_email_assigned($1::text,$2::uuid,$3::bigint,$4::bigint,$5::uuid,$6::uuid,$7::bytea,$8::bytea,$9::text,$10::timestamptz,NULL,NULL,$11::uuid) AS value'
  const r=await c.query(sql,[cookie,method,context.methodVersion,'1',challenge,outbox,otp!.proofDigest,sealed,'synthetic-mail-v1',new Date(expiresAt),randomUUID()]) as {rows:{value:string}[]}
  assert.equal(r.rows[0].value,challenge)
 })}finally{sealed.fill(0)}
 let sends=0
 const result=await dispatchOneMail({store:createMailDispatchStore(mail as unknown as IdentityPool),now:Date.now,
  withReadKey:async(t,v,work)=>{assert.equal(t,input.tenant);assert.equal(v,'synthetic-mail-v1');return work(key)},
  deliver:async message=>{sends++;assert.equal(message.recipient,'u1@fixture.invalid');assert.equal(message.code,otp!.code);return outcome}})
 assert.deepEqual(result,{state:'FINISHED',outcome});assert.equal(sends,1);lastOutbox=outbox
 const row=(await admin.query('SELECT state,octet_length(payload_ciphertext) AS bytes FROM app.auth_outbox WHERE tenant_id=$1 AND id=$2',[input.tenant,outbox])).rows[0]
 assert.equal(row.state,outcome==='UNKNOWN'?'QUARANTINED':'SENT');if(outcome==='ACCEPTED')assert.equal(row.bytes,0)
}
try{
 const setup=await test('EMAIL-real-Argon-and-verified-recipient-setup',async()=>{
  encoded=await hash(password,{type:argon2id,memoryCost:65536,timeCost:3,parallelism:1,salt:randomBytes(16),hashLength:32})
  version=(await admin.query('UPDATE identity_private.credentials SET argon2id_hash=$1,credential_version=credential_version+1 WHERE principal_id=$2 RETURNING credential_version::text',[encoded,input.principal])).rows[0].credential_version
  const recipient=d('u1@fixture.invalid')
  assert.equal(await value(verifier,'SELECT auth_api.record_verified_recipient($1::uuid,$2::uuid,0,$3::bytea,$4::uuid,$5::timestamptz,$6::uuid) AS value',[input.tenant,input.user,recipient,randomUUID(),new Date(Date.now()+3600000),randomUUID()]),'1')
  cookie=await preauth()
  assert.equal(await value(identity,'SELECT auth_api.begin_email_enrollment($1::text,$2::uuid,1,$3::uuid) AS value',[cookie,method,randomUUID()]),method)
 })
 if(setup){
  const sent=await test('EMAIL-real-AEAD-committed-worker-enrollment-delivery',async()=>{await issue('ENROLLMENT')})
  if(sent){
   await test('EMAIL-wrong-code-retains-pending',async()=>{
    const wrong=otp!.code==='000000'?'000001':'000000'
    assert.equal(await value(identity,'SELECT auth_api.consume_email_v2($1::text,$2::uuid,$3::bytea,1,1,$4::uuid) AS value',[cookie,challenge,emailOtpDigest(wrong,cookie,hmac),randomUUID()]),false)
    assert.equal((await admin.query('SELECT state FROM app.mfa_methods WHERE tenant_id=$1 AND id=$2',[input.tenant,method])).rows[0].state,'PENDING')
   })
   await test('EMAIL-first-code-activates-CAS-and-replay-denied',async()=>{
    assert.equal(await value(identity,'SELECT auth_api.consume_email_v2($1::text,$2::uuid,$3::bytea,1,1,$4::uuid) AS value',[cookie,challenge,otp!.proofDigest,randomUUID()]),true)
    assert.equal((await admin.query('SELECT state FROM app.mfa_methods WHERE tenant_id=$1 AND id=$2',[input.tenant,method])).rows[0].state,'ACTIVE')
    assert.equal(await value(identity,'SELECT auth_api.consume_email_v2($1::text,$2::uuid,$3::bytea,1,1,$4::uuid) AS value',[cookie,challenge,otp!.proofDigest,randomUUID()]),false)
   })
   await test('EMAIL-verified-factor-persists-session-after-COMMIT',async()=>{
    const sessionToken=token(),csrf=token()
    await unit.run(async c=>{const r=await c.query('SELECT auth_api.issue_active_session($1::text,$2::bytea,$3::bytea,$4::integer,$5::integer,$6::text,$7::text,$8::uuid) AS value',[cookie,d(sessionToken),d(csrf),numeric('absolute_sensitive'),numeric('idle_sensitive'),'Synthetic device','Synthetic browser',randomUUID()]) as {rows:{value:{state:string}}[]};assert.equal(r.rows[0].value.state,'ACTIVE')})
    assert.equal((await admin.query('SELECT count(*)::integer AS n FROM app.sessions WHERE principal_id=$1 AND credential_version=$2 AND state=$3',[input.principal,version,'ACTIVE'])).rows[0].n,1)
   })
   const uncertain=await test('EMAIL-uncertain-delivery-durable-quarantine',async()=>{
    await admin.query("UPDATE app.mfa_challenges SET issued_at=now()-interval '10 minutes' WHERE tenant_id=$1 AND user_id=$2",[input.tenant,input.user])
    cookie=await preauth();await issue('LOGIN','UNKNOWN')
    assert.deepEqual(await dispatchOneMail({store:createMailDispatchStore(mail as unknown as IdentityPool),withReadKey:async()=>{throw Error('not expected')},deliver:async()=>{throw Error('not expected')},now:Date.now}),{state:'EMPTY'})
   })
   if(uncertain)await test('EMAIL-quarantine-retained-after-expiry-and-GC',async()=>{
    await admin.query("UPDATE app.auth_outbox SET available_at=now()-interval '10m',expires_at=now()-interval '1m' WHERE tenant_id=$1 AND id=$2",[input.tenant,lastOutbox])
    await maintenance.query('SELECT auth_api.gc_ephemeral()')
    assert.equal((await admin.query('SELECT state FROM app.auth_outbox WHERE tenant_id=$1 AND id=$2',[input.tenant,lastOutbox])).rows[0].state,'QUARANTINED')
   })
  }else for(const n of ['EMAIL-wrong-first-code','EMAIL-activation-session','EMAIL-quarantine-GC'])blocked(n)
  await test('EMAIL-pending-expiry-GC-preserves-kind-invariant',async()=>{
   await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,created_at,method_version) VALUES($1,$2,$3,'EMAIL_OTP','PENDING',now()-interval '1 day',1)",[input.tenant,randomUUID(),input.user])
   await maintenance.query('SELECT auth_api.gc_ephemeral()')
  })
 }else blocked('EMAIL-native-functional-flows')
}catch(e){checks.push({name:'EMAIL-harness-'+stage,status:'FAIL',detail:'REDACTED'})}
finally{key.fill(0);hmac.fill(0);await Promise.all([admin.end(),identity.end(),mail.end(),verifier.end(),maintenance.end()])}
console.log(JSON.stringify({scope:'PRIVATE_WORKER_REAL_PG_SYNTHETIC_TRANSPORT_NOT_PRODUCT_UI',checks}))
process.exitCode=checks.every(c=>c.status==='PASS')?0:1
