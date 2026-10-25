import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {operations,valid} from '../../lib/b1/contracts.ts'
import {createAuthHandler,names,digest,type Binding,type Transaction,type Backend,type Effect} from '../../lib/b1/service.ts'
const origin='https://fixture.invalid',csrf='c'.repeat(43),raw='s'.repeat(43),id=randomUUID()
const body={operation:'ROLE',role_id:id,label:'A label is not authority',expected_policy:'1',reason:'Explicit test reason'}
function fixture(kind:'ACTIVE'|'PREAUTH'='ACTIVE',commitFailure=false){
 let calls=0,committed=false,saved:unknown='unset'
 let effect:Effect={data:{changed:true}}
 const actor:Binding={kind,id,csrfDigest:digest(csrf),expiresAt:Date.now()+600000,sessionId:id,tenantId:id,userId:id,state:kind==='PREAUTH'?'PENDING_MFA':undefined}
 const tx:Transaction={async resolve(){return actor},async authorize(){assert.fail('the atomic SQL mutation owns authorization after its exclusive lock')},async stepUp(){assert.fail('the atomic SQL mutation enforces fresh step-up after its exclusive lock')},async auditFailure(){},async rateLimit(){return null},async reserve(_s,requestHash){return {replay:false,requestHash,oneTime:true,expiresAt:actor.expiresAt}},async discard(){},async complete(_s,_h,data,oneTime){assert.equal(oneTime,true);saved=data},async execute(){calls++;return effect}}
 const backend:Backend={async bootstrap(){},async transaction(work){const result=await work(tx);if(commitFailure)throw Error('private commit failure');committed=true;return result}}
 const handler=createAuthHandler(backend,origin)
 return {handle:(input:string=JSON.stringify(body))=>handler.handle(new Request(origin+'/auth/access',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':randomUUID(),Cookie:`${names.session}=${raw}; ${names.csrf}=${csrf}`},body:input}),'changeAccess'),get calls(){return calls},get committed(){return committed},get saved(){return saved},set effect(value:Effect){effect=value}}
}
test('AUTHZ HTTP accepts locators and CAS but rejects asserted tenant roles authorization and duplicate selectors',async()=>{
 const schema=operations.find(o=>o.operationId==='changeAccess')!.requestBody!.content['application/json'].schema
 assert.equal(valid(schema,body),true)
 for(const reason of [' ','\t','\n'])assert.equal(valid(schema,{...body,reason}),false)
 for(const extra of [{tenant_id:id},{actor_id:id},{is_admin:true},{allowed:true},{roles:['Super Admin']}])assert.equal(valid(schema,{...body,...extra}),false)
 const blank=fixture();assert.equal((await blank.handle(JSON.stringify({...body,reason:'  '}))).status,422);assert.equal(blank.calls,0);assert.equal(blank.committed,false)
 const f=fixture();assert.equal((await f.handle(JSON.stringify(body).replace('"ROLE"','"ROLE","operation":"ROLE"'))).status,400);assert.equal(f.calls,0)
})
test('AUTHZ PREAUTH cannot mutate and successful HTTP result remains one-time without cookies',async()=>{
 const pending=fixture('PREAUTH');assert.equal((await pending.handle()).status,401);assert.equal(pending.calls,0)
 const f=fixture(),response=await f.handle();assert.equal(response.status,200);assert.equal(f.committed,true);assert.equal(f.saved,null);assert.equal(response.headers.get('set-cookie'),null)
})
test('AUTHZ cannot transition or clear ACTIVE from a malformed adapter or claim success on failed COMMIT',async()=>{
 const f=fixture();f.effect={data:{changed:true},transition:{kind:'PREAUTH',token:raw,csrf,expiresAt:Date.now()+10000}}
 assert.equal((await f.handle()).status,503);assert.equal(f.committed,false)
 const failed=fixture('ACTIVE',true),r=await failed.handle();assert.equal(r.status,503);assert.equal(r.headers.get('set-cookie'),null)
})
