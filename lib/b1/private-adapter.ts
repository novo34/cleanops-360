import { AuthError, type Backend, type Binding, type Transaction } from './service.ts'

/** A trusted, locked snapshot obtained by a private broker, never from HTTP selectors. */
export type LockedSession = Readonly<{
  tenantId: string; userId: string; sessionId: string; bindingId: string
  kind: 'ACTIVE' | 'PREAUTH'; sessionState: 'ACTIVE' | 'PENDING_MFA' | 'ENROLLMENT_REQUIRED' | 'REVOKED'
  csrfDigest: string; expiresAt: number; idleExpiresAt: number
  credentialVersion: number; currentCredentialVersion: number
  tenantActive: boolean; userActive: boolean; membershipActive: boolean
  revoked: boolean
}>

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const invalid = () => new AuthError(401, 'AUTH_INVALID')

/** Fail closed when the broker has not locked and revalidated session, identity and membership.
 * Must be called again after acquiring ordered locks for every sensitive mutation.
 * A syntactically plausible HTTP tenant ID is never sufficient proof of membership. */
export function verifiedActiveBinding(locked: LockedSession | null, now: number): Binding {
  if (!locked || !Number.isSafeInteger(now) || now < 0) throw invalid()
  if (!locked.tenantActive || !locked.userActive || !locked.membershipActive || locked.revoked ||
      locked.sessionState !== 'ACTIVE' || locked.kind !== 'ACTIVE' ||
      !Number.isSafeInteger(locked.credentialVersion) || locked.credentialVersion < 1 ||
      locked.credentialVersion !== locked.currentCredentialVersion ||
      !Number.isSafeInteger(locked.expiresAt) || !Number.isSafeInteger(locked.idleExpiresAt) ||
      locked.expiresAt <= now || locked.idleExpiresAt <= now ||
      ![locked.tenantId, locked.userId, locked.sessionId, locked.bindingId, locked.csrfDigest]
        .every(s => typeof s === 'string' && s.length > 0)) throw invalid()
  return Object.freeze({
    kind: 'ACTIVE' as const, id: locked.bindingId, userId: locked.userId,
    tenantId: locked.tenantId, sessionId: locked.sessionId,
    csrfDigest: locked.csrfDigest, expiresAt: Math.min(locked.expiresAt, locked.idleExpiresAt),
  })
}

/** Private SQL broker implementation contract. ALL callbacks run on the same transaction
 * and pooled connection; commit must be finished before transaction() resolves.
 * Any rollback/commit/connection failure rejects; it must NEVER return success.
 * The runtime deliberately does not install this adapter until PostgreSQL/RLS review. */
export interface PrivateTransactionalDriver {
  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>
  bootstrap(bindingDigest: string, csrfDigest: string, expiresAt: number): Promise<void>
}

/** No data source or fallback is installed by importing this factory.
 * Callers must independently audit the driver, the SQL SECURITY DEFINER broker,
 * grants, pool boundaries and full PostgreSQL/RLS integration before wiring runtime. */
export function createPrivateBackend(driver: PrivateTransactionalDriver): Backend {
  if (!driver || typeof driver.transaction !== 'function' || typeof driver.bootstrap !== 'function') throw unavailable()
  return Object.freeze({
    async transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
      try { return await driver.transaction(work) }
      catch (error) { if (error instanceof AuthError) throw error; throw unavailable() }
    },
    async bootstrap(bindingDigest: string, csrfDigest: string, expiresAt: number): Promise<void> {
      if (!/^[a-f0-9]{64}$/.test(bindingDigest) || !/^[a-f0-9]{64}$/.test(csrfDigest) ||
          !Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw unavailable()
      try { await driver.bootstrap(bindingDigest, csrfDigest, expiresAt) }
      catch { throw unavailable() }
    },
  })
}

/** Check tenant/subject at the service boundary in addition to PostgreSQL RLS.
 * A user who belongs to A and B never receives cross-tenant session authority. */
export function requireOwnSession(actor: Binding, target: Readonly<{ tenantId: string; userId: string; sessionId: string }>, otherOnly = false): void {
  if (actor.kind !== 'ACTIVE' || !actor.tenantId || !actor.userId || !actor.sessionId ||
      actor.tenantId !== target.tenantId || actor.userId !== target.userId ||
      (otherOnly && actor.sessionId === target.sessionId)) throw new AuthError(404, 'NOT_FOUND')
}
