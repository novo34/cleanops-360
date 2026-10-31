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
  origin: 'https://staging.example.invalid/',
  internalOrigins: [] as string[],
  postgres: { environment: 'staging', contractualRole: 'cleanops_identity_service', host: 'db.invalid', port: 5432, database: 'identity', loginRole: 'identity_runtime', ca: Buffer.from('test'), password: async () => 'synthetic', maxConnections: 1, connectionTimeoutMs: 1000 },
  bao: { environment: 'staging', mount: 'b1-keys', origin: 'https://bao.invalid/', ca: Buffer.from('test'), cert: Buffer.from('test'), key: Buffer.from('test'), timeoutMs: 1000 },
  sink: { path: '/run/cleanops-agent/token', uid: 999, gid: 999, directoryUid: 999, directoryGid: 999, mode: 0o600, directoryMode: 0o700, timeoutMs: 1000 },
  corpus: { version: 'synthetic', sha256: '0'.repeat(64), content: Buffer.from('synthetic') },
  dummyPasswordHash: 'synthetic', lifetimeMs: 1000, maxEligibleTotpMethods: 1,
  passwordPolicy: { minimumCodePoints: 12, maximumCodePoints: 128, maximumCorpusBytes: 65 },
  normalizeEmail: (email: string) => email.toLowerCase(),
  transport: () => ({ network: Buffer.alloc(32), device: Buffer.alloc(32) }),
  sessionLabels: () => ({ device: 'Synthetic', browser: 'Synthetic' }),
} as unknown as Omit<PrivateRuntimeConfiguration, 'references' | 'totpKeys'>

test('staging assembler binds exact catalogue without accessing services or activating HTTP', () => {
  const prepared = prepareStagingPrivateConfiguration(input, catalog)
  assert.equal(prepared.references.audit.tenantId, tenantId)
  assert.equal(prepared.totpKeys[0].keyVersion, 'staging-v1')
  assert.ok(Object.isFrozen(prepared))
  assert.equal(prepareStagingPrivateConfiguration({ ...input, origin: 'https://cleanops.nuvurent.com' }, catalog).origin, 'https://cleanops.nuvurent.com')
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
  rejected({ ...input, origin: 'https://staging.example.invalid@evil.invalid/' })
  rejected({ ...input, bao: { ...input.bao, origin: 'https://evil.invalid/path' } })
  rejected({ ...input, transport: undefined })
  rejected({ ...input, postgres: { environment: 'staging', contractualRole: 'cleanops_identity_service' } })
  rejected(input, { ...catalog, keys: catalog.keys.slice(0, 4) })
})
