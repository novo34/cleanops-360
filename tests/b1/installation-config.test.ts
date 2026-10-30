import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareStagingPrivateConfiguration } from '../../lib/b1/installation-config.ts'
import type { PrivateRuntimeConfiguration } from '../../lib/b1/private-runtime.ts'
import type { InstallationKeyCatalog } from '../../lib/b1/installation-catalog.ts'

const tenantId = '5e584fe3-aaa3-4a6b-a97a-30e0d9ab354e'
const catalog: InstallationKeyCatalog = {
  tenantId,
  keys: [
    { purpose: 'audit-hmac', keyId: 'a', version: 1 },
    { purpose: 'cursor-hmac', keyId: 'b', version: 1 },
    { purpose: 'otp-hmac', keyId: 'c', version: 1 },
    { purpose: 'recovery-hmac', keyId: 'd', version: 1 },
    { purpose: 'totp-aead', keyId: 'e', version: 1, keyVersion: 'staging-v1' },
  ],
}
const input = {
  origin: 'https://staging.example.invalid',
  internalOrigins: [] as string[],
  postgres: { environment: 'staging', contractualRole: 'cleanops_identity_service' },
  bao: { environment: 'staging', mount: 'b1-keys' },
} as unknown as Omit<PrivateRuntimeConfiguration, 'references' | 'totpKeys'>

test('staging assembler binds exact catalogue without accessing services or activating HTTP', () => {
  const prepared = prepareStagingPrivateConfiguration(input, catalog)
  assert.equal(prepared.references.audit.tenantId, tenantId)
  assert.equal(prepared.totpKeys[0].keyVersion, 'staging-v1')
  assert.ok(Object.isFrozen(prepared))
})

test('staging assembler rejects wrong environment, mount, role and incomplete catalogue', () => {
  const rejected = (value: unknown, keys = catalog) => assert.throws(
    () => prepareStagingPrivateConfiguration(value as typeof input, keys),
    /INSTALLATION_CONFIG_INVALID|INSTALLATION_CATALOG_INVALID/,
  )
  rejected({ ...input, postgres: { ...input.postgres, environment: 'production' } })
  rejected({ ...input, bao: { ...input.bao, environment: 'production' } })
  rejected({ ...input, bao: { ...input.bao, mount: 'other' } })
  rejected({ ...input, postgres: { ...input.postgres, contractualRole: 'postgres' } })
  rejected({ ...input, origin: 'http://staging.example.invalid' })
  rejected(input, { ...catalog, keys: catalog.keys.slice(0, 4) })
})
