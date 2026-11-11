/** Pure, offline preparation of the staging B1 configuration.
 * No process flags, IO, credentials, startup selection or HTTP activation.
 * The complete object is validated again by selectAuthBackend on approved composition.
 */
import type { PrivateRuntimeConfiguration } from './private-runtime.ts'
import { isIP } from 'node:net'
import { validateInstallationKeys, type InstallationKeyCatalog } from './installation-catalog.ts'

type Inputs = Omit<PrivateRuntimeConfiguration, 'references' | 'totpKeys'>
const inputKeys = 'bao,corpus,dummyPasswordHash,internalOrigins,lifetimeMs,maxEligibleTotpMethods,normalizeEmail,origin,passwordPolicy,postgres,sessionLabels,sink,transport'
const postgresKeys = 'ca,connectionTimeoutMs,contractualRole,database,environment,host,loginRole,maxConnections,password,port'
const baoKeys = 'ca,cert,environment,key,mount,origin,timeoutMs'
const exact = (value: unknown, keys: string): boolean => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys
const httpsOrigin = (value: unknown): boolean => {
  if (typeof value !== 'string') return false
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && (value === url.origin || value === url.origin + '/') } catch { return false }
}
const invalid = () => new Error('INSTALLATION_CONFIG_INVALID')

/** Binds an explicit catalogue to trusted input; never enables a runtime. */
export function prepareStagingPrivateConfiguration(
  input: Inputs,
  catalog: InstallationKeyCatalog,
): PrivateRuntimeConfiguration {
  if (!exact(input, inputKeys) || !exact(input.postgres, postgresKeys) || !exact(input.bao, baoKeys) || !catalog ||
      input.postgres?.environment !== 'staging' ||
      input.bao?.environment !== 'staging' ||
      input.bao?.mount !== 'b1-keys' ||
      input.postgres?.contractualRole !== 'cleanops_identity_service' ||
      !httpsOrigin(input.origin) || !httpsOrigin(input.bao.origin) ||
      typeof input.postgres.password !== 'function' ||
      typeof input.normalizeEmail !== 'function' ||
      typeof input.transport !== 'function' ||
      typeof input.sessionLabels !== 'function' ||
      !Buffer.isBuffer(input.postgres.ca) || !Buffer.isBuffer(input.bao.ca) ||
      !Buffer.isBuffer(input.bao.cert) || !Buffer.isBuffer(input.bao.key) ||
      !input.sink || !input.corpus || !input.passwordPolicy ||
      typeof input.dummyPasswordHash !== 'string' ||
      !Number.isSafeInteger(input.lifetimeMs) || !Number.isSafeInteger(input.maxEligibleTotpMethods) ||
      !Array.isArray(input.internalOrigins) ||
      !input.internalOrigins.every(origin => typeof origin === 'string')) throw invalid()
  const references = validateInstallationKeys(catalog)
  // No default tenant, key version, secret, TLS file or activation flag.
  // selectAuthBackend performs full runtime validation at the authorized call site.
  return Object.freeze({ ...input, ...references })
}

/** Preparation-only ingress extension. Not part of Inputs: the existing loader,
 * bootstrap and approved runtime do not accept or activate this contract yet.
 * References describe evidence to review, not proof supplied by HTTP headers.
 */
export type SharedIngressReplayRepository = Readonly<{
  /** Across ALL consumers and restarts: absent -> claimed is linearizable.
   * Retain claims until expiresAt; never evict live claims on capacity pressure.
   * Scope includes issuer/audience; nonce is the signed assertion nonce.
   * Expired input, unavailable store, ambiguous commit and capacity exhaustion
   * must reject, never return claimed. No local-cache fallback or retry minting.
   */
  claim(input: Readonly<{ issuer: string; audience: string; nonce: string; expiresAt: number }>): Promise<'claimed' | 'duplicate'>
}>
export type IngressCredentialScope = Readonly<{ issuer: string; audience: string; id: string }>
export type IngressCredentialRecord = IngressCredentialScope & Readonly<{
  issuedAt: number; expiresAt: number; revision: string
  state: 'active' | 'revoked'; enrollmentReference: string
}>
export type DurableIngressCredentials = Readonly<{
  /** Consistent authoritative read on BOTH issuance and acceptance; absent,
   * expired, revoked, stale or unavailable state denies. Never store bearer bytes.
   */
  read(scope: IngressCredentialScope): Promise<IngressCredentialRecord | null>
  /** Operator authorization is verified independently of bearer possession,
   * headers, UA or B1 login. Authorization failure throws before any write.
   */
  enroll(input: Readonly<{ record: IngressCredentialRecord; authorizationReference: string }>): Promise<void>
  /** Revision-checked durable terminal transition; remains recorded through exp. */
  revoke(input: Readonly<{ scope: IngressCredentialScope; expectedRevision: string; authorizationReference: string }>): Promise<void>
  /** Atomic revoke-old/create-new with a fresh ID, same scope and independent
   * recovery authorization. No delivery before commit; uncertainty denies.
   */
  recover(input: Readonly<{ previous: IngressCredentialScope; expectedRevision: string; replacement: IngressCredentialRecord; authorizationReference: string }>): Promise<void>
}>
export type B1IngressListenerPlan = Readonly<{
  binding: string; port: number; allowedPaths: readonly string[]
  issuer: string; audience: string; nextOrigin: string
  topology: 'shared-atomic-all-consumers'
  trust: Readonly<{
    transport: 'pinned-mutual-tls'; forwardedHeaders: 'reconstructed-single-hop'
    assertion: 'ed25519-request-bound'; proxyCertificateSha256: string
    evidenceReference: string; tlsAuthorizationReference: string
  }>
  dependencies: Readonly<{ replay: SharedIngressReplayRepository; credentials: DurableIngressCredentials }>
  lifecycle: Readonly<{
    /** Must cover runtime, listener, TLS, authoritative stores and drain state.
     * Only literal true is ready; exceptions/unknown deny. No /login fallback.
     */
    ready(): Promise<boolean>
    /** Withdraw readiness/issuance first, drain boundedly, close listener, then
     * existing runtime/material. Idempotent; timeout/failure stays closed.
     * Implementation must reuse server-startup/runtime ownership, not replace it.
     */
    close(): Promise<void>
    drainTimeoutMs: number
  }>
}>

