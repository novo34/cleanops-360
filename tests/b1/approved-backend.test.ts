import test from 'node:test'
import assert from 'node:assert/strict'
import { hash, argon2id } from 'argon2'
import { TOTP, Secret } from 'otpauth'
import { createApprovedPrivateBackend, type ApprovedBackendDependencies } from '../../lib/b1/approved-backend.ts'
import { AuthError, createAuthHandler, names, digest, closedBackend, type Binding } from '../../lib/b1/service.ts'
import { canonical } from '../../lib/b1/contracts.ts'
import type { IdentityConnection } from '../../lib/b1/pg-identity-driver.ts'

const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002'
const U = '00000000-0000-4000-8000-000000000003', S = '00000000-0000-4000-8000-000000000004'
const C = '00000000-0000-4000-8000-000000000005', M = '00000000-0000-4000-8000-000000000006'
const now = 1_700_000_010_000, absolute = now + 86_400_000
const raw = 'a'.repeat(43), csrf = 'b'.repeat(43), origin = 'https://cleanops.example'
const dummy = hash('dummy proof never authenticates', { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })
const unavailable = (e: unknown) => e instanceof AuthError && e.status === 503
type Options = { foreign?: boolean; allowed?: boolean; stepUp?: boolean; commitFailure?: boolean }
async function fixture(options: Options = {}) {
  const calls: { name: string; values: unknown[] }[] = [], releases: boolean[] = []
  const committed = { revoked: 0, completed: 0, discarded: 0, failures: 0 }
  let staged = { ...committed }, counter = null as number | null
  const binding = { kind: 'ACTIVE', id: S, sessionId: S, tenantId: A, userId: U, csrfDigest: digest(csrf), expiresAt: now + 30_000 }
  let connects = 0
  const connection: IdentityConnection = {
    async query(sql, values = []) {
      const name = /auth_api\.([a-z_]+)/.exec(sql)?.[1] ?? sql
      calls.push({ name, values })
      if (sql.startsWith('BEGIN')) { staged = { ...committed }; return {} }
      if (sql === 'ROLLBACK') { staged = { ...committed }; return {} }
      if (sql === 'COMMIT') { if (options.commitFailure) throw Error('private commit failure'); Object.assign(committed, staged); return {} }
      let value: unknown = null
      if (name === 'resolve_binding') value = binding
      if (name === 'active_summary') value = { state: 'ACTIVE', session_id: S, tenant_id: A, absolute_expires_at: new Date(absolute).toISOString() }
      if (name === 'binding_authorization') return { rows: [{ allowed: options.allowed ?? true, step_up: options.stepUp ?? true }] }
      if (name === 'current_identity') return { rows: [{ id: U, tenant_id: options.foreign ? B : A, display_name: 'User', email: 'user@example.invalid' }] }
      if (name === 'memberships') return { rows: [{ id: A, name: 'A' }, { id: B, name: 'B' }] }
      if (name === 'own_sessions') return { rows: [{ id: S, tenant_id: options.foreign ? B : A, user_id: U,
        created_at: new Date(now - 60_000), last_activity_at: new Date(now), absolute_expires_at: new Date(absolute),
        device_label: 'Device', browser_label: 'Browser', is_current: true }] }
      if (name === 'rate_attempt') value = 0
      if (name === 'reserve_owned') value = { replay: false, requestHash: (values[3] as Buffer).toString('hex'), oneTime: values[4], expiresAt: now + 60_000, data: null }
      if (name === 'complete_owned') { staged.completed++; value = true }
      if (name === 'discard_owned') { staged.discarded++; value = true }
      if (name === 'revoke_own_session' || name === 'revoke_other_own_sessions') { staged.revoked++; value = 1 }
      if (name === 'totp_material_locked') value = { binding: { tenantId: A, userId: U, methodId: M, ceremonyId: C, purpose: values[2] },
        version: '3', lastCounter: counter, expiresAt: now + 30_000, algorithm: 'SHA1', secret_ciphertext: Buffer.from('ciphertext').toString('base64'), key_version: 'test-key' }
      if (name === 'consume_totp_cas') {
        if (values[5] === null) { staged.failures++; value = false }
        else { value = values[4] === counter && (counter === null || Number(values[5]) > counter); if (value) counter = Number(values[5]) }
      }
      if (name === 'consume_enrollment_cas') {
        assert.equal((values[5] as Buffer[]).length, 10)
        assert.ok((values[5] as Buffer[]).every(v => v.length === 32))
        value = true
      }
      return { rows: [{ value }] }
    },
    release(discard = false) { releases.push(discard) },
  }
  const deps: ApprovedBackendDependencies = {
    factors: {
      dummyPasswordHash: await dummy, auditKey: Buffer.alloc(32, 1), otpKey: Buffer.alloc(32, 2), recoveryKey: Buffer.alloc(32, 3),
      async decryptTotp() { return new TextEncoder().encode('12345678901234567890') },
    },
    cursorKey: Buffer.alloc(32, 4), now: () => now,
    transport() { return { network: Buffer.alloc(32, 5), device: Buffer.alloc(32, 6) } },
    normalizeEmail(email) { return email.trim().toLowerCase() },
  }
  const pool = { async connect() { connects++; return connection } }
  const backend = createApprovedPrivateBackend(pool, deps)
  return { backend, calls, releases, committed, get connects() { return connects } }
}
const cookies = { [names.session]: raw, [names.csrf]: csrf }
const headers = { cookie: names.session + '=' + raw + '; ' + names.csrf + '=' + csrf,
  origin, 'sec-fetch-site': 'same-origin', 'x-csrf-token': csrf, 'content-type': 'application/json' }
