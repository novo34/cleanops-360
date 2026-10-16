import test from 'node:test'
import assert from 'node:assert/strict'
import { TOTP, Secret } from 'otpauth'
import { verifyTotpFactor, type TotpBinding, type TotpRecord, type TotpDependencies, type TotpConsumption } from '../../lib/b1/totp.ts'
import { AuthError, closedBackend } from '../../lib/b1/service.ts'
import { numeric } from '../../lib/b1/config.ts'

// Public RFC 6238 test key, never a deployed credential.
const key = () => new TextEncoder().encode('12345678901234567890')
const timestamp = 1_700_000_010_000
const period = 30_000
const binding: TotpBinding = { userId: 'user-a', tenantId: 'tenant-a', methodId: 'method-a', purpose: 'verifyMfa', ceremonyId: 'ceremony-a' }
const record = (): TotpRecord => ({ binding: { ...binding }, version: 'v1', lastCounter: null, expiresAt: timestamp + 10 * period, algorithm: 'SHA1' })
function token(at = timestamp) {
  const bytes = key()
  const secret = new Secret({ buffer: bytes.buffer })
  try { return TOTP.generate({ secret, algorithm: 'SHA1', digits: 6, period: 30, timestamp: at }) }
  finally { bytes.fill(0); secret.bytes.fill(0) }
}
function fixture(overrides: Partial<TotpRecord> = {}) {
  const state = { value: { ...record(), ...overrides }, plaintexts: [] as Uint8Array[], changes: [] as TotpConsumption[] }
  const deps: TotpDependencies = {
    async readAuthorized() { return { ...state.value, binding: { ...state.value.binding } } },
    async decryptSecret() { const bytes = key(); state.plaintexts.push(bytes); return bytes },
    async consume(change) {
      state.changes.push(change)
      if (change.version !== state.value.version || change.expectedCounter !== state.value.lastCounter) return false
      state.value = { ...state.value, lastCounter: change.nextCounter }
      return true
    },
  }
  return { state, deps }
}
function invalid(result: unknown) {
  assert.ok(result instanceof AuthError)
  assert.equal(result.status, 401)
  assert.equal(result.message, 'AUTH_INVALID')
}
const unavailable = (error: unknown) => error instanceof AuthError && error.status === 503 &&
  error.message === 'AUTH_DEPENDENCY_UNAVAILABLE' && error.cause === undefined
const verify = (code: string, deps: TotpDependencies, context = binding) => verifyTotpFactor(code, context, deps, () => timestamp)

test('RFC 6238 vectors verify using explicit method algorithm and V4 trial settings', async () => {
  assert.deepEqual([numeric('totp_period'), numeric('totp_digits'), numeric('totp_window')], [30, 6, 1])
  const vectors = [
    ['SHA1', '12345678901234567890', '287082'],
    ['SHA256', '12345678901234567890123456789012', '119246'],
    ['SHA512', '1234567890123456789012345678901234567890123456789012345678901234', '693936'],
  ] as const
  for (const [algorithm, ascii, code] of vectors) {
    const f = fixture({ algorithm })
    f.deps.decryptSecret = async () => new TextEncoder().encode(ascii)
    assert.deepEqual(await verifyTotpFactor(code, binding, f.deps, () => 59_000), { verified: true })
    assert.equal(f.state.changes[0].nextCounter, 1)
  }
})

test('current and adjacent windows pass; expired/future-outside-window and malformed codes fail', async () => {
  for (const delta of [-1, 0, 1]) {
    const f = fixture()
    assert.deepEqual(await verify(token(timestamp + delta * period), f.deps), { verified: true })
    assert.equal(f.state.value.lastCounter, Math.floor(timestamp / period) + delta)
    assert.ok(f.state.plaintexts.every(bytes => bytes.every(value => value === 0)))
  }
  for (const bad of [token(timestamp - 2 * period), token(timestamp + 2 * period), '', '12345', '1234567', 'abcdef', '１２３４５６', ' 123456']) {
    const f = fixture()
    invalid(await verify(bad, f.deps))
    assert.equal(f.state.changes.length, 0)
  }
  const f = fixture()
  const valid = token(), wrong = (valid[0] === '9' ? '0' : '9') + valid.slice(1)
  invalid(await verify(wrong, f.deps))
  assert.equal(f.state.changes.length, 0)
})

