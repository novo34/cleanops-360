import test from 'node:test'
import assert from 'node:assert/strict'
import { hash, argon2id } from 'argon2'
import { TOTP, Secret } from 'otpauth'
import { createApprovedPrivateBackend, type ApprovedBackendDependencies } from '../../lib/b1/approved-backend.ts'
import { createAuthHandler, digest, names, closedBackend } from '../../lib/b1/service.ts'
import { profile, numeric } from '../../lib/b1/config.ts'
import type { IdentityConnection } from '../../lib/b1/pg-identity-driver.ts'

const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002'
const U='00000000-0000-4000-8000-000000000003', S='00000000-0000-4000-8000-000000000004'
const Q='00000000-0000-4000-8000-000000000005', M='00000000-0000-4000-8000-000000000006'
const C='00000000-0000-4000-8000-000000000007', N='00000000-0000-4000-8000-000000000008'
const P='00000000-0000-4000-8000-000000000009', M2='00000000-0000-4000-8000-000000000010'
const raw='a'.repeat(43), csrf='b'.repeat(43), origin='https://cleanops.example'
const initialNow=1_700_000_010_000, password='Synthetic login password 123'
const stored=hash(password,{type:argon2id,memoryCost:65536,timeCost:3,parallelism:1})
type Options={mode?:'ACTIVE'|'PREAUTH'|'BOOTSTRAP'; state?:'PENDING_MFA'|'ENROLLMENT_REQUIRED'; risk?:string; foreign?:boolean; stale?:boolean; expired?:boolean;
 auditFailure?:boolean; commitFailure?:boolean; missingLabels?:boolean; multiple?:boolean; noTotp?:boolean; revoked?:boolean; duplicate?:boolean; labels?:{device:string;browser:string}; maxMethods?:number|null; rateLimited?:boolean; cooldown?:boolean}
type Challenge={id:string;method:string;version:string;state:string;grant:string|null;resource:string|null;expires:number}
type Reservation={hash:string;oneTime:boolean;done:boolean;data:unknown}
type State={counter:number|null;verified:boolean;consumed:boolean;sessions:number;audits:number;attempts:number;
 challenges:Record<string,Challenge>;reservations:Record<string,Reservation>}
