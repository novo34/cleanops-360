import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createAuthHandler, digest, names, type Backend, type Binding, type Transaction } from '../../lib/b1/service.ts'
import { operations, valid } from '../../lib/b1/contracts.ts'

test('recovery HTTP accepts only a recovery code and never client identity or versions',()=>{
  const op=operations.find(o=>o.operationId==='recoverMfa')!,schema=op.requestBody!.content['application/json'].schema
  assert.equal(valid(schema,{recovery_code:'A'.repeat(26)}),true)
  for(const extra of [{tenantId:randomUUID()},{userId:randomUUID()},{credentialVersion:'1'},{password_verified:true}])
    assert.equal(valid(schema,{recovery_code:'A'.repeat(26),...extra}),false)
  assert.equal(valid(schema,{recovery_code:'123456'}),false)
})
test('malformed private recovery adapter cannot emit ACTIVE or cookies',async()=>{
  const origin='https://fixture.invalid',raw='a'.repeat(43),csrf='b'.repeat(43),id=randomUUID(),tenant=randomUUID(),user=randomUUID()
  const binding:Binding={kind:'PREAUTH',state:'PENDING_MFA',id,tenantId:tenant,userId:user,csrfDigest:digest(csrf),expiresAt:Date.now()+600000}
  let completed=0,committed=0
  const tx:Transaction={async resolve(){return binding},async authorize(){return true},async stepUp(){return true},async rateLimit(){return null},
    async reserve(_scope,requestHash){return {replay:false,requestHash,oneTime:true,expiresAt:binding.expiresAt}},async discard(){},async complete(){completed++},
    async execute(){return {data:{state:'ACTIVE',session_id:randomUUID(),tenant_id:tenant,absolute_expires_at:new Date(Date.now()+600000).toISOString()},transition:{kind:'ACTIVE',token:'c'.repeat(43),csrf:'d'.repeat(43),expiresAt:Date.now()+300000}}}}
  const backend:Backend={async bootstrap(){},async transaction(work){const result=await work(tx);committed++;return result}}
  const response=await createAuthHandler(backend,origin).handle(new Request(origin+'/auth/recovery/consume',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin','X-CSRF-Token':csrf,'Idempotency-Key':randomUUID(),Cookie:names.preauth+'='+raw+'; '+names.csrf+'='+csrf},body:JSON.stringify({recovery_code:'A'.repeat(26)})}),'recoverMfa')
  assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);assert.equal(completed,0);assert.equal(committed,0)
})
