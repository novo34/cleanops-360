/** Trusted composition only. No process flags, request selectors or runtime setter. */
import { createPgIdentityPool, type PgIdentityConfiguration } from './pg-identity-driver.ts'
import { createAgentSinkToken, createOpenBaoKeys, type OpenBaoKeyOptions, type PrivateKeyReference } from './openbao-keys.ts'
import { createCustodiedBackend, type B1CustodyReferences } from './custody-composition.ts'
import { createPasswordAdmission } from './password-admission.ts'
import { openEnrollmentSecret, prepareSessionLabels, validateTotpMethodLimit } from './ceremony-preparation.ts'
import { validateDummyPasswordHash } from './approved-factors.ts'
import { numeric } from './config.ts'
import { createFirstActorCeremony, type FirstActorManifest } from './first-actor.ts'
import type { IdentityPool } from './pg-identity-driver.ts'
import { AuthError, closedBackend, createAuthHandler, type Backend } from './service.ts'

export type PrivateRuntimeConfiguration = Readonly<{
  origin: string; internalOrigins: readonly string[]
  postgres: PgIdentityConfiguration
  bao: Omit<OpenBaoKeyOptions, 'token' | 'allowed'>
  sink: Parameters<typeof createAgentSinkToken>[0]
  references: B1CustodyReferences
  totpKeys: readonly Readonly<{ keyVersion: string; reference: PrivateKeyReference }>[]
  lifetimeMs: number; dummyPasswordHash: string; maxEligibleTotpMethods: number
  corpus: Parameters<typeof createPasswordAdmission>[0]
  passwordPolicy: Parameters<typeof createPasswordAdmission>[1]
  /** Same approved provisioner normalization; no inferred email policy. */
  normalizeEmail: (email: string) => string
  /** Server-resolved keyed dimensions; never Request, headers or browser input. */
  transport: () => Readonly<{ network: Buffer; device: Buffer }>
  sessionLabels: () => Readonly<{ device: string; browser: string }>
}>
const unavailable = () => new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')

/** Explicit selection by trusted startup code. Existing runtime remains closed.
 * A selected composition is shared by HTTP and bootstrap; it cannot provision users.
 */