async function fixture(options:Options={}) {
 let time=initialNow, generation='3', queue=Promise.resolve(), connects=0
 const initialChallenge:Challenge={id:C,method:M,version:'3',state:'ISSUED',grant:options.mode==='ACTIVE'?'B1-SELF-05':null,resource:null,expires:time+30_000}
 let committed:State={counter:null,verified:false,consumed:false,sessions:0,audits:0,attempts:0,challenges:{[C]:initialChallenge},reservations:{}}
 const calls:{connection:number;name:string;values:unknown[]}[]=[], releases:boolean[]=[]
 const mode=options.mode??'PREAUTH'
 const err=(message:string)=>Object.assign(new Error(message),{code:'P0001'})
 const pool={async connect():Promise<IdentityConnection>{
  const id=++connects;let staged=structuredClone(committed), unlock=()=>{}
  return {
   async query(sql,values=[]){
    const name=/auth_api\.([a-z_]+)/.exec(sql)?.[1]??sql
    calls.push({connection:id,name,values})
    if(sql.startsWith('BEGIN')){
     const prior=queue;queue=new Promise<void>(resolve=>{unlock=resolve});await prior
     staged=structuredClone(committed);return {}
    }
    if(['SAVEPOINT b1_totp_material','ROLLBACK TO SAVEPOINT b1_totp_material','RELEASE SAVEPOINT b1_totp_material'].includes(sql))return {}
    if(sql==='ROLLBACK')return {}
    if(sql==='COMMIT'){
     if(options.commitFailure)throw err('private commit diagnostic')
     if(Object.values(staged.reservations).some(r=>!r.done))throw err('RESERVATION_NOT_OWNED')
     committed=structuredClone(staged);return {}
    }
    const tenant=options.foreign?B:A
    const binding={kind:mode,id:mode==='ACTIVE'?S:Q,tenantId:mode==='BOOTSTRAP'?undefined:A,userId:mode==='BOOTSTRAP'?undefined:U,
     sessionId:mode==='ACTIVE'?S:undefined,state:mode==='PREAUTH'?(options.state??'PENDING_MFA'):undefined,csrfDigest:digest(csrf),expiresAt:time+30_000}
    let value:unknown=null
    if(name==='security_policy')value=profile.values
    else if(name==='resolve_binding'){
     if(options.revoked||staged.consumed)throw err('AUTH_INVALID')
     value=binding
    }
    else if(name==='active_summary')value={state:'ACTIVE',session_id:S,tenant_id:A,absolute_expires_at:new Date(initialNow+86_400_000).toISOString(),secret_ciphertext:'must-not-leak'}
    else if(name==='binding_authorization')return{rows:[{allowed:!options.revoked,step_up:true}]}
    else if(name==='rate_attempt')value=options.rateLimited?60:0
    else if(name==='credential_material_locked')return{rows:[{principal_id:P,password_hash:await stored,credential_version:'7'}]}
    else if(name==='new_preauth_verified')value=Q
    else if(name==='memberships')return{rows:[{id:A,name:'A'}]}
    else if(name==='select_tenant')value=Q
    else if(name==='preauth_summary')value={state:'PENDING_MFA',expires_at:new Date(time+30_000).toISOString()}
    else if(name==='reserve_owned'){
     const key=String(values[1])+':'+(values[2] as Buffer).toString('hex'), request=(values[3] as Buffer).toString('hex')
     const existing=staged.reservations[key]
     if(existing&&existing.hash!==request)throw err('IDEMPOTENCY_MISMATCH')
     if(existing?.done&&existing.oneTime)throw err('RESULT_NOT_REPLAYABLE')
     const row=existing??{hash:request,oneTime:Boolean(values[4]),done:false,data:null}
     staged.reservations[key]=row
     value={replay:row.done,requestHash:request,oneTime:row.oneTime,data:row.data,expiresAt:time+60_000}
    }
    else if(name==='complete_owned'||name==='discard_owned'){
     const key=String(values[1])+':'+(values[2] as Buffer).toString('hex'),row=staged.reservations[key]
     if(!row||row.done||row.hash!==(values[3] as Buffer).toString('hex'))throw err('RESERVATION_NOT_OWNED')
     if(name==='discard_owned')delete staged.reservations[key]
     else{row.done=true;row.data=values[4]===null?null:JSON.parse(String(values[4]))}
     value=true
    }
    else if(name==='trusted_mfa_material'){
     if(options.revoked||(values[1]==='ISSUE_SESSION'&&!staged.verified))throw err('AUTH_INVALID')
     const methods=options.noTotp?[{id:M,kind:'EMAIL_OTP',version:generation}]:
      [{id:M,kind:'TOTP',version:generation},...(options.multiple?[{id:M2,kind:'TOTP',version:generation}]:[]),...(options.duplicate?[{id:M,kind:'TOTP',version:generation}]:[])]
     value={tenantId:tenant,userId:U,bindingId:values[0]===null?S:Q,riskClass:options.risk??'SENSITIVE',enabledMethods:methods,
      recipient:values[1]==='ISSUE_SESSION'?null:'private-recipient@example.invalid',expiresAt:new Date(time+(options.expired?-1:30_000)).toISOString()}
    }
    else if(name==='issue_bound_challenge'){
     if(!Object.values(staged.reservations).some(r=>!r.done))throw err('RESERVATION_NOT_OWNED')
     if(options.cooldown)throw err('RATE_LIMITED')
     if(options.stale||values[3]!==generation)throw err('AUTH_INVALID')
     const challengeId=Object.keys(staged.challenges).includes(C)&&staged.challenges[C].grant===values[7]?N:C
     for(const c of Object.values(staged.challenges))c.state='REVOKED'
     staged.challenges[challengeId]={id:challengeId,method:values[2] as string,version:generation,state:'ISSUED',grant:values[7] as string|null,resource:values[8] as string|null,expires:time+30_000}
     staged.audits++
     if(options.auditFailure)throw err('audit private diagnostic')
     value=challengeId
    }
    else if(name==='totp_material_locked'){
     // This fixture contains ACTIVE challenge methods, never a PENDING enrollment.
     if(values[2]==='ENROLLMENT')throw err('AUTH_INVALID')
     const c=staged.challenges[String(values[1])]
     if(!c||c.state!=='ISSUED'||c.version!==generation||c.expires<=time)throw err('AUTH_INVALID')
     value={binding:{tenantId:tenant,userId:U,methodId:c.method,ceremonyId:c.id,purpose:values[2]},version:generation,lastCounter:staged.counter,
      expiresAt:c.expires,algorithm:'SHA1',secret_ciphertext:Buffer.from('ciphertext-canary').toString('base64'),key_version:'fixture-key',
      grant_key:c.grant,resource_id:c.resource,session_id:mode==='ACTIVE'?S:null}
    }
    else if(name==='consume_totp_cas'){
     const c=staged.challenges[String(values[1])]
     if(!Object.values(staged.reservations).some(r=>!r.done))throw err('RESERVATION_NOT_OWNED')
     staged.attempts++
     value=!!c&&c.state==='ISSUED'&&c.version===generation&&values[3]===generation&&values[4]===staged.counter&&
      typeof values[5]==='number'&&(staged.counter===null||values[5]>staged.counter)
     if(value){staged.counter=values[5] as number;c.state='VERIFIED';staged.verified=true;staged.audits++}
    }
    else if(name==='issue_active_session'){
     if(!staged.verified||staged.consumed)throw err('AUTH_INVALID')
     staged.sessions++;staged.consumed=true;staged.audits++
     if(options.auditFailure)throw err('audit private diagnostic')
     value={state:'ACTIVE',session_id:N,tenant_id:tenant,absolute_expires_at:new Date(time+Number(values[3])*1000).toISOString(),
      recipient:'private-recipient@example.invalid',secret_ciphertext:'ciphertext-canary'}
    }
    else if(name==='record_security_event')value=null
    else throw err('unexpected fixture function '+name)
    return{rows:[{value}]}
   },
   release(discard=false){releases.push(discard);unlock()},
  }
 }}
 const deps:ApprovedBackendDependencies={
  factors:{dummyPasswordHash:await stored,auditKey:Buffer.alloc(32,1),otpKey:Buffer.alloc(32,2),recoveryKey:Buffer.alloc(32,3),
   async decryptTotp(){return new TextEncoder().encode('12345678901234567890')}},
  cursorKey:Buffer.alloc(32,4),now:()=>time,
  maxEligibleTotpMethods:options.maxMethods===null?undefined:options.maxMethods??4,
  transport(){return{network:Buffer.alloc(32,5),device:Buffer.alloc(32,6)}},
  normalizeEmail(email){return email.trim().toLowerCase()},
  sessionLabels:options.missingLabels?undefined:()=>(options.labels??{device:'Synthetic device',browser:'Synthetic browser'}),
 }
 const backend=createApprovedPrivateBackend(pool,deps),handler=createAuthHandler(backend,origin,()=>time)
 async function request(operation:string,body:unknown,key?:string,rawBody?:string){
  const route=operation==='login'?'/auth/login':operation==='startStepUp'?'/auth/step-up':operation==='resendOtp'?'/auth/otp/resend':operation==='confirmTotp'?'/mfa/totp/confirm':operation==='selectTotpMethod'?'/auth/mfa/totp/select':'/auth/mfa/verify'
  const name=mode==='ACTIVE'?names.session:names.preauth
  return handler.handle(new Request(origin+route,{method:'POST',
   headers:{cookie:name+'='+raw+'; '+names.csrf+'='+csrf,origin,'sec-fetch-site':'same-origin','x-csrf-token':csrf,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},
   body:rawBody??JSON.stringify(body)}),operation)
 }
 return{backend,request,calls,releases,get state(){return structuredClone(committed)},get connects(){return connects},
  advance(ms:number){time+=ms},setGeneration(v:string){generation=v},options}
}
const proof=()=>TOTP.generate({secret:Secret.fromUTF8('12345678901234567890'),algorithm:'SHA1',digits:6,period:30,timestamp:initialNow})
function privateFree(text:string){for(const forbidden of ['private-recipient','ciphertext-canary','secret_ciphertext','key_version','otpauth://','grant_key'])assert.ok(!text.includes(forbidden),forbidden)}

