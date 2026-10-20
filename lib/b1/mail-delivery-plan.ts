import { createHash } from 'node:crypto'
import { canonical } from './contracts.ts'
import { AuthError } from './service.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
export type DeliveryOutcome = 'TRANSIENT_FAILURE' | 'PERMANENT_FAILURE' | 'UNKNOWN'
export type RetryDecision = Readonly<
  { action: 'RETRY'; availableAt: number } |
  { action: 'STOP'; reason: 'EXPIRED' | 'EXHAUSTED' | 'PERMANENT_FAILURE' } |
  { action: 'QUARANTINE'; reason: 'UNKNOWN_DELIVERY' }
>

/** Pure scheduling only. Inputs are server metadata, not authorization.
 * Policy is explicit; no production defaults, SQL, SMTP, timers or queue.
 * attempts includes the most recent claimed attempt, as in V4 claim_mail.
 * A future worker must recheck lease ownership, verified recipient generation,
 * challenge/method/membership and expiry immediately before sending.
 */
export function planMailRetry(
  input: Readonly<{ attempts: number; expiresAt: number; now: number; outcome: DeliveryOutcome }>,
  policy: Readonly<{ maxAttempts: number; retryDelayMs: number }>,
): RetryDecision {
  if (!input || !policy || !Number.isSafeInteger(input.attempts) || input.attempts < 1 ||
      !Number.isSafeInteger(input.expiresAt) || input.expiresAt < 0 ||
      !Number.isSafeInteger(input.now) || input.now < 0 ||
      !Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 ||
      !Number.isSafeInteger(policy.retryDelayMs) || policy.retryDelayMs <= 0 ||
      !['TRANSIENT_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN'].includes(input.outcome)) throw unavailable()
  // Do not convert uncertain acceptance into either success or blind redelivery.
  if (input.outcome === 'UNKNOWN') return Object.freeze({ action: 'QUARANTINE', reason: 'UNKNOWN_DELIVERY' })
  if (input.now >= input.expiresAt) return Object.freeze({ action: 'STOP', reason: 'EXPIRED' })
  if (input.outcome === 'PERMANENT_FAILURE') return Object.freeze({ action: 'STOP', reason: 'PERMANENT_FAILURE' })
  if (input.attempts >= policy.maxAttempts) return Object.freeze({ action: 'STOP', reason: 'EXHAUSTED' })
  const availableAt = input.now + policy.retryDelayMs
  if (!Number.isSafeInteger(availableAt)) throw unavailable()
  if (availableAt >= input.expiresAt) return Object.freeze({ action: 'STOP', reason: 'EXPIRED' })
  return Object.freeze({ action: 'RETRY', availableAt })
}

/** Stable provider idempotency key for ONE committed outbox row, never a new key
 * per retry. Provider support/length/retention must be reviewed before wiring.
 * Not an authorization token and not an exactly-once delivery guarantee. */
export function emailDeliveryIdempotencyKey(tenantId: string, outboxId: string): string {
  if (!uuid(tenantId) || !uuid(outboxId)) throw unavailable()
  return createHash('sha256').update(canonical(['cleanops-email-delivery-1', tenantId.toLowerCase(), outboxId.toLowerCase()])).digest('hex')
}
