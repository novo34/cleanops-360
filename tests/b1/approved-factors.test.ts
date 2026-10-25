import test from 'node:test'
import assert from 'node:assert/strict'
import { hash, argon2id } from 'argon2'
import { TOTP, Secret } from 'otpauth'
import { createApprovedFactors, type CredentialProof, type PrivateFactorKeys } from '../../lib/b1/approved-factors.ts'
import { AuthError, type Binding } from '../../lib/b1/service.ts'
import type { V4Broker, BrokerArgs } from '../../lib/b1/v4-broker.ts'

const P = '00000000-0000-4000-8000-000000000001', T = '00000000-0000-4000-8000-000000000002'
const U = '00000000-0000-4000-8000-000000000003', M = '00000000-0000-4000-8000-000000000004'
const C = '00000000-0000-4000-8000-000000000005', S = '00000000-0000-4000-8000-000000000006'
const now = 1_700_000_010_000, password = 'Correcta contraseña 123'
const cost = { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }
const denied = (v: unknown) => v instanceof AuthError && v.status === 401
const unavailable = (v: unknown) => v instanceof AuthError && v.status === 503
function fixture(answer: (name: keyof BrokerArgs, args: unknown[]) => unknown) {
  const calls: { name: keyof BrokerArgs; args: unknown[] }[] = []
  const broker: V4Broker = {async selectionUnit(){throw Error("UNEXPECTED_SELECTION_UNIT")}, async call(name, args) { calls.push({ name, args }); return answer(name, args) as never } }
  return { broker, calls }
}
async function keys(): Promise<PrivateFactorKeys> {
  return {
    dummyPasswordHash: await hash('dummy password never an identity', cost), auditKey: Buffer.alloc(32, 1), otpKey: Buffer.alloc(32, 2), recoveryKey: Buffer.alloc(32, 3),
    async decryptTotp() { return new TextEncoder().encode('12345678901234567890') },
  }
}

test('real Argon2id rehash and version-bound preauth use unforgeable one-shot transaction proof', async () => {
  let stored = await hash(password, { ...cost, timeCost: 2 })
  const f = fixture((name, args) => {
    if (name === 'credentialLocked') return [{ principal_id: P, password_hash: stored, credential_version: '7' }]
    if (name === 'rehashCas') { assert.equal(args[1], '7'); assert.equal(args[2], stored); stored = String(args[3]); return true }
    if (name === 'preauthVerified') { assert.equal(args[2], '7'); assert.equal(args[3], stored); return C }
    return undefined
  })
  const factors = createApprovedFactors(f.broker, await keys(), C, () => now)
  const proof = await factors.password('owner@example.invalid', password)
  assert.ok(!(proof instanceof AuthError))
  assert.equal(await factors.preauth(proof, T, Buffer.alloc(32), Buffer.alloc(32)), C)
  await assert.rejects(factors.preauth(proof, T, Buffer.alloc(32), Buffer.alloc(32)), unavailable)
  await assert.rejects(factors.preauth({ principalId: P, version: '7' } as CredentialProof, T, Buffer.alloc(32), Buffer.alloc(32)), unavailable)
  assert.match(stored, /m=65536,t=3,p=1/)
})

test('bad or absent password proof commits only a pseudonymous denial; credential CAS race throws', async () => {
  const stored = await hash(password, cost), k = await keys()
  for (const absent of [false, true]) {
    const f = fixture(name => name === 'credentialLocked' ? absent ? [] : [{ principal_id: P, password_hash: stored, credential_version: '7' }] : undefined)
    const result = await createApprovedFactors(f.broker, k, C).password('owner@example.invalid', 'wrong password 123')
    assert.ok(denied(result))
    const event = f.calls.find(c => c.name === 'securityEvent')!
    assert.equal((event.args[1] as Buffer).length, 32)
    assert.equal(f.calls.some(c => c.name === 'preauthVerified'), false)
  }
  const legacy = await hash(password, { ...cost, timeCost: 2 })
  const f = fixture(name => name === 'credentialLocked' ? [{ principal_id: P, password_hash: legacy, credential_version: '7' }] : name === 'rehashCas' ? false : undefined)
  await assert.rejects(createApprovedFactors(f.broker, k, C).password('owner@example.invalid', password), unavailable)
})

test('real TOTP passes exact method version/counter CAS, replays and foreign tenants are denied', async () => {
  const k = await keys()
  const actor: Binding = { kind: 'ACTIVE', id: S, sessionId: S, tenantId: T, userId: U, csrfDigest: 'a'.repeat(64), expiresAt: now + 60_000 }
  let counter = null as number | null, tenant = T
  const f = fixture((name, args) => {
    if (name === 'authorization') return [{ allowed: true, step_up: true }]
    if (name === 'totpMaterial') return { session_id: S, grant_key: 'B1-SELF-05', resource_id: null, binding: { tenantId: tenant, userId: U, methodId: M, ceremonyId: C, purpose: 'STEP_UP' },
      version: '3', lastCounter: counter, expiresAt: now + 60_000, algorithm: 'SHA1', secret_ciphertext: Buffer.from('encrypted').toString('base64'), key_version: 'key-1' }
    if (name === 'consumeTotp') {
      assert.equal(args[3], '3')
      if (args[5] === null || args[4] !== counter || (counter !== null && Number(args[5]) <= counter)) return false
      counter = Number(args[5]); return true
    }
    return undefined
  })
  const secret = Secret.fromUTF8('12345678901234567890')
  const code = TOTP.generate({ secret, period: 30, digits: 6, algorithm: 'SHA1', timestamp: now })
  const factors = createApprovedFactors(f.broker, k, C, () => now)
  assert.deepEqual(await factors.totp(code, actor, null, C, 'STEP_UP'), { verified: true })
  assert.ok(denied(await factors.totp(code, actor, null, C, 'STEP_UP')))
  tenant = P
  assert.ok(denied(await factors.totp(code, actor, null, C, 'STEP_UP')))
  assert.equal(f.calls.filter(c => c.name === 'consumeTotp' && c.args[5] !== null).length, 1)
})

