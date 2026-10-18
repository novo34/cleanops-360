import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {operations,valid} from '../../lib/b1/contracts.ts'
import {createAuthHandler,digest,names,type Binding,type Backend,type Transaction} from '../../lib/b1/service.ts'
test('reset HTTP accepts receipt and secrets only, never client identity or policy authority',()=>{
 const schema=operations.find(o=>o.operationId==='resetPassword')!.requestBody!.content['application/json'].schema
 const input={ticket:'a'.repeat(43),recovery_code:'A'.repeat(26),new_password:'private replacement'}
 assert.equal(valid(schema,input),true)
 for(const extra of [{tenantId:randomUUID()},{userId:randomUUID()},{credentialVersion:'2'},{requiresRecovery:false},{password_verified:true}])assert.equal(valid(schema,{...input,...extra}),false)
})
test('reset refuses an adapter attempting ACTIVE or an early credential cookie',async()=>{
 const origin='https://fixture.invalid',csrf='c'.repeat(43),raw='b'.repeat(43)
 const actor:Binding={kind:'BOOTSTRAP',id:digest(raw),csrfDigest:digest(csrf),expiresAt:Date.now()+600000}
 const tx:Transaction={async resolve(){return actor},async authorize(){return true},async stepUp(){return true},async rateLimit(){return null},async reserve(_s,requestHash){return {replay:false,requestHash,oneTime:true,expiresAt:actor.expiresAt}},async discard(){},async complete(){assert.fail('must not complete')},async execute(){return {data:{state:'ACTIVE'},transition:{kind:'ACTIVE',token:'s'.repeat(43),csrf:'d'.repeat(43),expiresAt:actor.expiresAt}}}}
 let committed=false
 const backend:Backend={async bootstrap(){},async transaction(work){const result=await work(tx);committed=true;return result}}
 const result=await createAuthHandler(backend,origin).handle(new Request(origin+'/auth/password/reset',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':randomUUID(),Cookie:`${names.preauth}=${raw}; ${names.csrf}=${csrf}`},body:JSON.stringify({ticket:'a'.repeat(43),new_password:'private replacement'})}),'resetPassword')
 assert.equal(result.status,503);assert.equal(committed,false);assert.equal(result.headers.get('set-cookie'),null)
})
