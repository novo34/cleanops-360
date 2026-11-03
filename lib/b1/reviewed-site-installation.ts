/** Node-only binding from an owner-installed, read-only private package. */
import { createHash } from 'node:crypto'
import { numeric } from './config.ts'
import { readTrustedPrivateFile, type PrivateFileSource } from './private-file.ts'
import { createInstallationContext, type InstallationIntegration } from './installation-context.ts'
import type { InstallationBootstrapInputs } from './installation-bootstrap.ts'
import { validateInstallationKeys } from './installation-catalog.ts'
import { createPasswordAdmission } from './password-admission.ts'
import { validateDummyPasswordHash } from './approved-factors.ts'
import { validateTotpMethodLimit } from './ceremony-preparation.ts'
import type { B1IngressPoolBinder } from './private-runtime.ts'

/** Fixed installation authority; neither HTTP nor ENV can select this file. */
const manifestSource: PrivateFileSource = Object.freeze({
  path: '/run/cleanops-b1-private/installation.json', uid: 0, gid: 999, mode: 0o440, maxBytes: 65536,
})
export type ReviewedInstallationManifest = Readonly<{
  version: 2
  origin: string; internalOrigins: readonly string[]
  postgres: InstallationBootstrapInputs['postgres']
  bao: InstallationBootstrapInputs['bao']
  catalog: InstallationBootstrapInputs['catalog']
  sources: InstallationBootstrapInputs['sources']
  sink: InstallationBootstrapInputs['inputs']['sink']
  corpus: Readonly<{ version: string; sha256: string; source: PrivateFileSource }>
  dummyPasswordHash: PrivateFileSource
  maximumCorpusBytes: number; maxEligibleTotpMethods: number; lifetimeMs: number
  ingress: InstallationBootstrapInputs['ingress']
  integration: Readonly<{ source: PrivateFileSource; sha256: string; approval: string }>
  baoClientIdentity: Readonly<{ scope: 'nextjs-identity-verifier'; certificateSha256: string; approval: string }>
}>
const invalid = () => new Error('INSTALLATION_CONFIG_INVALID')
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const approved = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 512 && !/[\p{Cc}\p{Cf}]/u.test(value)
const rootGroupReadOnly = (source: PrivateFileSource) => source?.uid === 0 && source.gid === 999 && source.mode === 0o440
const exact = (value: unknown, keys: string) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys

/** Import the exact reviewed bytes, avoiding a second path lookup or symlink race.
 * The module may use built-ins / approved absolute imports, never relative imports.
 */
async function loadIntegration(spec: ReviewedInstallationManifest['integration']): Promise<Readonly<{
  integration: InstallationIntegration
  bindIngress: B1IngressPoolBinder
}>> {
  const bytes = await readTrustedPrivateFile(spec.source)
  try {
    if (!/^[a-f0-9]{64}$/.test(spec.sha256) || sha256(bytes) !== spec.sha256) throw invalid()
    const url = 'data:text/javascript;base64,' + bytes.toString('base64')
    // Trust boundary: owner-controlled private file, strict metadata and SHA-256 checked above; no HTTP/ENV source.
    const module = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)
    if (typeof module.normalizeEmail !== 'function' || typeof module.resolveRequestContext !== 'function') throw invalid()
    if (typeof module.bindIngress !== 'function' || Object.keys(module).sort().join(',') !==
        'bindIngress,normalizeEmail,resolveRequestContext') throw invalid()
    // The reviewed module must reject requests until this binding succeeds.
    return { integration: { normalizeEmail: module.normalizeEmail, resolveRequestContext: module.resolveRequestContext },
      bindIngress: dependencies => module.bindIngress(dependencies) }
  } finally { bytes.fill(0) }
}

