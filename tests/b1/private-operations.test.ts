import test from 'node:test'
import assert from 'node:assert/strict'
import { createPrivateSessionOperations } from '../../lib/b1/private-sessions.ts'
import { createPrivateOtpOperations } from '../../lib/b1/private-otp.ts'
import { AuthError, closedBackend } from '../../lib/b1/service.ts'
import type { IdentityConnection } from '../../lib/b1/pg-identity-driver.ts'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const U = '00000000-0000-4000-8000-000000000003'
const S = '00000000-0000-4000-8000-000000000004'
const T = '00000000-0000-4000-8000-000000000005'
const Q = '00000000-0000-4000-8000-000000000006'
const token = 'a'.repeat(43), now = '2030-01-01T00:00:00.000Z'
const idem = { key: 'idempotency-key-123', requestHash: 'c'.repeat(64) }
const unavailable = (error: unknown) => error instanceof AuthError && error.status === 503 && error.cause === undefined
type Call = { sql: string; values: unknown[] }
function fixture(answer: (name: string, values: unknown[]) => unknown = () => null) {
  const calls: Call[] = [], released: boolean[] = []
  const client: IdentityConnection = {
    async query(sql, values = []) {
      calls.push({ sql, values })
      if (!sql.startsWith('SELECT')) return {}
      const name = /(?:auth_api|identity_private)\.([a-z_]+)/.exec(sql)?.[1] ?? ''
      const value = answer(name, values)
      return sql.startsWith('SELECT *') ? { rows: value } : { rows: [{ value }] }
    },
    release(discard = false) { released.push(discard) },
  }
  let connects = 0
  const pool = { async connect() { connects++; return client } }
  return { pool, client, calls, released, get connects() { return connects } }
}
const session = { id: S, tenant_id: A, user_id: U, created_at: now, last_activity_at: now,
  absolute_expires_at: now, device_label: null, browser_label: 'browser', is_current: true }

test('session identity/listing use the same connection and reject foreign tenant rows', async () => {
  for (const tenant of [A, B]) {
    const f = fixture(name => {
      if (name === 'verified_tenant') return A
      if (name === 'current_identity') return [{ id: U, tenant_id: tenant, display_name: 'User', email: 'user@example.invalid' }]
      return null
    })
    const action = createPrivateSessionOperations(f.pool).currentIdentity(token)
    if (tenant === A) assert.equal((await action).tenant_id, A)
    else await assert.rejects(action, unavailable)
    assert.equal(f.connects, 1)
    assert.equal(f.calls.at(-1)?.sql, tenant === A ? 'COMMIT' : 'ROLLBACK')
  }
  const f = fixture(name => name === 'verified_tenant' ? A : name === 'own_sessions' ? [session] : null)
  assert.equal((await createPrivateSessionOperations(f.pool).listSessions(token, { limit: 50, beforeTime: null, beforeId: null }))[0].user_id, U)
  assert.deepEqual(f.calls.find(c => c.sql.includes('own_sessions'))?.values, [50, null, null])
})

test('self revocation reserves, mutates/audits in broker, completes and commits together', async () => {
  const f = fixture(name => name === 'verified_tenant' ? A : name === 'revoke_own_session' ? 1 : null)
  assert.deepEqual(await createPrivateSessionOperations(f.pool).revokeSelf(token, T, idem, Q), { revoked_count: 1 })
  assert.deepEqual(f.calls.filter(c => c.sql.startsWith('SELECT')).map(c => /(?:auth_api|identity_private)\.([a-z_]+)/.exec(c.sql)?.[1]),
    ['begin_verified_context', 'verified_tenant', 'reserve_idempotency', 'revoke_own_session', 'complete_idempotency'])
  assert.equal(f.calls.at(-1)?.sql, 'COMMIT')
  const completion = f.calls.find(c => c.sql.includes('complete_idempotency'))!
  assert.deepEqual(JSON.parse(String(completion.values[2])), { tenant_id: A, operation: 'revokeSelfSession', target: T, revoked_count: 1 })
})

test('safe idempotent replay skips effect; foreign replay and commit failures never return success', async () => {
  for (const tenant of [A, B]) {
    const f = fixture(name => name === 'verified_tenant' ? A : name === 'reserve_idempotency' ?
      { tenant_id: tenant, operation: 'revokeSelfSession', target: T, revoked_count: 1 } : null)
    const work = createPrivateSessionOperations(f.pool).revokeSelf(token, T, idem, Q)
    if (tenant === A) assert.deepEqual(await work, { revoked_count: 1 })
    else await assert.rejects(work, unavailable)
    assert.equal(f.calls.some(c => c.sql.includes('revoke_own_session')), false)
  }
  const f = fixture(name => name === 'verified_tenant' ? A : name === 'revoke_own_session' ? 1 : null)
  const original = f.client.query
  f.client.query = async (sql, values) => {
    if (sql === 'COMMIT') throw Error('connection lost')
    return original(sql, values)
  }
  await assert.rejects(createPrivateSessionOperations(f.pool).revokeSelf(token, T, idem, Q), unavailable)
  assert.deepEqual(f.released, [true])
})

