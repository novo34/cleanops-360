import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { createCandidateIssuer, createDurableCandidateVerifier, assertionHeader, credentialCookie } from '../../lib/b1/ingress-assertion.ts'
import type { IngressCredentialRecord } from '../../lib/b1/installation-config.ts'

test('durable B1 verifier requires active persisted credential and one shared claim', async () => {
  let clock = 100000
  const keys = generateKeyPairSync('ed25519')
  const common = { issuer: 'test-ingress', audience: 'https://fixture.invalid',
    maximumDeviceLifetimeMs: 60000, contextLifetimeMs: 1000,
    maximumBodyBytes: 1024, bodyTimeoutMs: 200, clock: () => clock }
  const issuer = createCandidateIssuer({ ...common, privateKey: keys.privateKey, pseudonymKey: randomBytes(32) })
  clock++
  const credential = issuer.issueDeviceCredential({ device: 'Test profile', browser: 'Test browser' }, 30000)
  const payload = JSON.parse(Buffer.from(credential.split('.')[1], 'base64url').toString('utf8')) as {
    iss: string; aud: string; id: string; iat: number; exp: number
  }
  const record: IngressCredentialRecord = {
    issuer: payload.iss, audience: payload.aud, id: payload.id,
    issuedAt: payload.iat, expiresAt: payload.exp, revision: '1',
    state: 'active', enrollmentReference: 'test-only',
  }
  let current: IngressCredentialRecord | null = null
  const claims = new Set<string>()
  const replay = { async claim(input: {nonce: string}) {
    if (claims.has(input.nonce)) return 'duplicate' as const
    claims.add(input.nonce)
    return 'claimed' as const
  } }
  const credentials = { async read() { return current } }
  const makeVerifier = () => createDurableCandidateVerifier({ ...common,
    publicKey: keys.publicKey, replay, credentials, topology: 'shared-atomic-all-consumers' })
  const verifier = makeVerifier()
  clock++
  const request = new Request(common.audience + '/api/auth/login', {
    method: 'POST', headers: { cookie: credentialCookie + '=' + credential }, body: '{}',
  })
  const token = await issuer.issueForAuthenticatedIngress(request, '192.0.2.1')
  request.headers.set(assertionHeader, token)
  await assert.rejects(verifier.resolveRequestContext(request.clone()))
  current = record
  assert.equal((await verifier.resolveRequestContext(request.clone())).device.length, 32)
  await assert.rejects(makeVerifier().resolveRequestContext(request.clone()))
  current = { ...record, state: 'revoked' }
  const next = request.clone()
  next.headers.set(assertionHeader, await issuer.issueForAuthenticatedIngress(
    new Request(common.audience + '/api/auth/login', { method: 'POST',
      headers: { cookie: credentialCookie + '=' + credential }, body: '{}' }), '192.0.2.1'))
  await assert.rejects(verifier.resolveRequestContext(next))
  current = record
  const unavailable = { async read(): Promise<IngressCredentialRecord | null> { throw Error('db unavailable') } }
  await assert.rejects(createDurableCandidateVerifier({ ...common,
    publicKey: keys.publicKey, replay, credentials: unavailable,
    topology: 'shared-atomic-all-consumers' }).resolveRequestContext(request.clone()))
})
