import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { checkEmailCompatibility } from '../../lib/b1/email-normalization.ts'
import { renderDurablePrivateIntegration } from '../../lib/b1/integration-candidate.ts'

test('reviewed v2 module is closed before binding, binds once and stays closed on rejected binding', async () => {
  const { publicKey } = generateKeyPairSync('ed25519')
  const report = checkEmailCompatibility([{ id: 'fixture', emailNormalized: 'A@example.com' }])
  const source = renderDurablePrivateIntegration(
    new URL('../../lib/b1/integration-candidate.ts', import.meta.url).href,
    { report, approval: { reference: 'fixture-only', policyVersion: report.policyVersion,
      snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false },
    verifier: { issuer: 'fixture', audience: 'https://fixture.invalid',
      maximumDeviceLifetimeMs: 60000, contextLifetimeMs: 1000,
      maximumBodyBytes: 1024, bodyTimeoutMs: 100, clock: Date.now,
      publicKey, topology: 'shared-atomic-all-consumers' } })
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  assert.deepEqual(Object.keys(module).sort(), ['bindIngress', 'normalizeEmail', 'resolveRequestContext'])
  assert.equal(module.normalizeEmail('A@EXAMPLE.COM'), 'A@example.com')
  const request = new Request('https://fixture.invalid/api/auth/login')
  await assert.rejects(module.resolveRequestContext(request), /AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.throws(() => module.bindIngress({ replay: {}, credentials: {} }), /PRIVATE_MODULE_BINDING_INVALID/)
  assert.throws(() => module.bindIngress({ replay: { claim: async () => 'claimed' },
    credentials: { read: async () => null } }), /PRIVATE_MODULE_BINDING_ALREADY_ATTEMPTED/)
  await assert.rejects(module.resolveRequestContext(request), /AUTH_DEPENDENCY_UNAVAILABLE/)
})
test('reviewed v2 module binds valid repositories once but never accepts unsigned requests', async () => {
  const { publicKey } = generateKeyPairSync('ed25519')
  const report = checkEmailCompatibility([{ id: 'fixture', emailNormalized: 'A@example.com' }])
  const source = renderDurablePrivateIntegration(
    new URL('../../lib/b1/integration-candidate.ts', import.meta.url).href,
    { report, approval: { reference: 'fixture-only', policyVersion: report.policyVersion,
      snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false },
    verifier: { issuer: 'fixture', audience: 'https://fixture.invalid',
      maximumDeviceLifetimeMs: 60000, contextLifetimeMs: 1000,
      maximumBodyBytes: 1024, bodyTimeoutMs: 100, clock: Date.now,
      publicKey, topology: 'shared-atomic-all-consumers' } })
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  let claims = 0
  module.bindIngress({ replay: { async claim() { claims++; return 'claimed' } },
    credentials: { async read() { return null } } })
  await assert.rejects(module.resolveRequestContext(new Request('https://fixture.invalid/api/auth/login')))
  assert.equal(claims, 0)
  assert.throws(() => module.bindIngress({}), /PRIVATE_MODULE_BINDING_ALREADY_ATTEMPTED/)
})
