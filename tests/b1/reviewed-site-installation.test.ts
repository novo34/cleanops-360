import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { loadReviewedB1Installation, reviewedB1Installation } from '../../lib/b1/reviewed-site-installation.ts'
import { assembleInstallationPrivateInputs } from '../../lib/b1/installation-bootstrap.ts'
import { selectAuthBackend } from '../../lib/b1/private-runtime.ts'
import { createInstallationFixture } from './helpers/installation-fixture.ts'
import { rootCertificates } from 'node:tls'

test('reviewed private package loads real files and composes canonical runtime without connecting services', async () => {
  const f = await createInstallationFixture()
  const { manifest, manifestSource: m, integration } = f
  try {
    const spec = await loadReviewedB1Installation(m)
    assert.equal(spec.inputs.normalizeEmail('USER@example.invalid'), 'user@example.invalid')
    assert.throws(spec.inputs.transport, /AUTH_DEPENDENCY_UNAVAILABLE/)
    assert.equal(spec.ingress.binding, '127.0.0.1')
    const prepared = await assembleInstallationPrivateInputs(spec)
    assert.equal(typeof spec.bindIngress, 'function')
    assert.equal(prepared.ingress.signingKey.asymmetricKeyType, 'ed25519')
    assert.equal(prepared.ingress.pseudonymKey.length, 32)
    const selected = selectAuthBackend({ kind: 'private', configuration: prepared.configuration }, spec.bindIngress)
    await selected.close()
    prepared.dispose()
    assert.ok(prepared.configuration.bao.key.every(x => x === 0))
    assert.ok(prepared.ingress.tls.key.every(x => x === 0) && prepared.ingress.pseudonymKey.every(x => x === 0))
    // The pinned TLS certificate is checked again at assembly time.
    await assert.rejects(assembleInstallationPrivateInputs({ ...spec, baoCertificateSha256: '0'.repeat(64) }), /INSTALLATION_CERTIFICATE_NOT_APPROVED/)
    const { ingress } = manifest
    const { ingress: omitted, ...withoutIngress } = manifest
    assert.ok(omitted)
    for (const patch of [
      { version: 1 }, { version: 3 }, { extra: true }, { lifetimeMs: 30001 }, { maxEligibleTotpMethods: 0 },
      { postgres: { ...manifest.postgres, loginRole: 'cleanops_bootstrap' } },
      { baoClientIdentity: { ...manifest.baoClientIdentity, approval: '' } },
      { integration: { ...manifest.integration, sha256: '0'.repeat(64) } },
      { integration: { ...manifest.integration, source: { ...integration, uid: 999 } } },
      { corpus: { ...manifest.corpus, sha256: '0'.repeat(64) } },
      { catalog: { ...manifest.catalog, keys: manifest.catalog.keys.slice(0, 4) } },
      { sink: { ...manifest.sink, uid: 0 } },
      // The ingress is reviewed data with the same strict private-file contract.
      { ingress: { ...ingress, extra: true } },
      { ingress: { ...ingress, sources: { ...ingress.sources, signingKey: { ...ingress.sources.signingKey, uid: 999 } } } },
      { ingress: { ...ingress, sources: { ...ingress.sources, tlsKey: { ...ingress.sources.tlsKey, mode: 0o600 } } } },
      { ingress: { ...ingress, sources: { ...ingress.sources, pseudonymKey: undefined } } },
    ]) {
      await f.write({ ...manifest, ...patch })
      await assert.rejects(loadReviewedB1Installation(m), /INSTALLATION_CONFIG_INVALID/)
    }
    await f.write(withoutIngress)
    await assert.rejects(loadReviewedB1Installation(m), /INSTALLATION_CONFIG_INVALID/)
    await fs.writeFile(m.path, await fs.readFile(new URL('../../deploy/staging/b1-installation.example.json', import.meta.url)))
    await assert.rejects(loadReviewedB1Installation(m), /INSTALLATION_CONFIG_INVALID/)
    spec.inputs.corpus.content.fill(0)
  } finally { await f.cleanup() }
})

test('ingress signer and pseudonym material are validated before any runtime is composed', async () => {
  for (const sources of [
    { signingKey: rootCertificates[0] },        // not a private key
    { pseudonymKey: 'x'.repeat(31) },           // not exactly 32 bytes
  ]) {
    const f = await createInstallationFixture()
    try {
      const spec = await loadReviewedB1Installation(f.manifestSource)
      const [[name, content]] = Object.entries(sources)
      // This fixture intentionally enforces 0440 on disk. The test worker is
      // non-root in Linux CI, so temporarily unlock ONLY the synthetic file
      // before injecting malformed bytes; restore the strict contract afterwards.
      const sourcePath = spec.ingress.sources[name as keyof typeof spec.ingress.sources].path
      await fs.chmod(sourcePath, 0o600)
      try { await fs.writeFile(sourcePath, content) }
      finally { await fs.chmod(sourcePath, 0o440) }
      await assert.rejects(assembleInstallationPrivateInputs(spec), /^Error: INSTALLATION_CONFIG_INVALID$/)
      spec.inputs.corpus.content.fill(0)
    } finally { await f.cleanup() }
  }
})

test('missing private mount leaves installation absent despite environment selectors', async () => {
  const old = process.env.CLEANOPS_AUTH_BACKEND
  try {
    process.env.CLEANOPS_AUTH_BACKEND = 'private'
    assert.equal(await reviewedB1Installation(), undefined)
    await assert.rejects(loadReviewedB1Installation({ path: '/missing-b1-installation', uid: 0, gid: 999, mode: 0o440, maxBytes: 65536 }), /PRIVATE_FILE_UNAVAILABLE/)
  } finally { if (old === undefined) delete process.env.CLEANOPS_AUTH_BACKEND; else process.env.CLEANOPS_AUTH_BACKEND = old }
})
