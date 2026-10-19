import test from 'node:test'
import assert from 'node:assert/strict'
import { withB1Custody, type B1CustodyInputs } from '../../lib/b1/custody-composition.ts'
import type { PrivateKeyReference } from '../../lib/b1/openbao-keys.ts'

const tenantId = '11111111-1111-4111-8111-111111111111'
const reference = (purpose: PrivateKeyReference['purpose']): PrivateKeyReference =>
  ({ tenantId, purpose, keyId: 'key-v1', version: 1 })
const references = {
  audit: reference('audit-hmac'), otp: reference('otp-hmac'),
  recovery: reference('recovery-hmac'), cursor: reference('cursor-hmac'),
}
function fixture() {
  let connects = 0, invocations = 0, zeroed = false
  const keys = new Map(Object.values(references).map((r,i) => [JSON.stringify(r), Buffer.alloc(32,i+1)]))
  const input: B1CustodyInputs = {
    pool: { async connect() { connects++; throw Error('No connection expected') } },
    references, lifetimeMs: 1000,
    custody: {
      async withKeys(refs, _lifetime, work) {
        invocations++
        assert.equal(refs.length,4)
        const borrow = <R>(r: PrivateKeyReference, fn: (key: Buffer) => R): R => {
          const key = keys.get(JSON.stringify(r))
          if (!key) throw Error('Not allowed')
          return fn(key)
        }
        try { return await work(borrow) }
        finally { for(const key of keys.values())key.fill(0);zeroed=true }
      },
    },
    dependencies(borrow) {
      return {
        factors: {
          dummyPasswordHash: 'synthetic-unused',
          auditKey: borrow(references.audit,k=>k),
          otpKey: borrow(references.otp,k=>k),
          recoveryKey: borrow(references.recovery,k=>k),
          async decryptTotp() { throw Error('No decrypt in test') },
        },
        cursorKey: borrow(references.cursor,k=>k),
        transport() { return {network:Buffer.alloc(32),device:Buffer.alloc(32)} },
        normalizeEmail(email) { return email.toLowerCase() },
      }
    },
  }
  return {input,stats:()=>({connects,invocations,zeroed})}
}

