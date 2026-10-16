import test from 'node:test'
import assert from 'node:assert/strict'
import { numeric } from '../../lib/b1/config.ts'
import { planMailRetry, emailDeliveryIdempotencyKey } from '../../lib/b1/mail-delivery-plan.ts'

const tenant = '00000000-0000-4000-8000-000000000001'
const outbox = '00000000-0000-4000-8000-000000000002'
const other = '00000000-0000-4000-8000-000000000003'
const policy = { maxAttempts: numeric('outbox_max_attempts'), retryDelayMs: numeric('outbox_retry_delay') * 1000 }
const now = 1_700_000_000_000
test('explicit V4 trial retry budget and expiry never extend OTP lifetime', () => {
 const input = { attempts: 1, now, expiresAt: now + numeric('email_otp_ttl') * 1000, outcome: 'TRANSIENT_FAILURE' as const }
 assert.deepEqual(planMailRetry(input, policy), { action: 'RETRY', availableAt: now + policy.retryDelayMs })
 assert.deepEqual(planMailRetry({ ...input, attempts: policy.maxAttempts }, policy), { action: 'STOP', reason: 'EXHAUSTED' })
 assert.deepEqual(planMailRetry({ ...input, expiresAt: now }, policy), { action: 'STOP', reason: 'EXPIRED' })
 assert.deepEqual(planMailRetry({ ...input, expiresAt: now + policy.retryDelayMs }, policy), { action: 'STOP', reason: 'EXPIRED' })
 assert.deepEqual(planMailRetry({ ...input, outcome: 'PERMANENT_FAILURE' }, policy), { action: 'STOP', reason: 'PERMANENT_FAILURE' })
 assert.deepEqual(planMailRetry({ ...input, outcome: 'UNKNOWN', attempts: policy.maxAttempts }, policy), { action: 'RECONCILE', reason: 'UNKNOWN_DELIVERY' })
})
test('bad policy/metadata fails closed; no default retry plan', () => {
 const input = { attempts: 1, now, expiresAt: now + 300_000, outcome: 'TRANSIENT_FAILURE' as const }
 for (const maxAttempts of [0, -1, NaN, 1.5]) assert.throws(() => planMailRetry(input, { ...policy, maxAttempts }))
 for (const retryDelayMs of [0, -1, Infinity, 1.5]) assert.throws(() => planMailRetry(input, { ...policy, retryDelayMs }))
 for (const attempts of [0, -1, NaN, 1.5]) assert.throws(() => planMailRetry({ ...input, attempts }, policy))
 assert.throws(() => planMailRetry({ ...input, outcome: 'RETRY_ANYWAY' } as never, policy))
 assert.throws(() => planMailRetry({ ...input, now: Number.MAX_SAFE_INTEGER - 1, expiresAt: Number.MAX_SAFE_INTEGER }, policy))
})
test('idempotency is stable per tenant/outbox, isolated and contains no recipient or OTP', () => {
 const first = emailDeliveryIdempotencyKey(tenant, outbox)
 assert.match(first, /^[a-f0-9]{64}$/)
 assert.equal(first, emailDeliveryIdempotencyKey(tenant, outbox))
 assert.notEqual(first, emailDeliveryIdempotencyKey(other, outbox))
 assert.notEqual(first, emailDeliveryIdempotencyKey(tenant, other))
 assert.throws(() => emailDeliveryIdempotencyKey('email@example.invalid', outbox))
})
test('simulated accepted-but-timeout delivery requires reconciliation without second send', () => {
 let sends = 0
 const accepted = new Set<string>()
 const sendFixture = () => { sends++; accepted.add(emailDeliveryIdempotencyKey(tenant, outbox)); return 'UNKNOWN' as const }
 const outcome = sendFixture()
 const decision = planMailRetry({ attempts: 1, now, expiresAt: now + 300_000, outcome }, policy)
 assert.equal(decision.action, 'RECONCILE')
 assert.equal(sends, 1)
 assert.equal(accepted.size, 1)
 // Pure decision has no worker/queue/timer or side effects to redeliver.
 assert.deepEqual(planMailRetry({ attempts: 1, now, expiresAt: now + 300_000, outcome }, policy), decision)
 assert.equal(sends, 1)
})
test('simulated transient sequence exhausts budget or expiry with one stable key', () => {
 let attempts = 1, time = now
 const keys = new Set<string>()
 while (true) {
  keys.add(emailDeliveryIdempotencyKey(tenant, outbox))
  const decision = planMailRetry({ attempts, now: time, expiresAt: now + 300_000, outcome: 'TRANSIENT_FAILURE' }, policy)
  if (decision.action !== 'RETRY') { assert.equal(decision.action, 'STOP'); break }
  time = decision.availableAt; attempts++
  assert.ok(attempts <= policy.maxAttempts)
 }
 assert.equal(keys.size, 1)
 assert.ok(time < now + 300_000)
})