/** Validate shape and cross-bind scope only. Cannot attest network isolation,
 * atomicity, PKI or proxy sanitization; preparation NEVER grants activation.
 */
export function prepareB1IngressListenerPlan(plan: B1IngressListenerPlan) {
  const keys = 'allowedPaths,audience,binding,dependencies,issuer,lifecycle,nextOrigin,port,topology,trust'
  const ref = (s: unknown) => typeof s === 'string' && !!s.trim() && s.length <= 256 && !/[\p{Cc}\p{Cf}]/u.test(s)
  const origin = (s: unknown) => httpsOrigin(s) && new URL(s as string).origin === s
  const path = (s: unknown) => {
    if (typeof s !== 'string' || !s.startsWith('/') || s.startsWith('//') || /[\s?#%\\]/u.test(s)) return false
    return new URL(s, 'https://path.invalid').pathname === s
  }
  if (!exact(plan, keys) || typeof plan.binding !== 'string' || !isIP(plan.binding) || plan.binding === '0.0.0.0' ||
      (isIP(plan.binding) === 6 && ['[::]', '[::ffff:0:0]'].includes(new URL('https://[' + plan.binding + ']').hostname)) ||
      !Number.isSafeInteger(plan.port) || plan.port < 1 || plan.port > 65535 ||
      !Array.isArray(plan.allowedPaths) || !plan.allowedPaths.length || !plan.allowedPaths.every(path) ||
      new Set(plan.allowedPaths).size !== plan.allowedPaths.length || !ref(plan.issuer) ||
      !origin(plan.audience) || !origin(plan.nextOrigin) || plan.audience !== plan.nextOrigin ||
      plan.topology !== 'shared-atomic-all-consumers' ||
      !exact(plan.trust, 'assertion,evidenceReference,forwardedHeaders,proxyCertificateSha256,tlsAuthorizationReference,transport') ||
      plan.trust.transport !== 'pinned-mutual-tls' || plan.trust.forwardedHeaders !== 'reconstructed-single-hop' ||
      plan.trust.assertion !== 'ed25519-request-bound' ||
      !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(plan.trust.proxyCertificateSha256) ||
      !ref(plan.trust.evidenceReference) || !ref(plan.trust.tlsAuthorizationReference) ||
      !exact(plan.dependencies, 'credentials,replay') ||
      !exact(plan.dependencies.replay, 'claim') || typeof plan.dependencies.replay.claim !== 'function' ||
      !exact(plan.dependencies.credentials, 'enroll,read,recover,revoke') ||
      !Object.values(plan.dependencies.credentials).every(v => typeof v === 'function') ||
      !exact(plan.lifecycle, 'close,drainTimeoutMs,ready') ||
      typeof plan.lifecycle.ready !== 'function' || typeof plan.lifecycle.close !== 'function' ||
      !Number.isSafeInteger(plan.lifecycle.drainTimeoutMs) || plan.lifecycle.drainTimeoutMs < 1 || plan.lifecycle.drainTimeoutMs > 30000) throw invalid()
  const configuration = Object.freeze({ ...plan, allowedPaths: Object.freeze([...plan.allowedPaths]),
    trust: Object.freeze({ ...plan.trust }), dependencies: Object.freeze({
      replay: Object.freeze({ ...plan.dependencies.replay }), credentials: Object.freeze({ ...plan.dependencies.credentials }),
    }), lifecycle: Object.freeze({ ...plan.lifecycle }) })
  return Object.freeze({ configuration, activation: 'blocked' as const,
    pending: Object.freeze([
      'AUTH-GATE-05 and explicit activation authorization',
      'Effective Traefik version/router/header sanitization and private network evidence',
      'Existing TLS material purpose approval and reviewed listener configuration',
      'Shared atomic replay adapter and cross-consumer/restart conformance evidence',
      'Durable credential adapter, operator authorization, recovery/retention policy',
      'Reviewed verifier/protocol wiring and exact private-module/image bytes',
      'Listener start/error/readiness/drain implementation and isolated integration tests',
      'Complete email compatibility snapshot and provisioning cutover approval',
    ]),
  })
}