test('invalid TOTP records one failed proof, secret-provider failure aborts without attestation', async () => {
  const actor: Binding = { kind: 'ACTIVE', id: S, sessionId: S, tenantId: T, userId: U, csrfDigest: 'a'.repeat(64), expiresAt: now + 60_000 }
  const f = fixture(name => name === 'totpMaterial' ? {
    session_id: S, grant_key: 'B1-SELF-05', resource_id: null,
    binding: { tenantId: T, userId: U, methodId: M, ceremonyId: C, purpose: 'STEP_UP' }, version: '3', lastCounter: null,
    expiresAt: now + 60_000, algorithm: 'SHA1', secret_ciphertext: Buffer.from('encrypted').toString('base64'), key_version: 'key-1',
  } : name === 'consumeTotp' ? false : name === 'authorization' ? [{ allowed: true, step_up: true }] : undefined)
  const k = await keys(), factors = createApprovedFactors(f.broker, k, C, () => now)
  assert.ok(denied(await factors.totp('bad', actor, null, C, 'STEP_UP')))
  assert.equal(f.calls.filter(c => c.name === 'consumeTotp').length, 1)
  assert.equal(f.calls.find(c => c.name === 'consumeTotp')!.args[5], null)
  k.decryptTotp = async () => { throw Error('key material must not escape') }
  await assert.rejects(factors.totp('123456', actor, null, C, 'STEP_UP'), unavailable)
  assert.equal(f.calls.filter(c => c.name === 'consumeTotp').length, 1)
})

test('step-up revalidates server grant/session authorization before decrypt or counter CAS', async () => {
 const actor: Binding = { kind: 'ACTIVE', id: S, sessionId: S, tenantId: T, userId: U, csrfDigest: 'a'.repeat(64), expiresAt: now + 60_000 }
 const f = fixture(name => name === 'totpMaterial' ? {
  binding: { tenantId: T, userId: U, methodId: M, ceremonyId: C, purpose: 'STEP_UP' },
  session_id: S, grant_key: 'B1-SELF-08', resource_id: P, version: '3', lastCounter: null,
  expiresAt: now + 60_000, algorithm: 'SHA1', secret_ciphertext: Buffer.from('encrypted').toString('base64'), key_version: 'key-1',
 } : name === 'authorization' ? [{ allowed: false, step_up: false }] : undefined)
 const k = await keys()
 let decrypts = 0
 k.decryptTotp = async () => { decrypts++; throw Error('must never decrypt') }
 await assert.rejects(createApprovedFactors(f.broker, k, C, () => now).totp('123456', actor, null, C, 'STEP_UP'),
  (e: unknown) => e instanceof AuthError && e.status === 403)
 assert.equal(decrypts, 0)
 assert.deepEqual(f.calls.find(c => c.name === 'authorization')!.args, [null, 'B1-SELF-08', P])
 assert.equal(f.calls.some(c => c.name === 'consumeTotp'), false)
})

test('PostgreSQL base64 wrapping preserves ciphertext bytes; malformed whitespace never reaches decryption or CAS', async () => {
  const actor: Binding = { kind: 'PREAUTH', id: S, state: 'PENDING_MFA', tenantId: T, userId: U, csrfDigest: 'a'.repeat(64), expiresAt: now + 60_000 }
  const k = await keys()
  const secret = Secret.fromUTF8('12345678901234567890')
  const code = TOTP.generate({ secret, period: 30, digits: 6, algorithm: 'SHA1', timestamp: now })
  for (const length of [57, 61, 114]) {
    const ciphertext = Buffer.alloc(length, 3), canonical = ciphertext.toString('base64')
    const wrapped = canonical.match(/.{1,76}/g)!.join('\n')
    const variants = [canonical, wrapped, ...(canonical.length % 76 === 0 ? [wrapped + '\n'] : [])]
    for (const encoded of [...variants, canonical.slice(0, 5) + '\n' + canonical.slice(5), wrapped + ' ']) {
      let decrypts = 0, consumes = 0
      const f = fixture(name => {
        if (name === 'totpMaterial') return { binding: { tenantId: T, userId: U, methodId: M, ceremonyId: C, purpose: 'LOGIN' },
          version: '1', lastCounter: null, expiresAt: now + 60_000, algorithm: 'SHA1', secret_ciphertext: encoded, key_version: 'fixture' }
        if (name === 'consumeTotp') { consumes++; return true }
        return undefined
      })
      k.decryptTotp = async bytes => { decrypts++; assert.deepEqual(bytes, ciphertext); return new TextEncoder().encode('12345678901234567890') }
      const proof = createApprovedFactors(f.broker, k, C, () => now).totp(code, actor, 'synthetic-preauth', C, 'LOGIN')
      if (variants.includes(encoded)) {
        assert.deepEqual(await proof, { verified: true }); assert.equal(decrypts, 1); assert.equal(consumes, 1)
      } else {
        await assert.rejects(proof, unavailable); assert.equal(decrypts, 0); assert.equal(consumes, 0)
      }
    }
  }
})
