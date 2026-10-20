import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { createEmailCeremony } from '../../lib/b1/email-ceremony.ts'
import type { V4Broker } from '../../lib/b1/v4-broker.ts'
import { contract, operations, canonical } from '../../lib/b1/contracts.ts'
import original from '../../lib/b1/openapi.json' with { type: 'json' }
import { type Binding, createAuthHandler, closedBackend } from '../../lib/b1/service.ts'

test('EMAIL adds four operations without changing any approved V4/H1-H3 operation or schema', () => {
  for (const [path, value] of Object.entries(original.paths)) assert.equal(canonical(contract.paths[path]), canonical(value))
  for (const [key, value] of Object.entries(original.components.schemas)) assert.equal(canonical(contract.components.schemas[key]), canonical(value))
  assert.equal(operations.length, Object.values(original.paths).reduce((n,v) => n+Object.keys(v).length,0)+20)
  const resend=operations.find(op=>op.operationId==='resendEmailEnrollment')!
  assert.equal(resend['x-authentication-state'],'ACTIVE_STEP_UP_OR_ENROLLMENT');assert.equal(resend['x-rule'],'B1-SELF-05')
})

function setup(activeEmail = false) {
  const now = Date.now(), binding: Binding = { kind: 'PREAUTH', state: 'ENROLLMENT_REQUIRED', id: randomUUID(),
    tenantId: randomUUID(), userId: randomUUID(), expiresAt: now+600000, csrfDigest:'0'.repeat(64) }
  const calls: {name:string;args:unknown[]}[] = [], reference = new Map<string,unknown>()
  let validProof = true
  const broker = { async call(name:string,args:unknown[]) {
    calls.push({name,args})
    if(name==='mailMaterial')return { bindingId:binding.id,tenantId:binding.tenantId,userId:binding.userId,
      recipient:'private@fixture.invalid',recipientVersion:'7',recipientExpiresAt:new Date(now+700000).toISOString(),
      expiresAt:new Date(binding.expiresAt).toISOString(),enabledMethods:activeEmail ? [{id:randomUUID(),kind:'EMAIL_OTP',version:'2'},{id:randomUUID(),kind:'EMAIL_OTP',version:'3'}] : [] }
    if(name==='beginEmail')return args[1]
    if(name==='issueEmailEnrollment' || name==='issueEmail')return args[4]
    if(name==='reserveOwned'){const key=(args[2] as Buffer).toString('hex');return {replay:reference.has(key),requestHash:(args[3] as Buffer).toString('hex'),data:reference.get(key)}}
    if(name==='completeOwned'){reference.set((args[2] as Buffer).toString('hex'),JSON.parse(String(args[4])));return true}
    if(name==='consumeEmail')return validProof
    throw Error('UNEXPECTED_TEST_OPERATION')
  } } as unknown as V4Broker
  const mail=createEmailCeremony(broker,{async withWriteKey(_tenant,work){return work(randomBytes(32),'test-key')}},randomBytes(32),randomUUID(),()=>now)
  return {mail,binding,calls,reference,fail(){validProof=false}}
}
test('EMAIL queues authenticated ciphertext and persists only private non-proof routing references', async () => {
  const f=setup(), cookie='a'.repeat(43)
  const result=await f.mail.issue(cookie,f.binding,'ENROLLMENT')
  assert.deepEqual(Object.keys(result).sort(),['allowed_methods','challenge_id','expires_at'])
  const serialized=JSON.stringify([...f.reference.values()])
  assert.equal(/private@|proof|ciphertext|recipient":|cookie/.test(serialized),false)
  const consumed=await f.mail.verify(cookie,f.binding,result.challenge_id,'123456',true)
  assert.equal(consumed,true)
  const call=f.calls.find(c=>c.name==='consumeEmail')!
  assert.equal(call.args[3],'1');assert.equal(call.args[4],'7')
})
test('EMAIL unknown challenge, wrong ceremony purpose and missing binding fail closed', async () => {
  const f=setup(), cookie='a'.repeat(43)
  await assert.rejects(f.mail.verify(cookie,f.binding,randomUUID(),'123456',true))
  const result=await f.mail.issue(cookie,f.binding,'ENROLLMENT')
  await assert.rejects(f.mail.verify(cookie,f.binding,result.challenge_id,'123456',false))
  await assert.rejects(f.mail.verify(cookie,{...f.binding,tenantId:undefined},result.challenge_id,'123456',true))
  assert.equal(f.calls.some(c=>c.name==='consumeEmail'),false)
})
test('EMAIL failed native consumption is never promoted to success', async () => {
  const f=setup(), cookie='a'.repeat(43), result=await f.mail.issue(cookie,f.binding,'ENROLLMENT')
  f.fail();assert.equal(await f.mail.verify(cookie,f.binding,result.challenge_id,'123456',true),false)
})

test('EMAIL duplicate JSON selectors reject before dependency access with a safe HTTP error', async () => {
  const origin='https://fixture.invalid', handler=createAuthHandler(closedBackend,origin)
  const a=randomUUID(),b=randomUUID()
  const response=await handler.handle(new Request(origin+'/mfa/email/confirm',{method:'POST',headers:{'Content-Type':'application/json'},
    body:'{"challenge_id":"'+a+'","challenge_id":"'+b+'","proof":"123456"}'}),'confirmEmail')
  assert.equal(response.status,400)
  assert.equal(response.headers.get('set-cookie'),null)
  assert.equal((await response.text()).includes('123456'),false)
})

test('multiple enabled EMAIL methods use a trusted stable locator without a client selector or invented limit', async () => {
  const f=setup(true)
  const result=await f.mail.issue('a'.repeat(43),{...f.binding,state:'PENDING_MFA'},'LOGIN')
  assert.deepEqual(result.allowed_methods,['EMAIL_OTP'])
  const call=f.calls.find(c=>c.name==='issueEmail')!
  assert.equal(typeof call.args[1],'string')
})
