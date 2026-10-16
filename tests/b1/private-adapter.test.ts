import test from 'node:test'
import assert from 'node:assert/strict'
import { createPrivateBackend, requireOwnSession, verifiedActiveBinding, type LockedSession } from '../../lib/b1/private-adapter.ts'
import { AuthError, closedBackend, type Transaction } from '../../lib/b1/service.ts'

const now = 1_700_000_000_000
const valid: LockedSession = {
  tenantId: 'tenant-a', userId: 'user-a', sessionId: 'session-a', bindingId: 'binding-a',
  kind: 'ACTIVE', sessionState: 'ACTIVE', csrfDigest: 'digest',
  expiresAt: now + 30_000, idleExpiresAt: now + 10_000,
  credentialVersion: 3, currentCredentialVersion: 3,
  tenantActive: true, userActive: true, membershipActive: true, revoked: false,
}
const denied = (e: unknown) => e instanceof AuthError && e.status === 401
const unavailable = (e: unknown) => e instanceof AuthError && e.status === 503 && e.code === 'AUTH_DEPENDENCY_UNAVAILABLE'

test('locked ACTIVE context is bound to its own tenant and shortest expiry', () => {
  assert.deepEqual(verifiedActiveBinding(valid, now), {
    kind: 'ACTIVE', tenantId: 'tenant-a', userId: 'user-a', sessionId: 'session-a',
    id: 'binding-a', csrfDigest: 'digest', expiresAt: now + 10_000,
  })
  assert.ok(Object.isFrozen(verifiedActiveBinding(valid, now)))
})

test('revocation, MFA pending, membership, credential reset and time all fail closed', () => {
  const variations: Partial<LockedSession>[] = [
    { revoked: true }, { sessionState: 'REVOKED' }, { sessionState: 'PENDING_MFA' },
    { sessionState: 'ENROLLMENT_REQUIRED' }, { kind: 'PREAUTH' },
    { tenantActive: false }, { userActive: false }, { membershipActive: false },
    { credentialVersion: 2 }, { expiresAt: now }, { idleExpiresAt: now },
    { tenantId: '' }, { sessionId: '' }, { csrfDigest: '' },
  ]
  for (const item of variations) assert.throws(() => verifiedActiveBinding({ ...valid, ...item }, now), denied)
  assert.throws(() => verifiedActiveBinding(null, now), denied)
  assert.throws(() => verifiedActiveBinding(valid, Number.NaN), denied)
})

test('own-session checks cannot cross tenant or user or bulk-revoke the current session', () => {
  const actor = verifiedActiveBinding(valid, now)
  requireOwnSession(actor, { tenantId: 'tenant-a', userId: 'user-a', sessionId: 'another' }, true)
  for (const target of [
    { tenantId: 'tenant-b', userId: 'user-a', sessionId: 'another' },
    { tenantId: 'tenant-a', userId: 'user-b', sessionId: 'another' },
    { tenantId: 'tenant-a', userId: 'user-a', sessionId: 'session-a' },
  ]) assert.throws(() => requireOwnSession(actor, target, true), (e: unknown) => e instanceof AuthError && e.status === 404)
})

test('private driver is not runtime enabled and hides storage failures', async () => {
  await assert.rejects(closedBackend.transaction(async () => true), unavailable)
  const backend = createPrivateBackend({
    async transaction<T>(_work: (tx: Transaction) => Promise<T>): Promise<T> { throw new Error('db secret') },
    async bootstrap() { throw new Error('private connection') },
  })
  await assert.rejects(backend.transaction(async () => true), unavailable)
  await assert.rejects(backend.bootstrap('a'.repeat(64), 'b'.repeat(64), now), unavailable)
  await assert.rejects(backend.bootstrap('invalid', 'b'.repeat(64), now), unavailable)
})