/** Reuses the canonical bootstrap, corpus, policy and custody contracts. No sockets. */
export async function loadReviewedB1Installation(source: PrivateFileSource): Promise<InstallationBootstrapInputs> {
  const raw = await readTrustedPrivateFile(source)
  let content: Buffer | undefined, dummy: Buffer | undefined
  try {
    const m = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as ReviewedInstallationManifest
    if (!exact(m, 'bao,baoClientIdentity,catalog,corpus,dummyPasswordHash,ingress,integration,internalOrigins,lifetimeMs,maxEligibleTotpMethods,maximumCorpusBytes,origin,postgres,sink,sources,version') ||
        m.version !== 2 || m.postgres?.environment !== 'staging' ||
        m.postgres?.loginRole !== 'cleanops_staging_identity_login' || m.postgres.contractualRole !== 'cleanops_identity_service' ||
        m.bao?.environment !== 'staging' || m.bao.mount !== 'b1-keys' ||
        !exact(m.integration, 'approval,sha256,source') || !approved(m.integration.approval) ||
        !exact(m.baoClientIdentity, 'approval,certificateSha256,scope') ||
        m.baoClientIdentity.scope !== 'nextjs-identity-verifier' || !approved(m.baoClientIdentity.approval) ||
        !/^[a-f0-9]{64}$/.test(m.baoClientIdentity.certificateSha256) ||
        !Number.isSafeInteger(m.lifetimeMs) || m.lifetimeMs < 1 || m.lifetimeMs > 30000 ||
        !Number.isSafeInteger(m.maximumCorpusBytes) || m.maximumCorpusBytes < 65 || m.maximumCorpusBytes > 65536) throw invalid()
    validateInstallationKeys(m.catalog)
    validateTotpMethodLimit(m.maxEligibleTotpMethods)
    if (!rootGroupReadOnly(m.integration.source)) throw invalid()
    // Data only: semantics (bind address, pin, scope, lifetimes) are validated once by
    // prepareB1IngressListenerPlan and the issuer at startup; here only the shape and
    // the strict ownership contract of every private file are enforced.
    if (!exact(m.ingress, 'allowedPaths,binding,contextLifetimeMs,drainTimeoutMs,evidenceReference,issuer,maximumBodyBytes,maximumDeviceLifetimeMs,port,proxyCertificateSha256,sources,timeoutMs,tlsAuthorizationReference') ||
        !exact(m.ingress.sources, 'clientCa,pseudonymKey,signingKey,tlsCert,tlsKey') ||
        !Object.values(m.ingress.sources).every(rootGroupReadOnly)) throw invalid()
    if (m.sink.path !== '/run/cleanops-agent/token' || m.sink.uid !== 999 || m.sink.gid !== 999 ||
        m.sink.directoryUid !== 999 || m.sink.directoryGid !== 999 || m.sink.mode !== 0o600 || m.sink.directoryMode !== 0o700) throw invalid()
    content = await readTrustedPrivateFile(m.corpus.source)
    const corpus = { version: m.corpus.version, sha256: m.corpus.sha256, content }
    const passwordPolicy = { minimumCodePoints: numeric('password_min'), maximumCodePoints: numeric('password_max'), maximumCorpusBytes: m.maximumCorpusBytes }
    createPasswordAdmission(corpus, passwordPolicy)
    dummy = await readTrustedPrivateFile(m.dummyPasswordHash)
    const dummyPasswordHash = new TextDecoder('utf-8', { fatal: true }).decode(dummy)
    validateDummyPasswordHash(dummyPasswordHash)
    const loaded = await loadIntegration(m.integration)
    const context = createInstallationContext(loaded.integration)
    return Object.freeze({
      postgres: m.postgres, bao: m.bao, catalog: m.catalog, sources: m.sources,
      baoCertificateSha256: m.baoClientIdentity.certificateSha256,
      requestScope: context.requestScope,
      bindIngress: loaded.bindIngress,
      ingress: m.ingress,
      inputs: { origin: m.origin, internalOrigins: m.internalOrigins, sink: m.sink, corpus, passwordPolicy,
        dummyPasswordHash, lifetimeMs: m.lifetimeMs, maxEligibleTotpMethods: m.maxEligibleTotpMethods,
        normalizeEmail: context.normalizeEmail, transport: context.transport, sessionLabels: context.sessionLabels },
    })
  } catch { content?.fill(0); throw invalid() }
  finally { raw.fill(0); dummy?.fill(0) }
}

/** Absence, wrong metadata or incomplete installation keeps B1 admission closed. */
export async function reviewedB1Installation(): Promise<InstallationBootstrapInputs | undefined> {
  // The reviewed Agent sink and private package are accessible only to UID/GID 999.
  // Refuse a mismatched container identity before loading any privileged module.
  if (process.getuid?.() !== 999 || process.getgid?.() !== 999) return undefined
  try { return await loadReviewedB1Installation(manifestSource) }
  catch { return undefined }
}
