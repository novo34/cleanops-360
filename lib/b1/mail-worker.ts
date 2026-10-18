import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { openMailPayload, type MailContext, type MailPayload } from './mail-envelope.ts'
import { emailDeliveryIdempotencyKey } from './mail-delivery-plan.ts'
import { AuthError } from './service.ts'

export type MailClaim = Readonly<{ context: MailContext; ciphertext: Buffer; keyVersion: string; expiresAt: number }>
export type MailOutcome = 'ACCEPTED' | 'TRANSIENT' | 'PERMANENT' | 'UNKNOWN'
/** These methods resolve ONLY after COMMIT. A dispatch intent must survive a crash;
 * an expired DISPATCHING lease is quarantined, never automatically claimed again.
 * Implementations must use the approved broker contract, never direct table access. */
export interface MailDispatchStore {
  claim(claimDigest: Buffer, correlation: string): Promise<MailClaim | null>
  authorizeDispatch(claim: MailClaim, claimDigest: Buffer, correlation: string): Promise<boolean>
  finish(claim: MailClaim, claimDigest: Buffer, outcome: MailOutcome, correlation: string): Promise<boolean>
}
export interface MailDeliveryDependencies {
  store: MailDispatchStore
  withReadKey<T>(tenantId: string, version: string, work: (key: Buffer) => T): Promise<T>
  /** Private transport input; never logged/serialized. No implicit retries. A returned
   * TRANSIENT must mean definitely NOT accepted; ambiguous results are UNKNOWN. */
  deliver(message: Readonly<MailPayload>, idempotencyKey: string): Promise<MailOutcome>
  now(): number
}
export type MailDispatchResult = Readonly<{ state: 'EMPTY' | 'CANCELLED' | 'FINISHED' | 'UNCONFIRMED'; outcome?: MailOutcome }>
const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')

/** One asynchronous job, deliberately unwired to runtime until exact SQL/ACL approval.
 * Claims and authorization are committed before transport. Revocation during an
 * in-flight send cannot unsend mail: the OTP consumer must revalidate generations.
 * Return safe status only, never IDs, recipient, OTP, ciphertext or provider errors. */
export async function dispatchOneMail(deps: MailDeliveryDependencies): Promise<MailDispatchResult> {
  const nonce = randomBytes(32), digest = createHash('sha256').update(nonce).digest(), correlation = randomUUID()
  nonce.fill(0)
  let claim: MailClaim | null = null
  let plaintext: Readonly<MailPayload> | undefined
  let dispatchCommitted = false
  try {
    claim = await deps.store.claim(digest, correlation)
    if (!claim) return Object.freeze({ state: 'EMPTY' })
    // AEAD authenticates the complete private context; malformed material fails closed.
    plaintext = await deps.withReadKey(claim.context.tenantId, claim.keyVersion,
      key => openMailPayload(claim!.ciphertext, key, claim!.keyVersion, claim!.context, deps.now()))
    if (plaintext.expiresAt !== claim.expiresAt) throw unavailable()
    const providerKey = emailDeliveryIdempotencyKey(claim.context.tenantId, claim.context.outboxId)
    if (await deps.store.authorizeDispatch(claim, digest, correlation) !== true)
      return Object.freeze({ state: 'CANCELLED' })
    dispatchCommitted = true
    let outcome: MailOutcome = 'UNKNOWN'
    // Time can advance during authorization/custody: do not send expired plaintext.
    const now = deps.now()
    if (!Number.isSafeInteger(now) || now < plaintext.issuedAt || now >= plaintext.expiresAt) outcome = 'PERMANENT'
    else {
      try {
        const result: unknown = await deps.deliver(plaintext, providerKey)
        if (['ACCEPTED', 'TRANSIENT', 'PERMANENT', 'UNKNOWN'].includes(result as string)) outcome = result as MailOutcome
      } catch { /* Transport exceptions may follow acceptance. Never assume retryable. */ }
    }
    try {
      if (await deps.store.finish(claim, digest, outcome, correlation) !== true)
        return Object.freeze({ state: 'UNCONFIRMED' })
    } catch { return Object.freeze({ state: 'UNCONFIRMED' }) }
    return Object.freeze({ state: 'FINISHED', outcome })
  } catch {
    // A failed/unknown authorize COMMIT might have persisted DISPATCHING. Never call
    // deliver or fabricate a completion; durable lease expiry must quarantine it.
    if (dispatchCommitted) return Object.freeze({ state: 'UNCONFIRMED' })
    throw unavailable()
  } finally {
    digest.fill(0)
    claim?.ciphertext.fill(0)
    plaintext = undefined // JS strings cannot be reliably zeroized; no caching/logging.
  }
}