export function selectAuthBackend(selection: { kind: 'closed' } | { kind: 'private'; configuration: PrivateRuntimeConfiguration } = { kind: 'closed' }): {
  backend: Backend; handler?: ReturnType<typeof createAuthHandler>;
  firstActor?: (manifest: FirstActorManifest, operatorPool: IdentityPool, keyVersion: string) => ReturnType<typeof createFirstActorCeremony>;
  close(): Promise<void>
} {
  if (selection?.kind === 'closed' && Object.keys(selection).length === 1) return { backend: closedBackend, async close() {} }
  if (selection?.kind !== 'private' || Object.keys(selection).sort().join(',') !== 'configuration,kind') throw unavailable()
  const c = selection.configuration
  try {
    if (!c || Object.keys(c).sort().join(',') !== 'bao,corpus,dummyPasswordHash,internalOrigins,lifetimeMs,maxEligibleTotpMethods,normalizeEmail,origin,passwordPolicy,postgres,references,sessionLabels,sink,totpKeys,transport' || typeof c.normalizeEmail !== 'function' || typeof c.transport !== 'function' || typeof c.sessionLabels !== 'function' ||
        c.postgres.environment !== c.bao.environment || c.postgres.contractualRole !== 'cleanops_identity_service' ||
        !Number.isSafeInteger(c.lifetimeMs) || c.lifetimeMs < 1 || c.lifetimeMs > 30000 ||
        !Array.isArray(c.internalOrigins) || !c.internalOrigins.every(x => typeof x === 'string')) throw unavailable()
    createAuthHandler(closedBackend, c.origin, undefined, c.internalOrigins)
    validateDummyPasswordHash(c.dummyPasswordHash)
    if (c.passwordPolicy.minimumCodePoints !== numeric('password_min') || c.passwordPolicy.maximumCodePoints !== numeric('password_max')) throw unavailable()
    const passwordAdmission = createPasswordAdmission(c.corpus, c.passwordPolicy)
    const maxEligibleTotpMethods = validateTotpMethodLimit(c.maxEligibleTotpMethods)
    const transport = c.transport, sessionLabels = () => prepareSessionLabels(c.sessionLabels()), normalizeEmail = c.normalizeEmail, dummyPasswordHash = c.dummyPasswordHash
    const readTransport = () => {
      const t = transport()
      if (!t || ![t.network,t.device].every(b => Buffer.isBuffer(b) && b.length === 32)) throw unavailable()
      return { network: Buffer.from(t.network), device: Buffer.from(t.device) }
    }
    // Request-scoped values cannot be probed at startup. Validate on every use;
    // missing context fails closed before backend effects instead of using a fixture.
    const refs = structuredClone(c.references), versions = structuredClone(c.totpKeys)
    if (!refs || !Array.isArray(versions) || versions.length < 1 || versions.length > 8 ||
        new Set(versions.map(x => x.keyVersion)).size !== versions.length || versions.some(x => !x.keyVersion || x.reference.purpose !== 'totp-aead')) throw unavailable()
    const expected = { audit:'audit-hmac', otp:'otp-hmac', recovery:'recovery-hmac', cursor:'cursor-hmac' }
    if (Object.keys(refs).sort().join(',') !== 'audit,cursor,otp,recovery' || Object.entries(expected).some(([k,p]) => refs[k as keyof B1CustodyReferences]?.purpose !== p)) throw unavailable()
    const allowed = [...Object.values(refs), ...versions.map(x => x.reference)]
    if (new Set(allowed.map(x => JSON.stringify([x.tenantId,x.purpose,x.keyId,x.version]))).size !== allowed.length || new Set(allowed.map(x => x.tenantId.toLowerCase())).size !== 1) throw unavailable()
    const token = createAgentSinkToken(c.sink)
    const custody = createOpenBaoKeys({ ...c.bao, allowed, token })
    const pool = createPgIdentityPool(c.postgres)
    const backend = createCustodiedBackend({pool,custody,references:refs,totpKeys:versions.map(x=>x.reference),lifetimeMs:c.lifetimeMs,
      dependencies: borrow => ({
        passwordAdmission, normalizeEmail, maxEligibleTotpMethods,
        transport:readTransport, sessionLabels,
        cursorKey:borrow(refs.cursor,k=>k),
        factors:{dummyPasswordHash,auditKey:borrow(refs.audit,k=>k),otpKey:borrow(refs.otp,k=>k),recoveryKey:borrow(refs.recovery,k=>k),
          async decryptTotp(ciphertext,keyVersion,record){
            const found=versions.find(x=>x.keyVersion===keyVersion && x.reference.tenantId===record.binding.tenantId)
            if(!found)throw unavailable()
            return borrow(found.reference,key=>openEnrollmentSecret(ciphertext,key,keyVersion,{
              tenantId:record.binding.tenantId,userId:record.binding.userId,methodId:record.binding.methodId,initialMethodVersion:'1',algorithm:record.algorithm,
            }))
          },
        },
      }),
    })
    return {backend,handler:createAuthHandler(backend,c.origin,undefined,c.internalOrigins),
      firstActor(manifest, operatorPool, keyVersion) {
        const found = versions.find(x => x.keyVersion === keyVersion)
        if (!manifest || manifest.tenantId !== refs.recovery.tenantId || !found || !operatorPool ||
            operatorPool === pool || typeof operatorPool.connect !== 'function') throw unavailable()
        // The operator supplies a separately authorized executor pool. Runtime's
        // identity pool never acquires initialization authority.
        return createFirstActorCeremony(operatorPool, manifest, { custody, totpKey:found.reference,
          totpKeyVersion:found.keyVersion, recoveryKey:refs.recovery, lifetimeMs:c.lifetimeMs,
          passwordAdmission, normalizeEmail })
      },close:()=>pool.end()}

  } catch { throw unavailable() }
}
