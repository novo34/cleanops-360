import test from 'node:test'
import assert from 'node:assert/strict'
import { createTotpEnrollmentCustody } from '../../lib/b1/enrollment-custody.ts'
import { prepareTotpEnrollment, openEnrollmentSecret } from '../../lib/b1/ceremony-preparation.ts'
import { approvedTotpEnrollmentPolicy } from '../../lib/b1/enrollment-policy.ts'
import type { PrivateKeyReference } from '../../lib/b1/openbao-keys.ts'

const tenantId = '11111111-1111-4111-8111-111111111111'
const reference: PrivateKeyReference = { tenantId, purpose: 'totp-aead', keyId: 'synthetic-key', version: 1 }
const key = Buffer.alloc(32, 7)
const borrowed: PrivateKeyReference[] = []
const borrow = <T>(r: PrivateKeyReference, work: (k: Buffer) => T): T => { borrowed.push(r); return work(key) }

test('enrollment custody writes with the single reviewed TOTP key and a neutral alias', async () => {
  const custody = createTotpEnrollmentCustody([{ keyVersion: 'synthetic-v1', reference }], borrow, 'https://b1.fixture.invalid')
  assert.equal(await custody.accountAlias(), 'b1.fixture.invalid')
  const subject = { tenantId, userId: '22222222-2222-4222-8222-222222222222', bindingId: '33333333-3333-4333-8333-333333333333' }
  const prepared = await custody.withWriteKey(tenantId.toUpperCase(), (k, version) => {
    assert.equal(k, key); assert.equal(version, 'synthetic-v1')
    return prepareTotpEnrollment(subject, { ...approvedTotpEnrollmentPolicy, label: 'b1.fixture.invalid' }, k, version)
  })
  assert.deepEqual(borrowed, [reference])
  assert.equal(prepared.keyVersion, 'synthetic-v1')
  assert.match(prepared.provisioningUri, /^otpauth:\/\/totp\//)
  // The same key and context the runtime's decryptTotp uses must open what enrollment sealed.
  const secret = openEnrollmentSecret(prepared.ciphertext, key, 'synthetic-v1', { tenantId, userId: subject.userId,
    methodId: prepared.methodId, initialMethodVersion: '1', algorithm: prepared.algorithm })
  assert.ok(secret.length >= 16)
  assert.ok(key.equals(Buffer.alloc(32, 7)), 'borrowed key bytes are never wiped or changed by enrollment')
})

test('enrollment custody fails closed on another tenant, several versions, a wrong purpose or a bad key', async () => {
  const other = '99999999-9999-4999-8999-999999999999'
  const one = createTotpEnrollmentCustody([{ keyVersion: 'synthetic-v1', reference }], borrow, 'https://b1.fixture.invalid')
  await assert.rejects(one.withWriteKey(other, () => 1), /AUTH_DEPENDENCY_UNAVAILABLE/)
  const two = createTotpEnrollmentCustody([{ keyVersion: 'a', reference }, { keyVersion: 'b', reference: { ...reference, version: 2 } }], borrow, 'https://b1.fixture.invalid')
  await assert.rejects(two.withWriteKey(tenantId, () => 1), /AUTH_DEPENDENCY_UNAVAILABLE/)
  const none = createTotpEnrollmentCustody([], borrow, 'https://b1.fixture.invalid')
  await assert.rejects(none.withWriteKey(tenantId, () => 1), /AUTH_DEPENDENCY_UNAVAILABLE/)
  const wrong = createTotpEnrollmentCustody([{ keyVersion: 'a', reference: { ...reference, purpose: 'otp-hmac' } }], borrow, 'https://b1.fixture.invalid')
  await assert.rejects(wrong.withWriteKey(tenantId, () => 1), /AUTH_DEPENDENCY_UNAVAILABLE/)
  const short = createTotpEnrollmentCustody([{ keyVersion: 'a', reference }], (_r, work) => work(Buffer.alloc(16)), 'https://b1.fixture.invalid')
  await assert.rejects(short.withWriteKey(tenantId, () => 1), /AUTH_DEPENDENCY_UNAVAILABLE/)
})
