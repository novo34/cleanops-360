/** Private B1 composition: OpenBao exact-version custody precedes PostgreSQL work.
 * This module is never imported by runtime.ts or public HTTP routes.
 * It grants no roles, registers no runtime switch and performs no SQL itself.
 */
import { AuthError, type Backend, type Transaction } from './service.ts'
import { createApprovedPrivateBackend, type ApprovedBackendDependencies } from './approved-backend.ts'
import type { IdentityPool } from './pg-identity-driver.ts'
import type { PrivateKeyReference, PrivateKeyLease } from './openbao-keys.ts'
import { createCustodyDeadlinePool } from './custody-deadline.ts'

type Borrow = <R>(ref: PrivateKeyReference, fn: (key: Buffer) => R) => R
export type PrivateCustody = {
  withKeys<T>(refs: readonly PrivateKeyReference[], lifetimeMs: number,
    work: (borrow: Borrow, lease: PrivateKeyLease) => Promise<T>): Promise<T>
}
export type B1CustodyReferences = Readonly<{
  audit: PrivateKeyReference
  otp: PrivateKeyReference
  recovery: PrivateKeyReference
  cursor: PrivateKeyReference
}>
export type B1CustodyInputs = Readonly<{
  pool: IdentityPool
  custody: PrivateCustody
  references: B1CustodyReferences
  /** Explicit tenant-scoped TOTP encryption versions used by private factor verification. */
  totpKeys?: readonly PrivateKeyReference[]
  lifetimeMs: number
  /** Caller implements trusted ingress/provisioning; no headers or request defaults. */
  dependencies: (borrow: Borrow) => ApprovedBackendDependencies
}>
const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')

/** Each operation reloads custody; no private key escapes into a persistent backend.
 * Caller must complete the HTTP/API transaction inside work. Fail closed on
 * unavailable/mismatched custody and always zero provider-owned keys afterward.
 */
export async function withB1Custody<T>(
  input: B1CustodyInputs,
  work: (backend: ReturnType<typeof createApprovedPrivateBackend>) => Promise<T>,
): Promise<T> {
  if (!input || !input.pool || typeof input.pool.connect !== 'function' ||
      !input.custody || typeof input.custody.withKeys !== 'function' ||
      typeof input.dependencies !== 'function' || typeof work !== 'function' ||
      !Number.isSafeInteger(input.lifetimeMs) || input.lifetimeMs < 1 || input.lifetimeMs > 30000) throw unavailable()
  const refs = input.references
  if (!refs || refs.audit?.purpose !== 'audit-hmac' ||
      refs.otp?.purpose !== 'otp-hmac' || refs.recovery?.purpose !== 'recovery-hmac' ||
      refs.cursor?.purpose !== 'cursor-hmac') throw unavailable()
  const extra = input.totpKeys ?? []
  if (!Array.isArray(extra) || extra.some(r => r?.purpose !== 'totp-aead') || extra.length > 8) throw unavailable()
  const list = [refs.audit, refs.otp, refs.recovery, refs.cursor, ...extra]
  const identities = list.map(r => JSON.stringify([r.tenantId.toLowerCase(), r.purpose, r.keyId, r.version]))
  if (new Set(identities).size !== identities.length) throw unavailable()
  const tenants = new Set(list.map(r => r.tenantId.toLowerCase()))
  if (tenants.size !== 1 || list.some(r => !Number.isSafeInteger(r.version) || r.version < 1 || !r.keyId)) throw unavailable()
  try {
    return await input.custody.withKeys(list, input.lifetimeMs, async (borrow, lease) => {
      if (!lease || typeof lease.remainingMs !== 'function' || typeof lease.acknowledgeCommit !== 'function') throw unavailable()
      const deps = input.dependencies(borrow)
      if (!deps || !deps.factors ||
          deps.factors.auditKey !== borrow(refs.audit, key => key) ||
          deps.factors.otpKey !== borrow(refs.otp, key => key) ||
          deps.factors.recoveryKey !== borrow(refs.recovery, key => key) ||
          deps.cursorKey !== borrow(refs.cursor, key => key) ||
          [deps.factors.auditKey, deps.factors.otpKey, deps.factors.recoveryKey, deps.cursorKey].some(key => !Buffer.isBuffer(key) || key.length !== 32)) throw unavailable()
      return work(createApprovedPrivateBackend(createCustodyDeadlinePool(input.pool, lease), deps))
    })
  } catch {
    throw unavailable()
  }
}


/** Canonical HTTP backend adapter: acquire tenant keys for each operation, build
 * the private V4 backend inside that lease, and finish its SQL transaction before
 * keys are wiped. Runtime selection remains a separate, closed-by-default gate.
 */
export function createCustodiedBackend(input: B1CustodyInputs): Backend {
  if (!input || typeof input !== 'object') throw unavailable()
  async function scoped<T>(work: (backend: Backend) => Promise<T>): Promise<T> {
    // Transport providers sanitize thrown errors. Carry only canonical business
    // errors across their cleanup boundary, then surface them after custody ends.
    const outcome = await withB1Custody(input, async backend => {
      try { return { value: await work(backend) } }
      catch (error) { return { error: error instanceof AuthError ? error : unavailable() } }
    })
    if ('error' in outcome) throw outcome.error
    return outcome.value
  }
  return Object.freeze({
    transaction<T>(work: (tx: Transaction) => Promise<T>, context?: { correlationId: string; operation: string }): Promise<T> {
      if (typeof work !== 'function') return Promise.reject(unavailable())
      return scoped(backend => backend.transaction(work, context))
    },
    bootstrap(bindingDigest: string, csrfDigest: string, expiresAt: number): Promise<void> {
      return scoped(backend => backend.bootstrap(bindingDigest, csrfDigest, expiresAt))
    },
  })
}
