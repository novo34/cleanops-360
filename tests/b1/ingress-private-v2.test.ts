import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createIngressIssuer, assertionHeader } from '../../lib/b1/ingress-assertion.ts'
import { loadReviewedB1Installation, reviewedB1Installation } from '../../lib/b1/reviewed-site-installation.ts'
import { renderB1Integration } from '../../scripts/render-b1-integration.mjs'
import { createInstallationFixture } from './helpers/installation-fixture.ts'
import { checkEmailCompatibility } from '../../lib/b1/email-normalization.ts'
import { renderDurablePrivateIntegration } from '../../lib/b1/integration-candidate.ts'

test('private B1 installation stays closed for a runtime identity other than 999:999', async () => {
  if (process.getuid?.() !== 999 || process.getgid?.() !== 999) {
    assert.equal(await reviewedB1Installation(), undefined)
  }
})

test('reviewed v2 module is closed before binding, binds once and stays closed on rejected binding', async () => {
  const { publicKey } = generateKeyPairSync('ed25519')
  const report = checkEmailCompatibility([{ id: 'fixture', emailNormalized: 'A@example.com' }])
  const source = renderDurablePrivateIntegration(
    new URL('../../lib/b1/integration-candidate.ts', import.meta.url).href,
    { report, approval: { reference: 'fixture-only', policyVersion: report.policyVersion,
      snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false },
    verifier: { issuer: 'fixture', audience: 'https://fixture.invalid',
      contextLifetimeMs: 1000,
      maximumBodyBytes: 1024, bodyTimeoutMs: 100, clock: Date.now,
      publicKey, topology: 'shared-atomic-all-consumers' } })
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  assert.deepEqual(Object.keys(module).sort(), ['bindIngress', 'normalizeEmail', 'resolveRequestContext'])
  assert.equal(module.normalizeEmail('A@EXAMPLE.COM'), 'A@example.com')
  const request = new Request('https://fixture.invalid/api/auth/login')
  await assert.rejects(module.resolveRequestContext(request), /AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.throws(() => module.bindIngress({ replay: {} }), /PRIVATE_MODULE_BINDING_INVALID/)
  assert.throws(() => module.bindIngress({ replay: { claim: async () => 'claimed' } }), /PRIVATE_MODULE_BINDING_ALREADY_ATTEMPTED/)
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
      contextLifetimeMs: 1000,
      maximumBodyBytes: 1024, bodyTimeoutMs: 100, clock: Date.now,
      publicKey, topology: 'shared-atomic-all-consumers' } })
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  let claims = 0
  module.bindIngress({ replay: { async claim() { claims++; return 'claimed' } } })
  await assert.rejects(module.resolveRequestContext(new Request('https://fixture.invalid/api/auth/login')))
  assert.equal(claims, 0)
  assert.throws(() => module.bindIngress({}), /PRIVATE_MODULE_BINDING_ALREADY_ATTEMPTED/)
})

