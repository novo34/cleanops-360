/** Private B1 composition: OpenBao exact-version custody precedes PostgreSQL work.
 * This module is never imported by runtime.ts or public HTTP routes.
 * It grants no roles, registers no runtime switch and performs no SQL itself.
 */
import { AuthError } from './service.ts'
import { createApprovedPrivateBackend, type ApprovedBackendDependencies } from './approved-backend.ts'
import type { IdentityPool } from './pg-identity-driver.ts'
import type { PrivateKeyReference } from './openbao-keys.ts'

type Borrow = <R>(ref: PrivateKeyReference, fn: (key: Buffer) => R) => R
export type PrivateCustody = {
  withKeys<T>(refs: readonly PrivateKeyReference[], lifetimeMs: number,
    work: (borrow: Borrow) => Promise<T>): Promise<T>
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
  const list = [refs.audit, refs.otp, refs.recovery, refs.cursor]
  const tenants = new Set(list.map(r => r.tenantId.toLowerCase()))
  if (tenants.size !== 1) throw unavailable()
  try {
    return await input.custody.withKeys(list, input.lifetimeMs, async borrow => {
      const deps = input.dependencies(borrow)
      if (!deps || !deps.factors ||
          deps.factors.auditKey !== borrow(refs.audit, key => key) ||
          deps.factors.otpKey !== borrow(refs.otp, key => key) ||
          deps.factors.recoveryKey !== borrow(refs.recovery, key => key) ||
          deps.cursorKey !== borrow(refs.cursor, key => key)) throw unavailable()
      return work(createApprovedPrivateBackend(input.pool, deps))
    })
  } catch {
    throw unavailable()
  }
}
