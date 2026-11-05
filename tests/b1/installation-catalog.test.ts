import test from 'node:test'
import assert from 'node:assert/strict'
import { validateInstallationKeys, type InstallationKeyCatalog } from '../../lib/b1/installation-catalog.ts'

const tenantId = '5e584fe3-aaa3-4a6b-a97a-30e0d9ab354e'
const valid = (): InstallationKeyCatalog => ({
  tenantId,
  keys: [
    { purpose: 'audit-hmac', keyId: '3905dd59832049d9a85dd252dbacadce', version: 1 },
    { purpose: 'cursor-hmac', keyId: '8e3190ce79b64d2fb751459463de971c', version: 1 },
    { purpose: 'otp-hmac', keyId: '1b478c5e5583492e96a1d3b3c7ef4388', version: 1 },
    { purpose: 'recovery-hmac', keyId: '0567245908624e86b7ad8d610aa34274', version: 1 },
    { purpose: 'totp-aead', keyId: '91165cb4b08946b1a4d9ec6a097678c7', version: 1, keyVersion: 'staging-v1' },
  ],
})

test('installation catalog produces exact tenant-scoped immutable references', () => {
  const result = validateInstallationKeys(valid())
  assert.equal(result.references.audit.tenantId, tenantId)
  assert.equal(result.references.recovery.version, 1)
  assert.equal(result.totpKeys[0].reference.purpose, 'totp-aead')
  assert.equal(result.totpKeys[0].keyVersion, 'staging-v1')
  assert.ok(Object.isFrozen(result.references))
  assert.ok(Object.isFrozen(result.totpKeys))
})

test('installation catalog rejects missing, duplicate and inconsistent key references', () => {
  const base = valid()
  const reject = (input: unknown) => assert.throws(
    () => validateInstallationKeys(input as InstallationKeyCatalog), /INSTALLATION_CATALOG_INVALID/,
  )
  reject({ ...base, tenantId: 'wrong' })
  reject({ ...base, keys: base.keys.slice(0, 4) })
  reject({ ...base, keys: [...base.keys.slice(0, 4), base.keys[0]] })
  reject({ ...base, keys: base.keys.map((x, i) => i === 0 ? { ...x, version: 0 } : x) })
  reject({ ...base, keys: base.keys.map((x, i) => i === 0 ? { ...x, keyVersion: 'unapproved' } : x) })
  reject({ ...base, keys: base.keys.map((x, i) => i === 4 ? { ...x, keyVersion: undefined } : x) })
})