test('render script output loads through the real installation loader and verifies an assertion signed with the manifest parameters', { skip: process.getuid?.() !== 0 && 'root required to set root:999 ownership' }, async () => {
  const fixture = await createInstallationFixture()
  try {
    const dir = dirname(fixture.manifestSource.path)
    // The renderer (and the real loader) require the manifest to be really root:999 0440,
    // exactly as in the deployed package; the fixture's default 0600/current-user file is
    // only valid for non-root tests, which skip this one.
    const manifestSource = { ...fixture.manifestSource, uid: 0, gid: 999, mode: 0o440 as const }
    await fs.chown(manifestSource.path, 0, 999)
    await fs.chmod(manifestSource.path, 0o440)
    const report = checkEmailCompatibility([{ id: 'fixture', emailNormalized: 'A@example.com' }])
    const owned = async (name: string, value: unknown) => {
      const path = join(dir, name)
      await fs.writeFile(path, JSON.stringify(value), { mode: 0o400 })
      const stat = await fs.stat(path)
      return { path, uid: stat.uid, gid: stat.gid, mode: 0o400 as const, maxBytes: 65536 }
    }
    const reportSource = await owned('email-report.json', report)
    const approvalSource = await owned('email-approval.json', { reference: 'fixture-only', policyVersion: report.policyVersion,
      snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false })
    const integration = { path: join(dir, 'integration-rendered.mjs'), uid: 0, gid: 999, mode: 0o440 as const, maxBytes: 65536 }
    const manifest = { ...fixture.manifest, integration: { source: integration, sha256: '0'.repeat(64), approval: 'SYNTHETIC TEST ONLY' } }
    await fixture.write(manifest)
    const factoryUrl = new URL('../../lib/b1/integration-candidate.ts', import.meta.url).href
    const base = { packageDir: dir, manifestSource, report: reportSource, approval: approvalSource, factoryUrl }
    // Refuses mismatched approval, an existing target and anything inside the checkout; writes nothing then.
    await assert.rejects(renderB1Integration({ ...base, approval: await owned('bad.json', { reference: 'x', policyVersion: report.policyVersion, snapshotSha256: '1'.repeat(64), emptyInstallationApproved: false }) }), /B1_INTEGRATION_RENDER_REFUSED/)
    await assert.rejects(fs.stat(integration.path))
    await assert.rejects(renderB1Integration({ ...base, packageDir: new URL('../../', import.meta.url).pathname.replace(/\/$/, '') }), /B1_INTEGRATION_RENDER_REFUSED/)
    const rendered = await renderB1Integration(base)
    assert.equal(rendered.manifestMatches, false)
    const stat = await fs.stat(integration.path)
    assert.deepEqual([stat.uid, stat.gid, stat.mode & 0o7777], [0, 999, 0o440])
    await assert.rejects(renderB1Integration(base), /B1_INTEGRATION_RENDER_REFUSED/) // never overwrites

    await fixture.write({ ...manifest, integration: { ...manifest.integration, sha256: rendered.sha256 } })
    const spec = await loadReviewedB1Installation(manifestSource) // real loader: strict file + sha256 + exact exports
    assert.equal(spec.inputs.normalizeEmail('A@EXAMPLE.COM'), 'A@example.com')
    const claimed = new Set<string>()
    const replay = { claim: async ({ nonce }: { nonce: string }) => claimed.has(nonce) ? 'duplicate' as const : (claimed.add(nonce), 'claimed' as const) }
    // The ingress credential repository is retained (frozen SQL 0003) but no longer consulted.
    const unused = async () => { throw new Error('unused') }
    spec.bindIngress({ replay, credentials: { read: unused, enroll: unused, revoke: unused, recover: unused } })
    // Same values the listener signs with (server-startup.ts), taken from the same manifest.
    const issuer = createIngressIssuer({ issuer: spec.ingress.issuer, audience: new URL(spec.inputs.origin).origin,
      contextLifetimeMs: spec.ingress.contextLifetimeMs,
      maximumBodyBytes: spec.ingress.maximumBodyBytes, bodyTimeoutMs: spec.ingress.timeoutMs, clock: Date.now,
      privateKey: fixture.signingKey, pseudonymKey: Buffer.alloc(32, 7) })
    const signed = async () => {
      const request = new Request('https://fixture.invalid/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' })
      request.headers.set(assertionHeader, await issuer.issueForAuthenticatedIngress(request, '192.0.2.1'))
      return request
    }
    const request = await signed()
    const ok = await spec.requestScope!(request.clone(), async () => { assert.equal(spec.inputs.transport().device.length, 32); return new Response('ok') })
    assert.equal(await ok.text(), 'ok')
    await assert.rejects(spec.requestScope!(request.clone(), async () => new Response('replay'))) // nonce already claimed
    // A request that never went through ForwardAuth carries no assertion and is denied.
    await assert.rejects(spec.requestScope!(new Request('https://fixture.invalid/auth/login', { method: 'POST', body: '{}' }), async () => new Response('x')))
    issuer.dispose()
  } finally { await fixture.cleanup() }
})