test('revoked context/foreign own-session target rolls back without fallback', async () => {
  for (const failure of ['INVALID_SESSION', 'RESOURCE_NOT_FOUND']) {
    const f = fixture(name => {
      if (name === 'begin_verified_context' && failure === 'INVALID_SESSION') throw Object.assign(new Error(failure), { code: '42501' })
      if (name === 'verified_tenant') return A
      if (name === 'revoke_own_session') throw Object.assign(new Error(failure), { code: 'P0002' })
      return null
    })
    await assert.rejects(createPrivateSessionOperations(f.pool).revokeSelf(token, B, idem, Q),
      (e: unknown) => e instanceof AuthError && e.status === (failure === 'INVALID_SESSION' ? 401 : 404))
    assert.equal(f.calls.at(-1)?.sql, 'ROLLBACK')
  }
  await assert.rejects(closedBackend.transaction(async () => true), unavailable)
})

test('EMAIL_OTP uses HMAC digest only; false commits attempts and errors roll back', async () => {
  for (const outcome of [true, false, 'error'] as const) {
    const proof = Buffer.alloc(32, 7)
    const f = fixture((name, values) => {
      if (name === 'preauth_summary') return { state: 'PENDING_MFA', expires_at: now }
      if (name === 'challenge_material') return [{ kind: 'EMAIL_OTP' }]
      if (name === 'verify_challenge') {
        assert.equal(values[0], token); assert.equal(values[1], T)
        assert.deepEqual(values[2], Buffer.alloc(32, 7)); assert.equal(values[3], null)
        if (outcome === 'error') throw Error('private material')
        return outcome
      }
      return null
    })
    const otp = createPrivateOtpOperations(f.pool, async (code, scope) => {
      assert.equal(code, '123456'); assert.equal(scope.mode, 'PREAUTH'); assert.equal(scope.bindingDigest.length, 64)
      return proof
    })
    const work = otp.verifyEmailOtp(token, 'PREAUTH', T, '123456', Q)
    if (outcome === 'error') await assert.rejects(work, unavailable)
    else {
      const result = await work
      if (outcome) assert.deepEqual(result, { verified: true })
      else assert.ok(result instanceof AuthError && result.status === 401)
    }
    assert.ok(proof.every(n => n === 0))
    assert.equal(f.calls.at(-1)?.sql, outcome === 'error' ? 'ROLLBACK' : 'COMMIT')
    assert.equal(f.calls.some(c => c.values.includes('123456')), false)
  }
})

test('simulated concurrent OTP consumers produce exactly one success, no session issuance', async () => {
  // A test double models the broker's atomic ISSUED -> VERIFIED transition, not real PG locks.
  let issued = true
  const f = fixture(name => {
    if (name === 'challenge_material') return [{ kind: 'EMAIL_OTP' }]
    if (name === 'verify_challenge') { const ok = issued; issued = false; return ok }
    return null
  })
  const pool = { async connect() { return { query: f.client.query, release() {} } } }
  const otp = createPrivateOtpOperations(pool, async () => Buffer.alloc(32, 7))
  const results = await Promise.all([otp.verifyEmailOtp(token, 'PREAUTH', T, '123456', Q), otp.verifyEmailOtp(token, 'PREAUTH', T, '123456', Q)])
  assert.equal(results.filter(r => !(r instanceof AuthError)).length, 1)
  assert.equal(results.filter(r => r instanceof AuthError).length, 1)
  assert.equal(f.calls.some(c => c.sql.includes('issue_active_session')), false)
})

test('simulated bulk revocation preserves current session, another user and tenant B', async () => {
  const records = [
    { tenant: A, user: U, id: S, active: true },
    { tenant: A, user: U, id: T, active: true },
    { tenant: A, user: B, id: Q, active: true },
    { tenant: B, user: U, id: Q, active: true },
  ]
  const f = fixture((name, values) => {
    if (name === 'verified_tenant') return A
    if (name === 'revoke_other_own_sessions') {
      assert.deepEqual(values, [Q]) // only correlation; no tenant/user selector supplied by caller
      let n = 0
      for (const row of records) if (row.tenant === A && row.user === U && row.id !== S && row.active) { row.active = false; n++ }
      return n
    }
    return null
  })
  assert.deepEqual(await createPrivateSessionOperations(f.pool).revokeOthers(token, idem, Q), { revoked_count: 1 })
  assert.deepEqual(records.map(r => r.active), [true, false, true, true])
  assert.equal(f.calls.at(-1)?.sql, 'COMMIT')
})

test('simulated completion failure rolls back effect, audit and idempotency as one unit', async () => {
  const persisted = { revoked: false, audit: 0, reservation: false }
  let staged = { ...persisted }
  const f = fixture(name => {
    if (name === 'verified_tenant') return A
    if (name === 'reserve_idempotency') { staged.reservation = true; return null }
    if (name === 'revoke_own_session') { staged.revoked = true; staged.audit++; return 1 }
    if (name === 'complete_idempotency') throw Error('failure before completion')
    return null
  })
  const original = f.client.query
  f.client.query = async (sql, values) => {
    if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') staged = { ...persisted }
    if (sql === 'COMMIT') Object.assign(persisted, staged)
    if (sql === 'ROLLBACK') staged = { ...persisted }
    return original(sql, values)
  }
  await assert.rejects(createPrivateSessionOperations(f.pool).revokeSelf(token, T, idem, Q), unavailable)
  assert.deepEqual(persisted, { revoked: false, audit: 0, reservation: false })
  assert.deepEqual(staged, persisted)
})
