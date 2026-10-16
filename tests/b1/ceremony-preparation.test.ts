import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { Secret } from 'otpauth'
import { canonical } from '../../lib/b1/contracts.ts'
import { numeric } from '../../lib/b1/config.ts'
import { sessionPolicyForRisk, selectEnabledMethod, prepareTotpEnrollment, openEnrollmentSecret, sealEnrollmentSecret, prepareEmailOtp, emailOtpDigest } from '../../lib/b1/ceremony-preparation.ts'

const tenantId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
const bindingId = '00000000-0000-4000-8000-000000000003'
const other = '00000000-0000-4000-8000-000000000004'
const key = Buffer.alloc(32, 7)
test('risk durations use existing V4 values and never default', () => {
  assert.deepEqual(sessionPolicyForRisk('SENSITIVE'), { absoluteSeconds: numeric('absolute_sensitive'), idleSeconds: numeric('idle_sensitive') })
  assert.deepEqual(sessionPolicyForRisk('OPERATIONAL'), { absoluteSeconds: numeric('absolute_operational'), idleSeconds: numeric('idle_operational') })
  for (const risk of [null, undefined, '', 'ADMIN']) assert.throws(() => sessionPolicyForRisk(risk))
})
test('method selection rejects ambiguity, absent selections and duplicates', () => {
  const first = { id: userId, kind: 'TOTP' as const, version: '2' }
  const second = { id: other, kind: 'EMAIL_OTP' as const, version: '1' }
  assert.deepEqual(selectEnabledMethod([first]), first)
  assert.deepEqual(selectEnabledMethod([first, second], other), second)
  assert.throws(() => selectEnabledMethod([]))
  assert.throws(() => selectEnabledMethod([first, second]))
  assert.throws(() => selectEnabledMethod([first], other))
  assert.throws(() => selectEnabledMethod([first, first]))
})
test('method identity exists before authenticated encryption; URI matches encrypted secret', () => {
  const prepared = prepareTotpEnrollment({ tenantId, userId, bindingId },
    { algorithm: 'SHA256', secretBytes: 20, issuer: 'Unit test', label: 'synthetic' }, key, 'test-key')
  const context = { tenantId, userId, methodId: prepared.methodId, initialMethodVersion: prepared.initialVersion }
  const plaintext = openEnrollmentSecret(prepared.ciphertext, key, 'test-key', context)
  try {
    const secret = new URL(prepared.provisioningUri).searchParams.get('secret')
    assert.ok(secret)
    assert.deepEqual(Buffer.from(plaintext), Buffer.from(Secret.fromBase32(secret).bytes))
    assert.equal(new URL(prepared.provisioningUri).searchParams.get('algorithm'), 'SHA256')
    assert.equal(prepared.initialVersion, '1')
    assert.notEqual(prepared.methodId, bindingId)
    // Mutable state/CAS version is deliberately not an encryption context input.
    assert.deepEqual(openEnrollmentSecret(prepared.ciphertext, key, 'test-key', context), plaintext)
  } finally { plaintext.fill(0) }
})
test('AEAD rejects tampering and cross-tenant/user/method/key replay', () => {
  const context = { tenantId, userId, methodId: bindingId, initialMethodVersion: '1' as const }
  const secret = Buffer.alloc(20, 9)
  const envelope = sealEnrollmentSecret(secret, key, 'test-key', context)
  assert.notDeepEqual(envelope, sealEnrollmentSecret(secret, key, 'test-key', context))
  for (const index of [0, 1, 13, 29, envelope.length - 1]) {
    const damaged = Buffer.from(envelope); damaged[index] ^= 1
    assert.throws(() => openEnrollmentSecret(damaged, key, 'test-key', context))
  }
  for (const field of ['tenantId', 'userId', 'methodId'] as const) {
    assert.throws(() => openEnrollmentSecret(envelope, key, 'test-key', { ...context, [field]: other }))
  }
  assert.throws(() => openEnrollmentSecret(envelope, Buffer.alloc(32, 8), 'test-key', context))
  assert.throws(() => openEnrollmentSecret(envelope, key, 'different-key-version', context))
  assert.throws(() => openEnrollmentSecret(Buffer.alloc(0), key, 'test-key', context))
})
test('EMAIL OTP uses approved verifier HMAC domain and binding', () => {
  const prepared = prepareEmailOtp(bindingId, key)
  assert.match(prepared.code, new RegExp('^[0-9]{' + numeric('otp_digits') + '}$'))
  assert.deepEqual(prepared.proofDigest, createHmac('sha256', key).update(canonical(['EMAIL_OTP', bindingId, prepared.code])).digest())
  assert.notDeepEqual(prepared.proofDigest, emailOtpDigest(prepared.code, other, key))
  assert.throws(() => prepareEmailOtp('browser-controlled-selection', key))
  assert.throws(() => prepareEmailOtp(bindingId, Buffer.alloc(0)))
})
