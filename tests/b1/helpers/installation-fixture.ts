/** Synthetic reviewed-installation package for tests. Nothing here is an approval:
 * only file ownership metadata of the root-owned private files is simulated, because
 * a non-root test worker cannot chown them. Content, hashes and modes are real.
 */
import { mock } from 'node:test'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, generateKeyPairSync, randomBytes, type KeyObject } from 'node:crypto'
import { rootCertificates } from 'node:tls'
import { numeric } from '../../../lib/b1/config.ts'

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

export type FixtureTls = Readonly<{ cert: Buffer | string; key: Buffer | string; ca: Buffer | string }>
export type FixtureOptions = Readonly<{
  tls?: FixtureTls
  ingress?: Readonly<Record<string, unknown>>
  postgres?: Readonly<{ host: string; port: number }>
}>

const integrationCode = 'export const normalizeEmail = x => x.toLowerCase(); export async function resolveRequestContext() { throw Error("synthetic resolver unavailable"); } export function bindIngress(deps) { if (!deps || !deps.replay || !deps.credentials) throw Error("invalid synthetic binder"); }'

export async function createInstallationFixture(options: FixtureOptions = {}) {
  const dir = await fs.mkdtemp(join(tmpdir(), 'b1-site-'))
  const originalOpen = fs.open.bind(fs)
  const rootOwned = new Set<string>()
  const mocked = mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await originalOpen(...args)
    if ([...rootOwned].some(name => String(args[0]).endsWith('/' + name))) {
      const originalStat = handle.stat.bind(handle)
      handle.stat = (async () => { const s = await originalStat(); return Object.assign(Object.create(Object.getPrototypeOf(s)), s, { uid: 0, gid: 999 }) }) as typeof handle.stat
    }
    return handle
  })
  const source = async (name: string, text: string | Buffer, rootGroupReadOnly = false) => {
    const path = join(dir, name)
    const mode = rootGroupReadOnly ? 0o440 as const : 0o600 as const
    await fs.writeFile(path, text, { mode })
    await fs.chmod(path, mode)
    if (rootGroupReadOnly) rootOwned.add(name)
    const stat = await fs.stat(path)
    return { path, uid: rootGroupReadOnly ? 0 : stat.uid, gid: rootGroupReadOnly ? 999 : stat.gid, mode, maxBytes: 65536 }
  }
  const ca = await source('ca', rootCertificates[0])
  const password = await source('password', 'synthetic-service-only')
  const corpusText = digest('synthetic-disallowed-password') + '\n'
  const corpusSource = await source('corpus', corpusText)
  const dummy = await source('dummy', `$argon2id$v=19$m=${numeric('argon_memory')},t=${numeric('argon_iterations')},p=${numeric('argon_parallelism')}$${Buffer.alloc(numeric('argon_salt'), 1).toString('base64').replace(/=+$/, '')}$${Buffer.alloc(32, 1).toString('base64').replace(/=+$/, '')}`)
  const integration = await source('integration.mjs', integrationCode, true)
  const signer = generateKeyPairSync('ed25519')
  const tls = options.tls ?? { cert: rootCertificates[0], key: rootCertificates[0], ca: rootCertificates[0] }
  const ingress = {
    binding: '127.0.0.1', port: 9443, allowedPaths: ['/forward-auth'],
    issuer: 'fixture-issuer', proxyCertificateSha256: Array(32).fill('AB').join(':'),
    evidenceReference: 'SYNTHETIC TEST ONLY', tlsAuthorizationReference: 'SYNTHETIC TEST ONLY',
    drainTimeoutMs: 1000, contextLifetimeMs: 5000, maximumDeviceLifetimeMs: 86400000,
    maximumBodyBytes: 16384, timeoutMs: 2000,
    sources: {
      tlsCert: await source('ingress.crt', tls.cert, true), tlsKey: await source('ingress.key', tls.key, true),
      clientCa: await source('proxy-ca.crt', tls.ca, true),
      signingKey: await source('ingress-signing.pem', signer.privateKey.export({ type: 'pkcs8', format: 'pem' }), true),
      pseudonymKey: await source('ingress-pseudonym.key', randomBytes(32), true),
    },
    ...options.ingress,
  }
  const manifest = {
    version: 2, origin: 'https://fixture.invalid', internalOrigins: [],
    postgres: { environment: 'staging', host: options.postgres?.host ?? 'db.invalid', port: options.postgres?.port ?? 5432, database: 'fixture', loginRole: 'cleanops_staging_identity_login', contractualRole: 'cleanops_identity_service', maxConnections: 1, connectionTimeoutMs: 1000 },
    bao: { environment: 'staging', mount: 'b1-keys', origin: 'https://bao.invalid', timeoutMs: 1000 },
    catalog: { tenantId: '11111111-1111-4111-8111-111111111111', keys: ['audit-hmac', 'cursor-hmac', 'otp-hmac', 'recovery-hmac', 'totp-aead'].map(purpose => ({ purpose, keyId: 'synthetic', version: 1, ...(purpose === 'totp-aead' ? { keyVersion: 'synthetic-v1' } : {}) })) },
    sources: { postgresPassword: password, postgresCa: ca, baoCa: ca, baoCert: ca, baoKey: ca },
    sink: { path: '/run/cleanops-agent/token', uid: 999, gid: 999, directoryUid: 999, directoryGid: 999, mode: 0o600, directoryMode: 0o700, timeoutMs: 1000 },
    corpus: { version: 'synthetic-v1', sha256: digest(corpusText), source: corpusSource }, dummyPasswordHash: dummy,
    maximumCorpusBytes: 65536, maxEligibleTotpMethods: 2, lifetimeMs: 1000,
    ingress,
    integration: { source: integration, sha256: digest(integrationCode), approval: 'SYNTHETIC TEST ONLY' },
    baoClientIdentity: { scope: 'nextjs-identity-verifier', certificateSha256: digest(rootCertificates[0]), approval: 'SYNTHETIC TEST ONLY' },
  }
  const manifestSource = await source('installation.json', JSON.stringify(manifest))
  return {
    manifest, manifestSource, integration, signingKey: signer.privateKey as KeyObject,
    write: (value: unknown) => fs.writeFile(manifestSource.path, JSON.stringify(value)),
    async cleanup() { mocked.mock.restore(); await fs.rm(dir, { recursive: true, force: true }) },
  }
}