test('real Argon2 login creates a version-bound TOTP challenge, owned marker and PREAUTH cookie only after commit',async()=>{
 const f=await fixture({mode:'BOOTSTRAP'})
 const response=await f.request('login',{email:'synthetic@example.invalid',password})
 assert.equal(response.status,200);assert.ok(response.headers.has('set-cookie'))
 const text=await response.text();privateFree(text)
 const data=JSON.parse(text).data
 assert.equal(data.state,'PENDING_MFA');assert.deepEqual(data.allowed_methods,['TOTP'])
 assert.equal(f.state.sessions,0);assert.equal(f.state.audits,1)
 assert.equal(f.connects,1);assert.equal(f.calls.at(-1)?.name,'COMMIT')
 assert.equal(f.calls.find(c=>c.name==='issue_bound_challenge')!.values[3],'3')
 assert.equal(f.calls.find(c=>c.name==='complete_owned')!.values[4],null)
})
test('PREAUTH real TOTP CAS and risk-specific session issuance share one transaction with private projection',async()=>{
 for(const risk of ['SENSITIVE','OPERATIONAL']){
  const f=await fixture({risk})
  const response=await f.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:proof()})
  assert.equal(response.status,200);assert.ok(response.headers.has('set-cookie'))
  const text=await response.text();privateFree(text)
  assert.equal(JSON.parse(text).data.tenant_id,A)
  assert.equal(f.state.sessions,1);assert.equal(f.state.attempts,1);assert.equal(f.state.consumed,true)
  const call=f.calls.find(c=>c.name==='issue_active_session')!
  assert.equal(call.values[3],numeric(risk==='SENSITIVE'?'absolute_sensitive':'absolute_operational'))
  assert.equal(call.values[4],numeric(risk==='SENSITIVE'?'idle_sensitive':'idle_operational'))
  assert.equal((call.values[1] as Buffer).length,32);assert.equal((call.values[2] as Buffer).length,32)
  assert.equal(f.connects,1);assert.equal(f.calls.at(-1)?.name,'COMMIT')
 }
})
function primaryRollback(f:{calls:{connection:number;name:string}[];releases:boolean[]}){const connection=f.calls.filter(c=>c.name==='resolve_binding').at(-1)!.connection;assert.equal(f.calls.filter(c=>c.connection===connection).at(-1)?.name,'ROLLBACK');assert.equal(f.releases[connection-1],true)}
test('step-up prepares TOTP only, replays safe descriptor and revalidates method generation on retry',async()=>{
 const f=await fixture({mode:'ACTIVE'}),key='step-up-key-for-test-123'
 const first=await f.request('startStepUp',{grant_id:'B1-SELF-05'},key)
 assert.equal(first.status,200);assert.equal(first.headers.get('set-cookie'),null)
 const body=await first.text();privateFree(body)
 const again=await f.request('startStepUp',{grant_id:'B1-SELF-05'},key)
 assert.equal(again.status,200)
 assert.deepEqual((await again.json()).data,JSON.parse(body).data)
 assert.equal(f.calls.filter(c=>c.name==='issue_bound_challenge').length,1)
 f.setGeneration('4')
 const stale=await f.request('startStepUp',{grant_id:'B1-SELF-05'},key)
 assert.equal(stale.status,401);primaryRollback(f)
})
test('TOTP resend binds old method/context, replaces challenge and never invokes EMAIL',async()=>{
 const f=await fixture({mode:'ACTIVE'})
 const response=await f.request('resendOtp',{challenge_id:C},'resend-key-for-test-123')
 assert.equal(response.status,200)
 const text=await response.text();privateFree(text);assert.equal(JSON.parse(text).data.method,'TOTP')
 assert.equal(f.state.challenges[C].state,'REVOKED')
 assert.equal(f.calls.some(c=>c.name==='issue_challenge'||c.name==='consume_email_otp'),false)
})
test('ambiguous/no-TOTP, foreign context, stale generation and expiry abort preparation without effects',async()=>{
 for(const options of [{noTotp:true},{foreign:true},{stale:true},{expired:true},{auditFailure:true},{risk:'UNKNOWN'}]){
  const f=await fixture({mode:'ACTIVE',...options})
  const response=await f.request('startStepUp',{grant_id:'B1-SELF-05'},'step-key-fail-test-123')
  assert.ok(response.status>=400)
  privateFree(await response.text());assert.equal(response.headers.get('set-cookie'),null)
  assert.equal(f.state.audits,0);primaryRollback(f)
 }
})
test('missing trusted labels, audit failure and COMMIT failure roll back factor consumption and session together',async()=>{
 for(const options of [{missingLabels:true},{auditFailure:true},{commitFailure:true}]){
  const f=await fixture(options)
  const response=await f.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:proof()})
  assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);privateFree(await response.text())
  assert.equal(f.state.counter,null);assert.equal(f.state.sessions,0);assert.equal(f.state.audits,0)
  primaryRollback(f)
 }
})
test('concurrent PREAUTH verification has one session winner; consumed proof cannot be retried',async()=>{
 const f=await fixture()
 const responses=await Promise.all([f.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:proof()}),f.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:proof()})])
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,401])
 assert.equal(f.state.sessions,1);assert.equal(f.state.attempts,1)
 assert.equal(responses.filter(r=>r.headers.has('set-cookie')).length,1)
})
test('rollback permits fresh whole-request retry; no implicit retry of uncertain COMMIT',async()=>{
 const f=await fixture({commitFailure:true})
 const first=await f.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:proof()})
 assert.equal(first.status,503);assert.equal(f.connects,2);assert.equal(f.calls.filter(c=>c.name==='consume_totp_cas').length,1);assert.ok(f.calls.some(c=>c.name==='record_security_event'&&c.values[0]==='DEPENDENCY_FAILURE'))
 f.options.commitFailure=false
 const second=await f.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:proof()})
 assert.equal(second.status,200);assert.equal(f.state.sessions,1);assert.equal(f.connects,3);assert.equal(f.calls.filter(c=>c.name==='consume_totp_cas').length,2)
})
test('invalid TOTP commits bounded attempt and discards internal reservation; EMAIL remains closed',async()=>{
 const f=await fixture()
 const bad=proof()==='000000'?'000001':'000000'
 const response=await f.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:bad})
 assert.equal(response.status,401);assert.equal(f.state.sessions,0);assert.equal(f.state.attempts,1)
 assert.equal(f.calls.at(-1)?.name,'COMMIT')
 assert.equal(f.calls.filter(c=>c.name==='discard_owned').length,1)
 const email=await f.request('verifyMfa',{challenge_id:C,method:'EMAIL_OTP',proof:'123456'})
 assert.equal(email.status,503);assert.equal(f.calls.some(c=>c.name==='consume_email_otp'),false)
})
test('replay after expiry and foreign-tenant verification never emit session/cookie',async()=>{
 const f=await fixture({mode:'ACTIVE'}),key='step-up-expiry-key-123'
 assert.equal((await f.request('startStepUp',{grant_id:'B1-SELF-05'},key)).status,200)
 f.advance(31_000)
 assert.ok((await f.request('startStepUp',{grant_id:'B1-SELF-05'},key)).status>=400)
 const foreign=await fixture({foreign:true})
 const response=await foreign.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:proof()})
 assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);assert.equal(foreign.state.sessions,0)
 await assert.rejects(closedBackend.transaction(async()=>true))
})

