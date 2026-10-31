import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { rootCertificates } from 'node:tls'
import { loadReviewedB1Installation, reviewedB1Installation } from '../../lib/b1/reviewed-site-installation.ts'
import { assembleInstallationPrivateInputs } from '../../lib/b1/installation-bootstrap.ts'
import { selectAuthBackend } from '../../lib/b1/private-runtime.ts'
import { numeric } from '../../lib/b1/config.ts'

const digest = (x: string | Buffer) => createHash('sha256').update(x).digest('hex')
test('reviewed private package loads real files and composes canonical runtime without connecting services', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'b1-site-'))
  const originalOpen = fs.open.bind(fs)
  // Only metadata is simulated: a non-root test worker cannot chown reviewed code.
  const mocked = mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await originalOpen(...args)
    if (String(args[0]).endsWith('/integration.mjs')) {
      const originalStat = handle.stat.bind(handle)
      handle.stat = (async () => { const s = await originalStat(); return Object.assign(Object.create(Object.getPrototypeOf(s)), s, { uid: 0, gid: 999 }) }) as typeof handle.stat
    }
    return handle
  })
  try {
    const source = async (name: string, text: string | Buffer) => {
      const path = join(dir, name)
      const mode = name === 'integration.mjs' ? 0o440 as const : 0o600 as const
      await fs.writeFile(path, text, { mode })
      await fs.chmod(path, mode)
      const s = await fs.stat(path)
      return { path, uid: s.uid, gid: s.gid, mode, maxBytes: 65536 }
    }
    const ca = await source('ca', rootCertificates[0])
    const password = await source('password', 'synthetic-service-only')
    const corpusText = digest('synthetic-disallowed-password') + '\n'
    const corpusSource = await source('corpus', corpusText)
    const dummy = await source('dummy', `$argon2id$v=19$m=${numeric('argon_memory')},t=${numeric('argon_iterations')},p=${numeric('argon_parallelism')}$${Buffer.alloc(numeric('argon_salt'), 1).toString('base64').replace(/=+$/, '')}$${Buffer.alloc(32, 1).toString('base64').replace(/=+$/, '')}`)
    const code = 'export const normalizeEmail = x => x.toLowerCase(); export async function resolveRequestContext() { throw Error("synthetic resolver unavailable"); }'
    const integration = { ...await source('integration.mjs', code), uid: 0, gid: 999 }
    const manifest = {
      version: 1, origin: 'https://fixture.invalid', internalOrigins: [],
      postgres: { environment: 'staging', host: 'db.invalid', port: 5432, database: 'fixture', loginRole: 'cleanops_staging_identity_login', contractualRole: 'cleanops_identity_service', maxConnections: 1, connectionTimeoutMs: 1000 },
      bao: { environment: 'staging', mount: 'b1-keys', origin: 'https://bao.invalid', timeoutMs: 1000 },
      catalog: { tenantId: '11111111-1111-4111-8111-111111111111', keys: ['audit-hmac','cursor-hmac','otp-hmac','recovery-hmac','totp-aead'].map(purpose => ({ purpose, keyId: 'synthetic', version: 1, ...(purpose === 'totp-aead' ? { keyVersion: 'synthetic-v1' } : {}) })) },
      sources: { postgresPassword: password, postgresCa: ca, baoCa: ca, baoCert: ca, baoKey: ca },
      sink: { path: '/run/cleanops-agent/token', uid: 999, gid: 999, directoryUid: 999, directoryGid: 999, mode: 0o600, directoryMode: 0o700, timeoutMs: 1000 },
      corpus: { version: 'synthetic-v1', sha256: digest(corpusText), source: corpusSource }, dummyPasswordHash: dummy,
      maximumCorpusBytes: 65536, maxEligibleTotpMethods: 2, lifetimeMs: 1000,
      integration: { source: integration, sha256: digest(code), approval: 'SYNTHETIC TEST ONLY' },
      baoClientIdentity: { scope: 'nextjs-identity-verifier', certificateSha256: digest(rootCertificates[0]), approval: 'SYNTHETIC TEST ONLY' },
    }
    const m = await source('installation.json', JSON.stringify(manifest))
    const spec = await loadReviewedB1Installation(m)
    assert.equal(spec.inputs.normalizeEmail('USER@example.invalid'), 'user@example.invalid')
    assert.throws(spec.inputs.transport, /AUTH_DEPENDENCY_UNAVAILABLE/)
    const prepared = await assembleInstallationPrivateInputs(spec)
    const selected = selectAuthBackend({ kind: 'private', configuration: prepared.configuration })
    await selected.close()
    prepared.dispose()
    assert.ok(prepared.configuration.bao.key.every(x => x === 0))
    // The pinned TLS certificate is checked again at assembly time.
    await assert.rejects(assembleInstallationPrivateInputs({ ...spec, baoCertificateSha256: '0'.repeat(64) }), /INSTALLATION_CERTIFICATE_NOT_APPROVED/)
    for (const patch of [
      { version: 2 }, { extra: true }, { lifetimeMs: 30001 }, { maxEligibleTotpMethods: 0 },
      { postgres: { ...manifest.postgres, loginRole: 'cleanops_bootstrap' } },
      { baoClientIdentity: { ...manifest.baoClientIdentity, approval: '' } },
      { integration: { ...manifest.integration, sha256: '0'.repeat(64) } },
      { integration: { ...manifest.integration, source: { ...integration, uid: 999 } } },
      { corpus: { ...manifest.corpus, sha256: '0'.repeat(64) } },
      { catalog: { ...manifest.catalog, keys: manifest.catalog.keys.slice(0, 4) } },
      { sink: { ...manifest.sink, uid: 0 } },
    ]) {
      await fs.writeFile(m.path, JSON.stringify({ ...manifest, ...patch }))
      await assert.rejects(loadReviewedB1Installation(m), /INSTALLATION_CONFIG_INVALID/)
    }
    await fs.writeFile(m.path, await fs.readFile(new URL('../../deploy/staging/b1-installation.example.json', import.meta.url)))
    await assert.rejects(loadReviewedB1Installation(m), /INSTALLATION_CONFIG_INVALID/)
    spec.inputs.corpus.content.fill(0)
  } finally { mocked.mock.restore(); await fs.rm(dir, { recursive: true, force: true }) }
})

test('missing private mount leaves installation absent despite environment selectors', async () => {
  const old = process.env.CLEANOPS_AUTH_BACKEND
  try {
    process.env.CLEANOPS_AUTH_BACKEND = 'private'
    assert.equal(await reviewedB1Installation(), undefined)
    await assert.rejects(loadReviewedB1Installation({ path: '/missing-b1-installation', uid: 0, gid: 999, mode: 0o440, maxBytes: 65536 }), /PRIVATE_FILE_UNAVAILABLE/)
  } finally { if (old === undefined) delete process.env.CLEANOPS_AUTH_BACKEND; else process.env.CLEANOPS_AUTH_BACKEND = old }
})
