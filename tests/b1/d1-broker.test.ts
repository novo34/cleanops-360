import test from 'node:test'
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createV4IdentityRepository, type D1MfaMaterial, type V4Broker } from '../../lib/b1/v4-broker.ts'
import { AuthError } from '../../lib/b1/service.ts'
import type { IdentityConnection } from '../../lib/b1/pg-identity-driver.ts'

const T = '00000000-0000-4000-8000-000000000001'
const U = '00000000-0000-4000-8000-000000000002'
const B = '00000000-0000-4000-8000-000000000003'
const M = '00000000-0000-4000-8000-000000000004'
const C = '00000000-0000-4000-8000-000000000005'
const X = '00000000-0000-4000-8000-000000000006'
const raw = 'a'.repeat(43), expiry = '2030-01-01T00:00:00.000Z'
const unavailable = (e: unknown) => e instanceof AuthError && e.status === 503 && e.cause === undefined
type State = { owned: boolean; complete: number; effects: number; audit: number; counter: number | null; attempts: number }
type Options = { denied?: boolean; revoked?: boolean; stale?: boolean; auditFailure?: boolean; commitFailure?: boolean; malformed?: (v: Record<string, unknown>) => unknown }
/** Simulated broker semantics only, NOT proof of SQL locks/RLS. BEGIN serializes
 * fixture transactions so the same-connection runner/CAS race can be exercised. */