test('authorization binds user, tenant, method, purpose and ceremony before secret access', async () => {
  for (const field of ['userId', 'tenantId', 'methodId', 'purpose', 'ceremonyId'] as const) {
    const f = fixture()
    invalid(await verify(token(), f.deps, { ...binding, [field]: 'other' }))
    assert.equal(f.state.plaintexts.length, 0)
    assert.equal(f.state.changes.length, 0)
  }
  for (const expiresAt of [timestamp, timestamp - 1, NaN]) {
    const f = fixture({ expiresAt })
    invalid(await verify(token(), f.deps))
    assert.equal(f.state.plaintexts.length, 0)
  }
  const f = fixture()
  f.deps.readAuthorized = async () => null
  invalid(await verify(token(), f.deps))
})

test('counter is monotonic: used codes and older windows never succeed again', async () => {
  const f = fixture()
  assert.deepEqual(await verify(token(timestamp + period), f.deps), { verified: true })
  invalid(await verify(token(timestamp + period), f.deps))
  invalid(await verify(token(), f.deps))
  assert.equal(f.state.changes.length, 1)
})

test('simultaneous valid proofs race on persistent CAS; exactly one succeeds', async () => {
  const f = fixture()
  const results = await Promise.all([verify(token(), f.deps), verify(token(), f.deps)])
  assert.equal(results.filter(value => !(value instanceof AuthError)).length, 1)
  assert.equal(results.filter(value => value instanceof AuthError).length, 1)
  assert.equal(f.state.changes.length, 2)
  assert.equal(f.state.value.lastCounter, Math.floor(timestamp / period))
  for (const change of f.state.changes) {
    assert.deepEqual(change.binding, binding)
    assert.equal(change.version, 'v1')
    assert.equal(change.expectedCounter, null)
    assert.equal(change.verifiedAt, timestamp)
  }
})

test('a consumed method counter cannot be reused across purposes or ceremonies', async () => {
  const f = fixture()
  assert.deepEqual(await verify(token(), f.deps), { verified: true })
  const next = { ...binding, purpose: 'stepUp', ceremonyId: 'ceremony-b' }
  f.state.value = { ...f.state.value, binding: next }
  invalid(await verify(token(), f.deps, next))
  assert.equal(f.state.changes.length, 1)
})

test('CAS rejection, revocation/version race and persistence errors never produce a proof', async () => {
  const f = fixture()
  f.deps.consume = async () => false
  invalid(await verify(token(), f.deps))
  const g = fixture()
  g.deps.decryptSecret = async () => { g.state.value = { ...g.state.value, version: 'revoked-v2' }; return key() }
  invalid(await verify(token(), g.deps))
  for (const stage of ['readAuthorized', 'decryptSecret', 'consume'] as const) {
    const h = fixture()
    h.deps[stage] = async () => { throw new Error('secret=' + token()) }
    await assert.rejects(verify(token(), h.deps), unavailable)
    assert.ok(h.state.plaintexts.every(bytes => bytes.every(value => value === 0)))
  }
})

test('clock/decryption delay cannot extend ceremony or code validity', async () => {
  for (const later of [timestamp + 2 * period, timestamp - 1, NaN]) {
    const f = fixture()
    let calls = 0
    const task = verifyTotpFactor(token(), binding, f.deps, () => calls++ === 0 ? timestamp : later)
    if (later < timestamp || Number.isNaN(later)) await assert.rejects(task, unavailable)
    else invalid(await task)
    assert.equal(f.state.changes.length, 0)
    assert.ok(f.state.plaintexts.every(bytes => bytes.every(value => value === 0)))
  }
  const f = fixture({ expiresAt: timestamp + 1 })
  let calls = 0
  invalid(await verifyTotpFactor(token(), binding, f.deps, () => timestamp + calls++))
  assert.equal(f.state.changes.length, 0)
})

test('corrupt method/secret fails closed, plaintext is wiped, and runtime stays closed', async () => {
  for (const lastCounter of [-1, NaN, 1.5]) {
    await assert.rejects(verify(token(), fixture({ lastCounter }).deps), unavailable)
  }
  const f = fixture()
  const short = new Uint8Array([1, 2, 3])
  f.deps.decryptSecret = async () => short
  await assert.rejects(verify(token(), f.deps), unavailable)
  assert.ok(short.every(value => value === 0))
  await assert.rejects(closedBackend.bootstrap('unused', 'unused', timestamp), unavailable)
})

test('caller context is snapshotted before asynchronous authorization', async () => {
  const f = fixture()
  const mutable = { ...binding }
  f.deps.readAuthorized = async captured => {
    mutable.tenantId = 'mutated'
    assert.ok(Object.isFrozen(captured))
    return record()
  }
  assert.deepEqual(await verify(token(), f.deps, mutable), { verified: true })
  assert.equal(f.state.changes[0].binding.tenantId, 'tenant-a')
})
