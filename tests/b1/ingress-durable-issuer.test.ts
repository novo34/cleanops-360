import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { createDurableCandidateIssuer, createDurableCandidateVerifier, credentialCookie, assertionHeader } from '../../lib/b1/ingress-assertion.ts'
import type { DurableIngressCredentials, IngressCredentialRecord } from '../../lib/b1/installation-config.ts'
import { createForwardAuthHandler } from '../../lib/b1/ingress-forward-auth.ts'

test('durable B1 issuer blocks unapproved enrollment; committed credentials work and revocation denies issuance', async () => {
  let time = 100000
  const keys = generateKeyPairSync('ed25519')
  const common = { issuer: 'test', audience: 'https://fixture.invalid', maximumDeviceLifetimeMs: 60000,
    contextLifetimeMs: 1000, maximumBodyBytes: 1024, bodyTimeoutMs: 100, clock: () => time }
  const records = new Map<string, IngressCredentialRecord>()
  let authorized = false
  const credentials: DurableIngressCredentials = {
    async enroll({ record, authorizationReference }) {
      if (!authorized || authorizationReference !== 'fixture-authorized') throw Error('OPERATOR_DENIED')
      records.set(record.id, record)
    },
    async read({ id }) { return records.get(id) ?? null },
    async revoke() { throw Error('not supported') },
    async recover() { throw Error('not supported') },
  }
  const issuer = createDurableCandidateIssuer({ ...common, privateKey: keys.privateKey,
    pseudonymKey: randomBytes(32), credentials })
  const labels = { device: 'Test device', browser: 'Test browser' }
  const enrollment = { reference: 'fixture-only', authorizationReference: 'fixture-authorized' }
  await assert.rejects(issuer.issueDeviceCredential(labels, 30000, enrollment))
  assert.equal(records.size, 0)
  authorized = true
  const credential = await issuer.issueDeviceCredential(labels, 30000, enrollment)
  assert.equal(records.size, 1)
  const record = [...records.values()][0]
  const replaySeen = new Set<string>()
  const verifier = createDurableCandidateVerifier({ ...common, publicKey: keys.publicKey,
    credentials, topology: 'shared-atomic-all-consumers',
    replay: { async claim({ nonce }) { if (replaySeen.has(nonce)) return 'duplicate'; replaySeen.add(nonce); return 'claimed' } } })
  time++
  const request = new Request(common.audience + '/api/auth/login', { method: 'POST',
    headers: { cookie: credentialCookie + '=' + credential }, body: '{}' })
  request.headers.set(assertionHeader, await issuer.issueForAuthenticatedIngress(request, '192.0.2.1'))
  assert.equal((await verifier.resolveRequestContext(request.clone())).labels.device, labels.device)
  records.set(record.id, { ...record, state: 'revoked', revision: '2' })
  await assert.rejects(issuer.issueForAuthenticatedIngress(request.clone(), '192.0.2.1'))
  await assert.rejects(verifier.resolveRequestContext(request.clone()))
  issuer.dispose()
  await assert.rejects(issuer.issueDeviceCredential(labels, 30000, enrollment))
})

test('durable B1 issuer cannot issue a bearer credential when persistence rejects or lies', async () => {
  const keys = generateKeyPairSync('ed25519')
  const common = { issuer: 'test', audience: 'https://fixture.invalid', maximumDeviceLifetimeMs: 60000,
    contextLifetimeMs: 1000, maximumBodyBytes: 1024, bodyTimeoutMs: 100, clock: () => 100000 }
  const blocked: DurableIngressCredentials = {
    async read() { return null },
    async enroll() { throw Error('AUTH_CONFIGURATION_REQUIRED') },
    async revoke() { throw Error('AUTH_CONFIGURATION_REQUIRED') },
    async recover() { throw Error('AUTH_CONFIGURATION_REQUIRED') },
  }
  const issuer = createDurableCandidateIssuer({ ...common, privateKey: keys.privateKey,
    pseudonymKey: randomBytes(32), credentials: blocked })
  await assert.rejects(issuer.issueDeviceCredential({ device: 'Device', browser: 'Browser' },
    30000, { reference: 'not-authority', authorizationReference: 'not-authority' }))
})

test('ForwardAuth accepts durable issuer without any enrollment endpoint or runtime activation', () => {
  const keys = generateKeyPairSync('ed25519')
  const credentials: DurableIngressCredentials = {
    async read() { return null },
    async enroll() { throw Error('AUTH_CONFIGURATION_REQUIRED') },
    async revoke() { throw Error('AUTH_CONFIGURATION_REQUIRED') },
    async recover() { throw Error('AUTH_CONFIGURATION_REQUIRED') },
  }
  const issuer = createDurableCandidateIssuer({
    issuer: 'test', audience: 'https://fixture.invalid', maximumDeviceLifetimeMs: 60000,
    contextLifetimeMs: 1000, maximumBodyBytes: 1024, bodyTimeoutMs: 100,
    clock: () => 100000, privateKey: keys.privateKey,
    pseudonymKey: randomBytes(32), credentials,
  })
  const handler = createForwardAuthHandler({
    issuer, audience: 'https://fixture.invalid',
    proxyCertificateSha256: Array(32).fill('AB').join(':'),
    maximumBodyBytes: 1024, timeoutMs: 100,
  })
  assert.equal(typeof handler, 'function')
  assert.equal(typeof issuer.issueForAuthenticatedIngress, 'function')
})