test('private B1 composition opens no connection until business operation and zeroes scope', async()=>{
  const f=fixture()
  const result=await withB1Custody(f.input,async backend=>{
    assert.equal(typeof backend.transaction,'function')
    assert.equal(typeof backend.bootstrap,'function')
    return 'isolated'
  })
  assert.equal(result,'isolated')
  assert.deepEqual(f.stats(),{connects:0,invocations:1,zeroed:true})
})
test('cross-tenant and wrong-purpose references deny before custody or PostgreSQL', async()=>{
  for(const bad of [
    {...references,otp:{...references.otp,tenantId:'22222222-2222-4222-8222-222222222222'}},
    {...references,audit:reference('totp-aead')},
  ]){
    const f=fixture()
    await assert.rejects(()=>withB1Custody({...f.input,references:bad},async()=>true),/AUTH_DEPENDENCY_UNAVAILABLE/)
    assert.deepEqual(f.stats(),{connects:0,invocations:0,zeroed:false})
  }
})
test('custody loss and mismatched key dependency cannot invoke backend',async()=>{
  const f=fixture();let invoked=false
  const bad={...f.input,dependencies:(borrow:Parameters<B1CustodyInputs['dependencies']>[0])=>{
    const deps=f.input.dependencies(borrow)
    return {...deps,cursorKey:Buffer.alloc(32,99)}
  }}
  await assert.rejects(()=>withB1Custody(bad,async()=>{invoked=true}),/AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.equal(invoked,false)
  assert.equal(f.stats().zeroed,true)
  const loss=fixture()
  await assert.rejects(()=>withB1Custody({...loss.input,custody:{async withKeys(){throw Error('PRIVATE_VAULT_ERROR')}}},async()=>{invoked=true}),e=>!String(e).includes('PRIVATE_VAULT_ERROR'))
  assert.equal(invoked,false)
})

test('malformed version and invalid custody key length fail closed before database work',async()=>{
  const f=fixture();let ran=false
  await assert.rejects(()=>withB1Custody({...f.input,references:{...references,otp:{...references.otp,version:0}}},async()=>{ran=true}),/AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.equal(ran,false)
  assert.equal(f.stats().invocations,0)
  const short=fixture()
  await assert.rejects(()=>withB1Custody({...short.input,dependencies:borrow=>{
    const deps=short.input.dependencies(borrow)
    const wrong=Buffer.alloc(12)
    return {...deps, factors:{...deps.factors,otpKey:wrong}}
  }},async()=>{ran=true}),/AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.equal(ran,false)
  assert.equal(short.stats().zeroed,true)
})

test('business failure never leaks private details and custody closes',async()=>{
  const f=fixture()
  await assert.rejects(
    ()=>withB1Custody(f.input,async()=>{throw new Error('SYNTHETIC_PRIVATE_PG_DETAILS')}),
    error=>error instanceof Error && error.message==='AUTH_DEPENDENCY_UNAVAILABLE' && !String(error).includes('SYNTHETIC_PRIVATE_PG_DETAILS'),
  )
  assert.deepEqual(f.stats(),{connects:0,invocations:1,zeroed:true})
})
test('private dependencies are not accepted when their HMAC buffers belong to wrong purposes',async()=>{
  const f=fixture()
  let ran=false
  await assert.rejects(()=>withB1Custody({...f.input,dependencies:borrow=>{
    const deps=f.input.dependencies(borrow)
    return {...deps,factors:{...deps.factors,auditKey:deps.factors.otpKey}}
  }},async()=>{ran=true}),/AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.equal(ran,false)
  assert.equal(f.stats().zeroed,true)
})

test('OpenBao custody is reacquired independently for each HTTP-facing operation',async()=>{
  let acquisitions=0
  const make=()=>fixture()
  const first=make()
  const custody=first.input.custody
  const wrapped={...first.input,custody:{
    async withKeys<T>(refs:readonly PrivateKeyReference[],lifetimeMs:number,work:Parameters<typeof custody.withKeys<T>>[2]):Promise<T>{
      acquisitions++
      return custody.withKeys(refs,lifetimeMs,work)
    },
  }}
  await withB1Custody(wrapped,async backend=>{assert.equal(typeof backend.transaction,'function')})
  await withB1Custody(wrapped,async backend=>{assert.equal(typeof backend.bootstrap,'function')})
  assert.equal(acquisitions,2,'A second operation must reacquire custody, not cache a backend or key')
  assert.equal(first.stats().connects,0)
})
test('custody rejection cannot proceed to PostgreSQL even when a mock pool is available',async()=>{
  const f=fixture()
  let connected=0, executed=false
  const bad={...f.input,
    pool:{async connect(){connected++;throw Error('synthetic PG endpoint')}},
    custody:{async withKeys<T>():Promise<T>{throw Error('synthetic OpenBao unreachable')}},
  }
  await assert.rejects(()=>withB1Custody(bad,async()=>{executed=true}),/AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.equal(connected,0)
  assert.equal(executed,false)
})

test('TOTP AEAD versions must be explicit, tenant scoped and nonduplicated',async()=>{
  const f=fixture()
  const aead:PrivateKeyReference={...references.audit,purpose:'totp-aead'}
  let executed=false
  await assert.rejects(()=>withB1Custody({...f.input,totpKeys:[aead,aead]},async()=>{executed=true}),/AUTH_DEPENDENCY_UNAVAILABLE/)
  await assert.rejects(()=>withB1Custody({...f.input,totpKeys:[{...aead,tenantId:'22222222-2222-4222-8222-222222222222'}]},async()=>{executed=true}),/AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.equal(executed,false)
  assert.equal(f.stats().invocations,0)
})
