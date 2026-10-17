import test from 'node:test'
import assert from 'node:assert/strict'
import { createApprovedPrivateBackend } from '../../lib/b1/approved-backend.ts'
import { createAuthHandler, digest, names } from '../../lib/b1/service.ts'
import { profile } from '../../lib/b1/config.ts'
import { openEnrollmentSecret } from '../../lib/b1/ceremony-preparation.ts'
const id = (n: number) => '00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const now = 1700000000000, expiry = now+60000, raw='a'.repeat(43),csrf='b'.repeat(43),origin='https://enroll.fixture.invalid'
async function fixture(options: { commitFailure?: boolean; foreign?: boolean; denied?: boolean; custodyFailure?: boolean; replay?: boolean }={}) {
 let committed=false,keyReads=0
 const key=Buffer.alloc(32,7),calls:string[]=[]
 const pool={ async connect() { return { async query(sql:string,values:unknown[]=[]) {
  const name=/auth_api\.([a-z_]+)/.exec(sql)?.[1]??sql; calls.push(name)
  if(sql==='COMMIT') { if(options.commitFailure) throw Error('private commit failure'); committed=true }
  let value:unknown=null
  if(name==='security_policy') value=profile.values
  if(name==='resolve_binding') value={kind:'PREAUTH',id:id(1),tenantId:id(2),userId:id(3),state:'ENROLLMENT_REQUIRED',csrfDigest:digest(csrf),expiresAt:expiry}
  if(name==='binding_authorization') return {rows:[{allowed:!options.denied,step_up:false}]}
  if(name==='rate_attempt') value=0
  if(name==='reserve_owned') value={replay:!!options.replay,requestHash:(values[3] as Buffer).toString('hex'),oneTime:true,expiresAt:expiry,data:null}
  if(name==='trusted_mfa_material') value={tenantId:id(options.foreign?9:2),userId:id(3),bindingId:id(1),riskClass:'SENSITIVE',enabledMethods:[],recipient:null,expiresAt:new Date(expiry).toISOString()}
  if(name==='begin_totp_enrollment_assigned') {
   assert.equal(values[1],id(2));assert.equal(values[2],id(3));assert.equal(values[4],'1');assert.equal(values[7],'SHA256')
   const plaintext=openEnrollmentSecret(values[5] as Buffer,key,String(values[6]),{tenantId:id(2),userId:id(3),methodId:String(values[3]),initialMethodVersion:'1',algorithm:'SHA256'})
   assert.equal(plaintext.length,32);plaintext.fill(0)
   value={methodId:values[3],initialVersion:'1',expiresAt:new Date(expiry).toISOString()}
  }
  if(name==='complete_owned') { assert.equal(values[4],null);value=true }
  return {rows:[{value}]}
 },release() {} } } }
 const dummy='$argon2id$v=19$m=65536,t=3,p=1$'+Buffer.alloc(16,1).toString('base64').replace(/=+$/,'')+'$'+Buffer.alloc(32,2).toString('base64').replace(/=+$/,'')
 const backend=createApprovedPrivateBackend(pool,{now:()=>now,factors:{dummyPasswordHash:dummy,auditKey:Buffer.alloc(32,1),otpKey:Buffer.alloc(32,2),recoveryKey:Buffer.alloc(32,3),async decryptTotp(){throw Error('not called')}},
  cursorKey:Buffer.alloc(32,4),transport:()=>({network:Buffer.alloc(32,5),device:Buffer.alloc(32,6)}),normalizeEmail:x=>x,
  enrollment:{async withWriteKey(tenant,work){keyReads++;assert.equal(tenant,id(2));if(options.custodyFailure)throw Error('private key unavailable');return work(key,'fixture-v1')},async accountAlias(){return 'non-pii-alias'}}})
 const handler=createAuthHandler(backend,origin,()=>now)
 const request=()=>handler.handle(new Request(origin+'/mfa/totp/enroll',{method:'POST',headers:{cookie:names.preauth+'='+raw+'; '+names.csrf+'='+csrf,origin,'sec-fetch-site':'same-origin','x-csrf-token':csrf,'idempotency-key':'fixture-enroll-once-123'}}),'enrollTotp')
 return {request,calls,get committed(){return committed},get keyReads(){return keyReads}}
}
test('PREAUTH enrollment seals assigned UUID and emits URI only after commit with nonreplayable owned result',async()=>{
 const f=await fixture(),response=await f.request();assert.equal(response.status,200);assert.equal(f.committed,true)
 const result=await response.json();assert.equal(new URL(result.data.provisioning_uri).searchParams.get('algorithm'),'SHA256')
 assert.equal(new URL(result.data.provisioning_uri).searchParams.get('issuer'),'CleanOps 360')
 assert.equal(f.calls.at(-1),'COMMIT');assert.equal(f.keyReads,1)
 assert.ok(f.calls.indexOf('reserve_owned')<f.calls.indexOf('begin_totp_enrollment_assigned'))
})
test('commit/custody failures never emit provisioning secret or cookies; transaction rolls back',async()=>{
 for(const options of [{commitFailure:true},{custodyFailure:true}]){
  const f=await fixture(options),response=await f.request();assert.equal(response.status,503)
  assert.equal(response.headers.get('set-cookie'),null);assert.equal((await response.text()).includes('otpauth:'),false)
  assert.equal(f.committed,false);assert.equal(f.calls.at(-1),'ROLLBACK')
 }
})
test('foreign material, denied permission and one-time replay never read custody or provision a method',async()=>{
 for(const [options,status] of [[{foreign:true},401],[{denied:true},403],[{replay:true},409]] as const){
  const f=await fixture(options),response=await f.request();assert.equal(response.status,status);assert.equal(f.keyReads,0)
  assert.equal(f.calls.includes('begin_totp_enrollment_assigned'),false)
 }
})
