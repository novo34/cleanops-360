import test from 'node:test'
import assert from 'node:assert/strict'
import { TOTP, Secret } from 'otpauth'
import { numeric } from '../../lib/b1/config.ts'
import { prepareTotpEnrollment, openEnrollmentSecret } from '../../lib/b1/ceremony-preparation.ts'

test('D3 candidate SHA256 reproduces RFC6238 vectors at canonical six digits', () => {
 const secret = Secret.fromUTF8('12345678901234567890123456789012')
 const totp = new TOTP({ algorithm: 'SHA256', secret, period: numeric('totp_period'), digits: numeric('totp_digits') })
 const vectors = [[59, '119246'], [1111111109, '084774'], [1111111111, '062674'], [1234567890, '819424'], [2000000000, '698825'], [20000000000, '737706']] as const
 for (const [seconds, expected] of vectors) {
  const timestamp = seconds * 1000
  assert.equal(totp.generate({ timestamp }), expected)
  assert.equal(totp.validate({ token: expected, timestamp, window: numeric('totp_window') }), 0)
 }
 const timestamp = 1234567890_000, token = totp.generate({ timestamp })
 assert.equal(totp.validate({ token, timestamp: timestamp + numeric('totp_period') * 1000, window: numeric('totp_window') }), -1)
 assert.equal(totp.validate({ token, timestamp: timestamp + (numeric('totp_window') + 1) * numeric('totp_period') * 1000, window: numeric('totp_window') }), null)
})
test('D3 candidate is explicit 32-byte CSPRNG and CleanOps 360 URI, not installed policy', () => {
 const subject = { tenantId: '00000000-0000-4000-8000-000000000001', userId: '00000000-0000-4000-8000-000000000002', bindingId: '00000000-0000-4000-8000-000000000003' }
 const key = Buffer.alloc(32, 9)
 const policy = { algorithm: 'SHA256' as const, secretBytes: 32, issuer: 'CleanOps 360', label: 'synthetic-account' }
 const prepared = prepareTotpEnrollment(subject, policy, key, 'synthetic-key')
 const plaintext = openEnrollmentSecret(prepared.ciphertext, key, 'synthetic-key', {
  ...subject, methodId: prepared.methodId, initialMethodVersion: '1', algorithm: prepared.algorithm,
 })
 try {
  assert.equal(plaintext.length, 32)
  const uri = new URL(prepared.provisioningUri)
  assert.equal(uri.searchParams.get('issuer'), 'CleanOps 360')
  assert.ok(decodeURIComponent(uri.pathname).startsWith('/CleanOps 360:'))
  assert.equal(uri.searchParams.get('algorithm'), 'SHA256')
  assert.equal(uri.searchParams.get('period'), String(numeric('totp_period')))
  assert.equal(uri.searchParams.get('digits'), String(numeric('totp_digits')))
  const encoded = uri.searchParams.get('secret')
  assert.ok(encoded)
  assert.equal(encoded.length, 52)
  assert.deepEqual(Buffer.from(Secret.fromBase32(encoded).bytes), Buffer.from(plaintext))
  const genuine = new TOTP({ algorithm: 'SHA256', secret: Secret.fromBase32(encoded), period: numeric('totp_period'), digits: numeric('totp_digits') })
  const timestamp = 1234567890_000, token = genuine.generate({ timestamp })
  assert.equal(genuine.validate({ token, timestamp, window: numeric('totp_window') }), 0)
 } finally { plaintext.fill(0) }
})
