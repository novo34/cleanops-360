import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { createPgDurableCandidateIntegration } from '../../lib/b1/integration-candidate.ts'
import { createCandidateIssuer, assertionHeader, credentialCookie } from '../../lib/b1/ingress-assertion.ts'
import { checkEmailCompatibility } from '../../lib/b1/email-normalization.ts'
import type { IdentityPool } from '../../lib/b1/pg-identity-driver.ts'

test('durable B1 integration borrows one supplied identity pool; unavailable store fails closed', async () => {
  let connects = 0
  const pool: IdentityPool = {
    async connect() { connects++; throw new Error('database unavailable') },
  }
  const keys = generateKeyPairSync('ed25519')
  let clock = 100000
  const common = { issuer: 'fixture', audience: 'https://fixture.invalid',
    maximumDeviceLifetimeMs: 60000, contextLifetimeMs: 1000,
    maximumBodyBytes: 1024, bodyTimeoutMs: 100, clock: () => clock }
  const issuer = createCandidateIssuer({ ...common, privateKey: keys.privateKey,
    pseudonymKey: randomBytes(32) })
  clock++
  const credential = issuer.issueDeviceCredential({ device: 'Test device', browser: 'Test browser' }, 30000)
  const report = checkEmailCompatibility([{ id: 'fixture', emailNormalized: 'A@example.com' }])
  const integration = createPgDurableCandidateIntegration({
    report,
    approval: { reference: 'fixture-review', policyVersion: report.policyVersion,
      snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false },
    verifier: { ...common, publicKey: keys.publicKey, topology: 'shared-atomic-all-consumers' },
    identityPool: pool,
  })
  assert.equal(connects, 0, 'constructing the candidate must not connect')
  assert.equal(integration.normalizeEmail('A@EXAMPLE.COM'), 'A@example.com')
  clock++
  const request = new Request(common.audience + '/api/auth/login', { method: 'POST',
    headers: { cookie: credentialCookie + '=' + credential }, body: '{}' })
  request.headers.set(assertionHeader, await issuer.issueForAuthenticatedIngress(request, '192.0.2.1'))
  await assert.rejects(integration.resolveRequestContext(request), /AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.equal(connects, 1, 'only the supplied pool is consulted')
})
