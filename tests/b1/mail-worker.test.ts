import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { dispatchOneMail, type MailDeliveryDependencies, type MailOutcome } from '../../lib/b1/mail-worker.ts'
import { sealMailPayload } from '../../lib/b1/mail-envelope.ts'
const id = (n: number) => '00000000-0000-4000-8000-'+String(n).padStart(12,'0')
function fixture() {
  const key = randomBytes(32), events: string[] = []
  const context = {tenantId:id(1),userId:id(2),methodId:id(3),methodVersion:'1',recipientVersion:'1',outboxId:id(4),challengeId:id(5)}
  const message = {recipient:'verified@example.invalid',code:'012345',issuedAt:1000,expiresAt:301000}
  const claim = {context,ciphertext:sealMailPayload(message,key,'v1',context),keyVersion:'v1',expiresAt:301000}
  const deps: MailDeliveryDependencies = {
    now:()=>2000,
    withReadKey:async(t,v,work)=>{assert.equal(t,context.tenantId);assert.equal(v,'v1');return work(key)},
    store: {
      claim:async()=>{events.push('claim-commit');return claim},
      authorizeDispatch:async()=>{events.push('dispatch-commit');return true},
      finish:async(_c,_d,o)=>{events.push('finish-'+o);return true},
    },
    deliver:async(m,k)=>{events.push('send');assert.equal(m.code,message.code);assert.match(k,/^[0-9a-f]{64}$/);return 'ACCEPTED'},
  }
  return {key,events,claim,deps}
}
test('mail sends only after committed claim and dispatch; output redacted and owned bytes cleared',async()=>{
  const f=fixture();const result=await dispatchOneMail(f.deps)
  assert.deepEqual(result,{state:'FINISHED',outcome:'ACCEPTED'})
  assert.deepEqual(f.events,['claim-commit','dispatch-commit','send','finish-ACCEPTED'])
  assert.equal(f.claim.ciphertext.every(n=>n===0),true);assert.equal(JSON.stringify(result).includes('012345'),false);f.key.fill(0)
})
test('revoked/foreign/stale material is denied before transport; no accidental success on COMMIT failure',async()=>{
  for(const mode of ['revoked','commit-failed','foreign','expired','custody'] as const){
    const f=fixture()
    if(mode==='revoked')f.deps.store.authorizeDispatch=async()=>false
    if(mode==='commit-failed')f.deps.store.authorizeDispatch=async()=>{throw Error('secret-provider-detail')}
    if(mode==='foreign')f.claim.context.tenantId=id(9)
    if(mode==='expired')f.deps.now=()=>301000
    if(mode==='custody')f.deps.withReadKey=async()=>{throw Error('key-path')}
    if(mode==='revoked')assert.deepEqual(await dispatchOneMail(f.deps),{state:'CANCELLED'})
    else await assert.rejects(dispatchOneMail(f.deps),e=>e instanceof Error && !e.message.includes('secret-provider-detail'))
    assert.equal(f.events.includes('send'),false);f.key.fill(0)
  }
})
test('uncertain delivery/invalid replies quarantine; never silently retry provider exceptions',async()=>{
  for(const mode of ['throw','invalid','UNKNOWN'] as const){
    const f=fixture();let calls=0
    f.deps.deliver=async()=>{calls++;if(mode==='throw')throw Error('private-recipient');return mode==='invalid' ? 'unsafe' as MailOutcome:'UNKNOWN'}
    assert.deepEqual(await dispatchOneMail(f.deps),{state:'FINISHED',outcome:'UNKNOWN'})
    assert.equal(calls,1);assert.equal(f.events.at(-1),'finish-UNKNOWN');f.key.fill(0)
  }
})
test('failed finish COMMIT returns unconfirmed, not acceptance or a second send',async()=>{
  const f=fixture();f.deps.store.finish=async()=>{throw Error('lost-connection')}
  assert.deepEqual(await dispatchOneMail(f.deps),{state:'UNCONFIRMED'})
  assert.equal(f.events.filter(e=>e==='send').length,1);f.key.fill(0)
})
test('expiry during committed dispatch prevents transport; definitive transient/permanent outcomes retained',async()=>{
  const f=fixture();let now=2000;f.deps.now=()=>now
  f.deps.store.authorizeDispatch=async()=>{now=301000;return true}
  assert.deepEqual(await dispatchOneMail(f.deps),{state:'FINISHED',outcome:'PERMANENT'})
  assert.equal(f.events.includes('send'),false);f.key.fill(0)
  for(const outcome of ['TRANSIENT','PERMANENT'] as const){const g=fixture();g.deps.deliver=async()=>outcome
    assert.deepEqual(await dispatchOneMail(g.deps),{state:'FINISHED',outcome});g.key.fill(0)}
})