function fixture(options: Options = {}) {
 let state: State = { owned: false, complete: 0, effects: 0, audit: 0, counter: null, attempts: 0 }
 let queue = Promise.resolve(), connects = 0
 const calls: { connection: number; name: string; values: unknown[]; sql: string }[] = []
 const releases: boolean[] = []
 const error = (message: string) => Object.assign(new Error(message), { code: 'P0001' })
 const material = (purpose: unknown) => ({
  tenantId: T, userId: U, bindingId: B, riskClass: 'SENSITIVE',
  enabledMethods: [{ id: M, kind: 'TOTP', version: '2' }],
  recipient: ['ENROLLMENT', 'ISSUE_SESSION'].includes(String(purpose)) ? null : 'private-canary@example.invalid',
  expiresAt: expiry,
 })
 const pool = { async connect(): Promise<IdentityConnection> {
  const id = ++connects
  let staged = { ...state }, unlock = () => {}
  return {
   async query(sql, values = []) {
    const name = /auth_api\.([a-z_]+)/.exec(sql)?.[1] ?? sql
    calls.push({ connection: id, name, values, sql })
    if (sql.startsWith('BEGIN')) {
     const prior = queue
     queue = new Promise<void>(resolve => { unlock = resolve })
     await prior; staged = { ...state }; return {}
    }
    if (sql === 'ROLLBACK') return {}
    if (sql === 'COMMIT') {
     if (options.commitFailure) throw error('private diagnostic key ciphertext recipient')
     if (staged.owned) throw error('RESERVATION_NOT_OWNED')
     state = { ...staged }; return {}
    }
    let value: unknown
    if (name === 'binding_authorization') return { rows: [{ allowed: !options.denied, step_up: true }] }
    if (name === 'reserve_owned') {
     staged.owned = true
     value = { replay: false, requestHash: Buffer.from(values[3] as Buffer).toString('hex'), oneTime: values[4], expiresAt: Date.parse(expiry) }
    } else if (name === 'trusted_mfa_material') {
     if (options.revoked) throw error('AUTH_INVALID')
     value = options.malformed ? options.malformed(material(values[1])) : material(values[1])
    } else if (name === 'issue_bound_challenge' || name === 'begin_totp_enrollment_assigned') {
     if (!staged.owned) throw error('RESERVATION_NOT_OWNED')
     if (name === 'issue_bound_challenge' && (options.stale || values[3] !== '2' || values[2] !== M)) throw error('AUTH_INVALID')
     if (name === 'begin_totp_enrollment_assigned' && (values[1] !== T || values[2] !== U)) throw error('AUTH_INVALID')
     staged.effects++
     if (options.auditFailure) throw error('private audit diagnostic secret-canary')
     staged.audit++
     value = name === 'issue_bound_challenge' ? C : { methodId: values[3], initialVersion: '1', expiresAt: expiry }
    } else if (name === 'consume_totp_cas') {
     if (!staged.owned) throw error('RESERVATION_NOT_OWNED')
     const valid = values[3] === '2' && values[4] === staged.counter && typeof values[5] === 'number' &&
      (staged.counter === null || values[5] > staged.counter)
     staged.attempts++
     if (valid) { staged.counter = values[5] as number; staged.audit++ }
     value = valid
    } else if (name === 'complete_owned' || name === 'discard_owned') {
     if (!staged.owned) throw error('RESERVATION_NOT_OWNED')
     staged.owned = false; staged.complete++; value = true
    } else if (name === 'totp_material_locked') value = { version: '2', lastCounter: staged.counter }
    else if (name === 'consume_email_otp') value = false
    else throw error('unimplemented fixture call: ' + name)
    return { rows: [{ value }] }
   },
   release(discard = false) { releases.push(discard); unlock() },
  }
 } }
 return { pool, calls, releases, get state() { return { ...state } }, get connects() { return connects } }
}
async function reserve(broker: V4Broker, oneTime = false) {
 return broker.call('reserveOwned', [raw, oneTime ? 'enrollTotp' : 'startStepUp', Buffer.alloc(32, 1), Buffer.alloc(32, 2), oneTime])
}
async function complete(broker: V4Broker, safeJson: string | null = null) {
 return broker.call('completeOwned', [raw, 'startStepUp', Buffer.alloc(32, 1), Buffer.alloc(32, 2), safeJson])
}
async function challenge(broker: V4Broker) {
 const auth = await broker.call('authorization', [raw, 'B1-SELF-05', null])
 if (auth[0]?.allowed !== true) throw new AuthError(403, 'POLICY_DENIED')
 await reserve(broker)
 const m: D1MfaMaterial = await broker.call('mfaMaterial', [raw, 'LOGIN', null, null])
 assert.equal(m.tenantId, T); assert.equal(m.userId, U); assert.equal(m.bindingId, B)
 const method = m.enabledMethods[0]
 const id = await broker.call('boundChallenge', [raw, 'TOTP', method.id, method.version, null, null, null, null, null, X])
 const projection = { challenge_id: id, allowed_methods: ['TOTP'] }
 await complete(broker, JSON.stringify(projection))
 return projection
}
test('D1 exact typed calls keep authorization/reservation/material/effect/audit/completion on one connection', async () => {
 const f = fixture()
 const result = await createV4IdentityRepository(f.pool).transaction(challenge)
 assert.deepEqual(result, { challenge_id: C, allowed_methods: ['TOTP'] })
 assert.deepEqual(f.state, { owned: false, complete: 1, effects: 1, audit: 1, counter: null, attempts: 0 })
 assert.equal(f.connects, 1)
 assert.equal(new Set(f.calls.map(c => c.connection)).size, 1)
 assert.deepEqual(f.calls.map(c => c.name), ['BEGIN ISOLATION LEVEL READ COMMITTED','binding_authorization','reserve_owned','trusted_mfa_material','issue_bound_challenge','complete_owned','COMMIT'])
 assert.ok(!JSON.stringify(result).includes('private-canary'))
 assert.ok(f.calls.every(c => !c.sql.includes(raw)))
})
test('denial, revocation, stale generation, audit and uncertain COMMIT never return successful effects', async () => {
 for (const options of [{ denied: true }, { revoked: true }, { stale: true }, { auditFailure: true }, { commitFailure: true }]) {
  const f = fixture(options)
  await assert.rejects(createV4IdentityRepository(f.pool).transaction(challenge), AuthError)
  assert.equal(f.state.effects, 0); assert.equal(f.state.audit, 0); assert.equal(f.state.complete, 0)
  assert.equal(f.calls.at(-1)?.name, 'ROLLBACK')
  assert.deepEqual(f.releases, [true])
  if (options.denied) assert.equal(f.calls.some(c => c.name === 'reserve_owned'), false)
 }
})
test('unowned mutation poisons transaction even when caller catches denial', async () => {
 const f = fixture()
 await assert.rejects(createV4IdentityRepository(f.pool).transaction(async broker => {
  await assert.rejects(broker.call('boundChallenge', [raw, 'TOTP', M, '2', null, null, null, null, null, X]),
   (e: unknown) => e instanceof AuthError && e.status === 409)
 }), unavailable)
 assert.equal(f.state.effects, 0)
 assert.equal(f.calls.at(-1)?.name, 'ROLLBACK')
})
test('strict private material rejects corrupt and privilege-expanding shapes and redacts recipient', async () => {
 for (const malformed of [
  (m: Record<string, unknown>) => ({ ...m, riskClass: null }),
  (m: Record<string, unknown>) => ({ ...m, expiresAt: 'invalid' }),
  (m: Record<string, unknown>) => ({ ...m, arbitrary: 'secret' }),
  (m: Record<string, unknown>) => ({ ...m, enabledMethods: [{ id: M, kind: 'TOTP', version: '9223372036854775808' }] }),
  (m: Record<string, unknown>) => ({ ...m, enabledMethods: [{ id: M, kind: 'TOTP', version: '2' }, { id: M, kind: 'EMAIL_OTP', version: '2' }] }),
 ]) {
  const f = fixture({ malformed })
  await assert.rejects(createV4IdentityRepository(f.pool).transaction(b => b.call('mfaMaterial', [raw, 'LOGIN', null, null])), unavailable)
  assert.equal(f.calls.at(-1)?.name, 'ROLLBACK')
 }
 const f = fixture()
 await createV4IdentityRepository(f.pool).transaction(async broker => {
  const m = await broker.call('mfaMaterial', [raw, 'LOGIN', null, null])
  assert.equal(m.recipient, 'private-canary@example.invalid')
  assert.equal(JSON.stringify(m), '"[REDACTED_D1_MATERIAL]"')
  assert.equal(inspect(m), '[REDACTED_D1_MATERIAL]')
  assert.equal('recipient' in { ...m }, false)
  assert.ok(Object.isFrozen(m.enabledMethods[0]))
 })
})
test('assigned enrollment is a typed low-level contract only, with explicit scope and one-time reservation', async () => {
 const f = fixture()
 const ciphertext = Buffer.alloc(61, 7); ciphertext[0] = 2
 const result = await createV4IdentityRepository(f.pool).transaction(async broker => {
  await reserve(broker, true)
  const material = await broker.call('mfaMaterial', [raw, 'ENROLLMENT', null, null])
  const pending = await broker.call('enrollAssigned', [raw, material.tenantId, material.userId, M, '1', ciphertext, 'fixture-only', 'SHA256', X])
  await broker.call('completeOwned', [raw, 'enrollTotp', Buffer.alloc(32, 1), Buffer.alloc(32, 2), null])
  return pending
 })
 assert.equal(result.methodId, M)
 const call = f.calls.find(c => c.name === 'begin_totp_enrollment_assigned')!
 assert.notEqual(call.values[5], ciphertext)
 assert.deepEqual(call.values[5], ciphertext)
 assert.equal(f.state.complete, 1)
 const foreign = fixture()
 await assert.rejects(createV4IdentityRepository(foreign.pool).transaction(async broker => {
  await reserve(broker, true)
  return broker.call('enrollAssigned', [raw, X, U, M, '1', ciphertext, 'fixture-only', 'SHA256', X])
 }), AuthError)
 assert.equal(foreign.state.effects, 0)
})
test('concurrent simulated counter CAS yields one winner and replay cannot advance global counter', async () => {
 const f = fixture(), repository = createV4IdentityRepository(f.pool)
 const attempt = () => repository.transaction(async broker => {
  await reserve(broker)
  const ok = await broker.call('consumeTotp', [raw, C, 'LOGIN', '2', null, 123, X])
  if (ok) await complete(broker)
  else await broker.call('discardOwned', [raw, 'startStepUp', Buffer.alloc(32, 1), Buffer.alloc(32, 2)])
  return ok
 })
 assert.deepEqual(await Promise.all([attempt(), attempt()]), [true, false])
 assert.equal(f.state.counter, 123); assert.equal(f.state.audit, 1); assert.equal(f.state.attempts, 2)
 assert.equal(f.state.owned, false)
})
test('pinned approval inventory and both existing replacement signatures remain unchanged', async () => {
 const read = (p: string) => readFileSync(new URL('../../docs/proposals/b1-ceremony-material/' + p, import.meta.url))
 for (const [path, expected] of [['review-only.sql','6454a7551e61e5857ef39090b24b93fcbdb03bb1'],['approval-matrix.json','50590047d35467b2473945731384ae3da5729f28']]) {
  const bytes = read(path)
  assert.equal(createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'), expected)
 }
 const f = fixture()
 await createV4IdentityRepository(f.pool).transaction(async broker => {
  await broker.call('totpMaterial', [raw, C, 'LOGIN'])
  assert.equal(await broker.call('consumeOtp', [raw, C, null, X]), false)
 })
 assert.ok(f.calls.some(c => c.sql === 'SELECT auth_api.totp_material_locked($1::text, $2::uuid, $3::text) AS value'))
 assert.ok(f.calls.some(c => c.sql === 'SELECT auth_api.consume_email_otp($1::text, $2::uuid, $3::bytea, $4::uuid) AS value'))
})
