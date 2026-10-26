import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {operations,valid} from '../../lib/b1/contracts.ts'
import {createAuthHandler,names,digest,type Backend,type Transaction,type Binding,type Effect} from '../../lib/b1/service.ts'
const origin='https://fixture.invalid',raw='a'.repeat(43),csrf='b'.repeat(43),now=1700000000000,id=randomUUID()
function fixture(kind:'ACTIVE'|'PREAUTH'='ACTIVE',fail=false){
 const actor:Binding={kind,id,sessionId:id,tenantId:randomUUID(),userId:randomUUID(),csrfDigest:digest(csrf),absoluteExpiresAt:now+600000,expiresAt:now+600000,state:kind==='PREAUTH'?'PENDING_MFA':undefined}
 const expiresAt=now+2592000000;let staged=false,committed=false,persisted:unknown='unset'
 let effect:Effect={data:{device:{id,created_at:new Date(now).toISOString(),expires_at:new Date(expiresAt).toISOString()}},trustedCookie:{token:'t'.repeat(43),expiresAt}}
 const tx:Transaction={async renewActivity(binding: {expiresAt:number}){return binding.expiresAt},async resolve(){return actor},async authorize(){return true},async stepUp(){return true},async auditFailure(){},async rateLimit(){return null},async reserve(_s,requestHash){return {replay:false,requestHash,oneTime:true,expiresAt:actor.expiresAt}},async discard(){},async complete(_s,_h,data,oneTime){assert.equal(oneTime,true);persisted=data},async execute(){staged=true;return effect}}
 const backend:Backend={async bootstrap(){},async transaction(work){const result=await work(tx);if(fail)throw Error('private commit failure');committed=true;return result}}
 return {handle:()=>createAuthHandler(backend,origin,()=>now).handle(new Request(origin+'/me/trusted-devices',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','X-CSRF-Token':csrf,'Idempotency-Key':randomUUID(),Cookie:`${names.session}=${raw}; ${names.csrf}=${csrf}`}}),'registerTrustedDevice'),get committed(){return committed},get staged(){return staged},get persisted(){return persisted},set effect(value:Effect){effect=value}}
}
test('trusted cookie is HttpOnly post-COMMIT and never part of HTTP JSON or idempotent result',async()=>{
 const f=fixture(),response=await f.handle();assert.equal(response.status,200);assert.equal(f.committed,true)
 assert.match(response.headers.get('set-cookie')!,/__Host-cleanops_trusted=t+; Path=\/; Secure; SameSite=Lax; Max-Age=2592000; HttpOnly/)
 assert.equal(f.persisted,null);assert.ok(!(await response.text()).includes('tttt'))
})
test('trusted registration cannot create trust from PREAUTH or leak a cookie on failed COMMIT',async()=>{
 const preauth=fixture('PREAUTH');assert.equal((await preauth.handle()).status,401);assert.equal(preauth.staged,false)
 const f=fixture('ACTIVE',true),response=await f.handle();assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);assert.equal(f.committed,false)
})
test('trusted response cannot create ACTIVE or omit its validated bounded cookie',async()=>{
 for(const effect of [{data:{state:'ACTIVE'}},{data:{device:{id,created_at:new Date(now).toISOString(),expires_at:new Date(now+1000).toISOString()}}}]){
  const f=fixture();f.effect=effect;const response=await f.handle();assert.equal(response.status,503);assert.equal(f.committed,false);assert.equal(response.headers.get('set-cookie'),null)
 }
})
test('trusted selectors accept only opaque locators, never client owner tenant version or tokens',()=>{
 const schema=operations.find(o=>o.operationId==='revokeTrustedDevice')!.requestBody!.content['application/json'].schema
 assert.equal(valid(schema,{device_id:id}),true)
 for(const extra of [{tenant_id:id},{user_id:id},{session_id:id},{token:'t'.repeat(43)},{credential_version:'1'}])assert.equal(valid(schema,{device_id:id,...extra}),false)
})