test('approved PREAUTH confirmation rejects absent stored enrollment before CAS or session issuance',async()=>{
 const f=await fixture({state:'ENROLLMENT_REQUIRED'})
 const response=await f.request('confirmTotp',{enrollment_id:C,proof:proof()},'confirm-closed-key-123')
 assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null)
 assert.equal(f.calls.some(c=>c.name==='totp_material_locked'),true)
 assert.equal(f.calls.some(c=>c.name==='consume_enrollment_cas'),false)
 assert.equal(f.state.sessions,0);assert.equal(f.calls.at(-1)?.name,'COMMIT')
 assert.equal(f.calls.some(c=>c.name==='record_security_event'),true)
 assert.equal(Object.keys(f.state.reservations).length,0)
})

test('approved missing selection response exposes own locators only; concurrent discovery has no challenge/factor effects',async()=>{
 const f=await fixture({mode:'ACTIVE',multiple:true})
 const responses=await Promise.all([
  f.request('startStepUp',{grant_id:'B1-SELF-05'},'selection-required-key-1'),
  f.request('startStepUp',{grant_id:'B1-SELF-05'},'selection-required-key-2'),
 ])
 for(const response of responses){
  assert.equal(response.status,200)
  const text=await response.text();privateFree(text)
  assert.equal(JSON.parse(text).data.state,'TOTP_SELECTION_REQUIRED')
  assert.deepEqual(JSON.parse(text).data.methods.map((m:{method_id:string})=>m.method_id),[M,M2])
  assert.equal(response.headers.get('set-cookie'),null)
 }
 assert.equal(f.state.audits,0);assert.equal(f.state.counter,null)
 assert.equal(f.calls.some(c=>c.name==='issue_bound_challenge'||c.name==='consume_totp_cas'),false)
 assert.equal(f.calls.filter(c=>c.name==='COMMIT').length,2)
})
test('V4 HTTP rejects unapproved selector and all client authority fields without broker side effects',async()=>{
 for(const fields of [{totp_method_id:M},{totp_method_id:'invalid'},{tenantId:B},{userId:U},{methodVersion:'3'},{riskClass:'OPERATIONAL'}]){
  const f=await fixture({mode:'ACTIVE',multiple:true})
  const response=await f.request('startStepUp',{grant_id:'B1-SELF-05',...fields},'closed-http-selector-key')
  assert.equal(response.status,422)
  assert.equal(f.connects,0)
  assert.equal(response.headers.get('set-cookie'),null)
 }
})
test('resend selects the prior trusted UUID among multiple methods; revoked/duplicate/stale choices stay closed',async()=>{
 const valid=await fixture({mode:'ACTIVE',multiple:true})
 assert.equal((await valid.request('resendOtp',{challenge_id:C},'explicit-resend-key-123')).status,200)
 assert.equal(valid.calls.find(c=>c.name==='issue_bound_challenge')!.values[2],M)
 for(const options of [{noTotp:true},{duplicate:true},{stale:true},{foreign:true},{expired:true}]){
  const f=await fixture({mode:'ACTIVE',multiple:true,...options})
  const response=await f.request('resendOtp',{challenge_id:C},'invalid-selection-key-123')
  assert.ok(response.status>=400);assert.equal(response.headers.get('set-cookie'),null)
  assert.equal(f.state.audits,0);primaryRollback(f)
 }
})
test('session metadata is normalized at the private callback boundary and never reflected in HTTP',async()=>{
 const f=await fixture({labels:{device:'  Private  device ',browser:' Café '}})
 const response=await f.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:proof()})
 assert.equal(response.status,200)
 const call=f.calls.find(c=>c.name==='issue_active_session')!
 assert.equal(call.values[5],'Private device');assert.equal(call.values[6],'Café')
 const body=await response.text();assert.ok(!body.includes('Private device'));assert.ok(!body.includes('Café'))
 const bad=await fixture({labels:{device:'Device\r\nlog-canary',browser:'Browser'}})
 const error=await bad.request('verifyMfa',{challenge_id:C,method:'TOTP',proof:proof()})
 assert.equal(error.status,503);assert.equal(bad.state.counter,null);assert.equal(bad.state.sessions,0)
 assert.ok(!(await error.text()).includes('log-canary'));assert.equal(bad.calls.at(-1)?.name,'ROLLBACK')
})