function code() { return TOTP.generate({ secret: Secret.fromUTF8('12345678901234567890'), algorithm: 'SHA1', period: 30, digits: 6, timestamp: now }) }

test('HTTP identity uses approved Binding and one transaction; foreign tenant cannot leak', async () => {
  for (const foreign of [false, true]) {
    const f = await fixture({ foreign })
    const handler = createAuthHandler(f.backend, origin, () => now)
    const response = await handler.handle(new Request(origin + '/auth/me', { headers }), 'getCurrentIdentity')
    assert.equal(response.status, foreign ? 503 : 200)
    assert.equal(f.connects, 1)
    assert.equal(f.calls.at(-1)?.name, foreign ? 'ROLLBACK' : 'COMMIT')
  }
})

test('RBAC and step-up deny before own-session effect or idempotency; no ALLOW cache', async () => {
  for (const options of [{ allowed: false }, { stepUp: false }]) {
    const f = await fixture(options), handler = createAuthHandler(f.backend, origin, () => now)
    const response = await handler.handle(new Request(origin + '/me/sessions/revoke-other-own', {
      method: 'POST', headers: { ...headers, 'idempotency-key': 'key-for-bulk-revoke-123' }, body: JSON.stringify({ reason: 'test' }),
    }), 'revokeOtherOwnSessions')
    assert.equal(response.status, 403)
    assert.equal(f.calls.some(c => c.name === 'revoke_other_own_sessions' || c.name === 'reserve_owned'), false)
    assert.equal(f.calls.at(-1)?.name, 'ROLLBACK')
  }
})

test('revocation, audit correlation and owned completion commit together; uncertain commit has no cookie success', async () => {
  for (const commitFailure of [false, true]) {
    const f = await fixture({ commitFailure }), handler = createAuthHandler(f.backend, origin, () => now)
    const response = await handler.handle(new Request(origin + '/auth/logout', {
      method: 'POST', headers: { ...headers, 'idempotency-key': 'logout-key-123456789' },
    }), 'logout')
    const data = await response.json()
    assert.equal(response.status, commitFailure ? 503 : 200)
    if (commitFailure) {
      assert.equal(response.headers.get('set-cookie'), null)
      assert.equal(f.committed.revoked, 0)
      assert.deepEqual(f.releases, [true])
    } else {
      assert.equal(f.committed.revoked, 1); assert.equal(f.committed.completed, 1)
      assert.equal(f.calls.find(c => c.name === 'revoke_own_session')!.values[1], data.meta.correlation_id)
      assert.ok(response.headers.has('set-cookie'))
    }
  }
})

test('real step-up TOTP keeps current session and absolute lifetime distinct from idle expiry', async () => {
  const f = await fixture(), handler = createAuthHandler(f.backend, origin, () => now)
  const response = await handler.handle(new Request(origin + '/auth/mfa/verify', {
    method: 'POST', headers, body: JSON.stringify({ challenge_id: C, method: 'TOTP', proof: code() }),
  }), 'verifyMfa')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data.session_id, S); assert.equal(body.data.tenant_id, A)
  assert.equal(body.data.absolute_expires_at, new Date(absolute).toISOString())
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(f.calls.some(c => c.name === 'issue_active_session'), false)
})

test('real active TOTP confirmation returns ten recovery codes once, stores only HMACs/marker', async () => {
  const f = await fixture(), handler = createAuthHandler(f.backend, origin, () => now)
  const response = await handler.handle(new Request(origin + '/mfa/totp/confirm', {
    method: 'POST', headers: { ...headers, 'idempotency-key': 'confirm-enrollment-key-123' },
    body: JSON.stringify({ enrollment_id: C, proof: code() }),
  }), 'confirmTotp')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data.codes.length, 10); assert.equal(new Set(body.data.codes).size, 10)
  assert.ok(body.data.codes.every((v: string) => /^[A-Z2-7]{26}$/.test(v)))
  assert.equal(f.calls.find(c => c.name === 'complete_owned')!.values[4], null)
  assert.equal(f.committed.completed, 1)
  assert.equal(response.headers.get('set-cookie'), null)
})

test('cursor cannot cross tenant/kind and abandoned reservations cannot commit', async () => {
  const f = await fixture()
  let binding: Binding | null = null, next = ''
  await f.backend.transaction(async tx => {
    binding = await tx.resolve(cookies); assert.ok(binding)
    const page = await tx.execute('listSelfSessions', { limit: 1 }, binding)
    assert.ok(!(page instanceof AuthError))
    next = (page.data as { next_cursor: string }).next_cursor
  })
  assert.ok(next.length > 0)
  await assert.rejects(f.backend.transaction(async tx => {
    const actor = await tx.resolve(cookies); assert.ok(actor)
    await tx.execute('listAuthorizedTenants', { cursor: next }, actor)
  }), (e: unknown) => e instanceof AuthError && e.status === 400)
  await assert.rejects(f.backend.transaction(async tx => {
    const actor = await tx.resolve(cookies); assert.ok(actor)
    const scope = canonical([actor.kind, actor.id, actor.tenantId, actor.userId, 'logout', 'key-for-rollback-123'])
    await tx.reserve(scope, 'c'.repeat(64))
  }), unavailable)
  assert.equal(f.calls.at(-1)?.name, 'ROLLBACK')
})

test('unsupported material-dependent ceremony fails closed and runtime remains closed', async () => {
  const f = await fixture()
  for (const operation of ['enrollTotp', 'startStepUp', 'resendOtp']) {
    await assert.rejects(f.backend.transaction(async tx => {
      const actor = await tx.resolve(cookies); assert.ok(actor)
      return tx.execute(operation, {}, actor)
    }), unavailable)
  }
  await assert.rejects(closedBackend.transaction(async () => true), unavailable)
})
