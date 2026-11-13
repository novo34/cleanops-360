/** Pure assembly of private installation inputs; never selects an HTTP backend. */
import type { PrivateRuntimeConfiguration } from './private-runtime.ts'
import type { InstallationKeyCatalog } from './installation-catalog.ts'
import { prepareStagingPrivateConfiguration } from './installation-config.ts'
import { createPrivatePgPassword, loadPrivateTls } from './private-material.ts'
import { createHash, createPrivateKey, type KeyObject } from 'node:crypto'
import { readTrustedPrivateFile, type PrivateFileSource } from './private-file.ts'
import type { InstallationRequestScope } from './installation-context.ts'
import type { B1IngressPoolBinder } from './private-runtime.ts'

type Pg = PrivateRuntimeConfiguration['postgres']
type Bao = PrivateRuntimeConfiguration['bao']
type Inputs = Omit<PrivateRuntimeConfiguration, 'postgres' | 'bao' | 'references' | 'totpKeys'>

export type InstallationPrivateSources = Readonly<{
  postgresPassword: PrivateFileSource
  postgresCa: PrivateFileSource
  baoCa: PrivateFileSource
  baoCert: PrivateFileSource
  baoKey: PrivateFileSource
}>
/** Reviewed internal mTLS ingress (Traefik ForwardAuth peer). Data only: it never
 * selects code. Semantics are validated once by prepareB1IngressListenerPlan.
 */
export type InstallationIngressInputs = Readonly<{
  binding: string; port: number; allowedPaths: readonly string[]
  issuer: string; proxyCertificateSha256: string
  evidenceReference: string; tlsAuthorizationReference: string
  drainTimeoutMs: number; contextLifetimeMs: number; maximumDeviceLifetimeMs: number
  maximumBodyBytes: number; timeoutMs: number
  sources: Readonly<{
    tlsCert: PrivateFileSource; tlsKey: PrivateFileSource; clientCa: PrivateFileSource
    signingKey: PrivateFileSource; pseudonymKey: PrivateFileSource
  }>
}>
export type InstallationBootstrapInputs = Readonly<{
  inputs: Inputs
  postgres: Omit<Pg, 'ca' | 'password'>
  bao: Omit<Bao, 'ca' | 'cert' | 'key'>
  catalog: InstallationKeyCatalog
  sources: InstallationPrivateSources
  /** Optional for existing private callers; the site loader always supplies it. */
  requestScope?: InstallationRequestScope
  /** Borrows the single canonical pool; required, never a legacy process-local fallback. */
  bindIngress: B1IngressPoolBinder
  ingress: InstallationIngressInputs
  baoCertificateSha256?: string
}>

/** Loads approved private sources. Caller closes resources and zeroes buffers. */
export async function assembleInstallationPrivateInputs(spec: InstallationBootstrapInputs) {
  if (!spec || !spec.inputs || !spec.postgres || !spec.bao || !spec.catalog || !spec.sources ||
      spec.postgres.environment !== 'staging' || spec.bao.environment !== 'staging' ||
      spec.bao.mount !== 'b1-keys') {
    throw new Error('INSTALLATION_CONFIG_INVALID')
  }
  const tls = await loadPrivateTls(spec.sources)
  const buffers = [tls.postgresCa, tls.bao.ca, tls.bao.cert, tls.bao.key]
  try {
    if (spec.baoCertificateSha256 !== undefined &&
        (!/^[a-f0-9]{64}$/.test(spec.baoCertificateSha256) ||
         createHash('sha256').update(tls.bao.cert).digest('hex') !== spec.baoCertificateSha256)) {
      throw new Error('INSTALLATION_CERTIFICATE_NOT_APPROVED')
    }
    const configuration = prepareStagingPrivateConfiguration({
      ...spec.inputs,
      postgres: { ...spec.postgres, ca: tls.postgresCa, password: createPrivatePgPassword(spec.sources.postgresPassword) },
      bao: { ...spec.bao, ...tls.bao },
    }, spec.catalog)
    const ingress = await loadIngressMaterial(spec.ingress, buffers)
    return Object.freeze({
      configuration, ingress,
      dispose() { for (const buffer of buffers) buffer.fill(0) },
    })
  } catch (error) {
    for (const buffer of buffers) buffer.fill(0)
    throw error
  }
}

/** Ingress TLS identity and Ed25519 signer. Every buffer read is registered in
 * `buffers` first so a later failure (or shutdown) zeroes it. The signer PEM is
 * consumed into a KeyObject and cleared immediately.
 */
async function loadIngressMaterial(spec: InstallationIngressInputs, buffers: Buffer[]): Promise<Readonly<{
  tls: Readonly<{ cert: Buffer; key: Buffer; ca: Buffer }>
  signingKey: KeyObject
  pseudonymKey: Buffer
}>> {
  if (!spec?.sources) throw new Error('INSTALLATION_CONFIG_INVALID')
  const read = async (source: PrivateFileSource) => {
    const bytes = await readTrustedPrivateFile(source)
    buffers.push(bytes)
    return bytes
  }
  const cert = await read(spec.sources.tlsCert)
  const key = await read(spec.sources.tlsKey)
  const ca = await read(spec.sources.clientCa)
  const pseudonymKey = await read(spec.sources.pseudonymKey)
  const pem = await readTrustedPrivateFile(spec.sources.signingKey)
  try {
    let signingKey: KeyObject
    try { signingKey = createPrivateKey(pem) } catch { throw new Error('INSTALLATION_CONFIG_INVALID') }
    if (![cert, key, ca].every(buffer => buffer.length > 0) || pseudonymKey.length !== 32 ||
        signingKey.type !== 'private' || signingKey.asymmetricKeyType !== 'ed25519') throw new Error('INSTALLATION_CONFIG_INVALID')
    return { tls: { cert, key, ca }, signingKey, pseudonymKey }
  } finally { pem.fill(0) }
}