test('approved selector creates bound TOTP challenges in ACTIVE and proven PREAUTH without consuming any factor',async()=>{
 for(const mode of ['ACTIVE','PREAUTH'] as const){
  const f=await fixture({mode,multiple:true})
  const input={totp_method_id:M2,...(mode==='ACTIVE'?{grant_id:'B1-SELF-05'}:{})}
  const response=await f.request('selectTotpMethod',input,'totp-select-http-key-123')
  assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null)
  const body=await response.text();privateFree(body)
  assert.equal(JSON.parse(body).data.state,mode==='PREAUTH'?'PENDING_MFA':undefined)
  assert.equal(f.calls.find(c=>c.name==='issue_bound_challenge')!.values[2],M2)
  assert.equal(f.calls.find(c=>c.name==='issue_bound_challenge')!.values[3],'3')
  assert.equal(f.state.attempts,0);assert.equal(f.state.sessions,0);assert.equal(f.state.audits,1)
  assert.equal(f.connects,1);assert.equal(f.calls.at(-1)?.name,'COMMIT')
 }
})
test('multi-method login returns own choices and PREAUTH only after commit, never an ACTIVE session',async()=>{
 const f=await fixture({mode:'BOOTSTRAP',multiple:true})
 const response=await f.request('login',{email:'synthetic@example.invalid',password})
 assert.equal(response.status,200);assert.ok(response.headers.has('set-cookie'))
 const text=await response.text();privateFree(text)
 assert.equal(JSON.parse(text).data.state,'TOTP_SELECTION_REQUIRED')
 assert.deepEqual(JSON.parse(text).data.methods.map((m:{method_id:string})=>m.method_id),[M,M2])
 assert.equal(f.state.sessions,0);assert.equal(f.state.audits,0)
 assert.equal(f.calls.some(c=>c.name==='issue_bound_challenge'||c.name==='consume_totp_cas'),false)
})
test('selector schema and context reject authority injection, missing ACTIVE grant, forbidden PREAUTH grant and bootstrap',async()=>{
 for(const [mode,input,status] of [
  ['ACTIVE',{totp_method_id:'bad',grant_id:'B1-SELF-05'},422],
  ['ACTIVE',{totp_method_id:M},422],
  ['PREAUTH',{totp_method_id:M,grant_id:'B1-SELF-05'},422],
  ['ACTIVE',{totp_method_id:M,grant_id:'B1-SELF-08'},422],
  ['ACTIVE',{totp_method_id:M,grant_id:'B1-SELF-05',riskClass:'OPERATIONAL'},422],
  ['ACTIVE',{totp_method_id:M,grant_id:'B1-SELF-05',tenantId:B},422],
  ['ACTIVE',{totp_method_id:M,grant_id:'B1-SELF-05',methodVersion:'3'},422],
  ['BOOTSTRAP',{totp_method_id:M},401],
 ] as const){
  const f=await fixture({mode,multiple:true})
  const response=await f.request('selectTotpMethod',input,'invalid-selector-key-123')
  assert.equal(response.status,status);assert.equal(f.state.audits,0)
  assert.equal(f.calls.some(c=>c.name==='issue_bound_challenge'),false)
  assert.equal(response.headers.get('set-cookie'),null)
 }
})
test('duplicate and escaped duplicate selector keys reject before connection with generic HTTP error',async()=>{
 for(const rawBody of [
  '{"totp_method_id":"'+M+'","totp_method_id":"'+M2+'","grant_id":"B1-SELF-05"}',
  '{"totp_method_id":"'+M+'","totp_method_\\u0069d":"'+M2+'","grant_id":"B1-SELF-05"}',
  '{"totp_method_id":"'+M+'","grant_id":"B1-SELF-05","grant_id":"B1-SELF-08"}',
 ]){
  const f=await fixture({mode:'ACTIVE',multiple:true})
  const response=await f.request('selectTotpMethod',{},'duplicate-selector-key-123',rawBody)
  assert.equal(response.status,400);assert.equal(f.connects,0)
  const body=await response.text();assert.ok(!body.includes(M));assert.ok(!body.includes(M2))
 }
})
test('foreign/revoked/stale/expired choices and audit/COMMIT failure roll back selector effects',async()=>{
 for(const options of [{foreign:true},{noTotp:true},{stale:true},{expired:true},{auditFailure:true},{commitFailure:true},{revoked:true},{duplicate:true}]){
  const f=await fixture({mode:'ACTIVE',multiple:true,...options})
  const response=await f.request('selectTotpMethod',{totp_method_id:M2,grant_id:'B1-SELF-05'},'selector-rollback-key-123')
  assert.ok(response.status>=400);assert.equal(f.state.audits,0);assert.equal(f.state.attempts,0)
  assert.equal(response.headers.get('set-cookie'),null);primaryRollback(f)
 }
 const alien=await fixture({mode:'ACTIVE',multiple:true})
 assert.equal((await alien.request('selectTotpMethod',{totp_method_id:P,grant_id:'B1-SELF-05'},'foreign-method-key-123')).status,401)
})
test('concurrent same-key selection has one challenge/audit and replay revalidates generation',async()=>{
 const f=await fixture({mode:'ACTIVE',multiple:true}),input={totp_method_id:M2,grant_id:'B1-SELF-05'},key='concurrent-select-key-123'
 const responses=await Promise.all([f.request('selectTotpMethod',input,key),f.request('selectTotpMethod',input,key)])
 assert.deepEqual(responses.map(r=>r.status),[200,200])
 assert.deepEqual((await responses[0].json()).data,(await responses[1].json()).data)
 assert.equal(f.state.audits,1);assert.equal(f.calls.filter(c=>c.name==='issue_bound_challenge').length,1)
 const changed=await f.request('selectTotpMethod',{...input,totp_method_id:M},key)
 assert.equal(changed.status,409)
 f.setGeneration('4')
 assert.equal((await f.request('selectTotpMethod',input,key)).status,401)
})
test('explicit limit is required and enforced; rate and cooldown never issue a challenge',async()=>{
 for(const options of [{maxMethods:null},{maxMethods:1},{rateLimited:true},{cooldown:true}]){
  const f=await fixture({mode:'ACTIVE',multiple:true,...options})
  const response=await f.request('selectTotpMethod',{totp_method_id:M2,grant_id:'B1-SELF-05'},'bounded-select-key-123')
  assert.ok(response.status>=400);assert.equal(f.state.audits,0)
  if(options.rateLimited)assert.equal(response.status,429)
 }
 for(const maxMethods of [0,-1,1.5,Number.MAX_SAFE_INTEGER])
  await assert.rejects(fixture({maxMethods}))
})
