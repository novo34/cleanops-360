/** Private installation ceremony. No web imports, session issuer or administrative seed. */
import { createHash } from 'node:crypto'
import { canonical, valid } from './contracts.ts'
import { profile } from './config.ts'
import { AuthError, token } from './service.ts'
import { prepareReplacementHash } from './password.ts'
import { prepareTotpEnrollment, openEnrollmentSecret, privateArtifact } from './ceremony-preparation.ts'
import { approvedTotpEnrollmentPolicy } from './enrollment-policy.ts'
import { verifyTotpFactor } from './totp.ts'
import { prepareRecoveryCodes } from './recovery-material.ts'
import { createPgIdentityUnitOfWork, type IdentityPool, type IdentityConnection } from './pg-identity-driver.ts'
import { createCustodyDeadlinePool } from './custody-deadline.ts'
import type { PrivateCustody } from './custody-composition.ts'
import type { PrivateKeyReference } from './openbao-keys.ts'

export const firstActorRules = Object.freeze(['B1-SELF-01','B1-SELF-02','B1-SELF-03','B1-SELF-04','B1-SELF-05','B1-SELF-06','B1-SELF-07','B1-SELF-08'])
export type FirstActorManifest = Readonly<{
  installationId: string; operationId: string; tenantId: string; userId: string; principalId: string
  tenantName: string; displayName: string; email: string; accountLabel: string; approval: string
}>
type State = { state: 'ABSENT'|'RESERVED'|'PREPARED'|'CONFIRMED'|'COMMITTED'|'EXPIRED'; expiresAt?: number; receipt?: Record<string, unknown> }
type Material = { methodId: string; ciphertext: string; keyVersion: string; counter: number|null }
const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const invalid = () => new AuthError(409, 'FIRST_ACTOR_CONFLICT')
const hash = (domain: string, value: string) => createHash('sha256').update(canonical([domain, value])).digest('hex')
const statements = {
  begin: 'SELECT identity_provision.first_actor_begin($1::jsonb,$2::bytea) AS value',
  stage: 'SELECT identity_provision.first_actor_stage($1::uuid,$2::uuid,$3::bytea,$4::jsonb) AS value',
  material: 'SELECT identity_provision.first_actor_material($1::uuid,$2::uuid,$3::bytea,$4::bytea) AS value',
  confirm: 'SELECT identity_provision.first_actor_confirm($1::uuid,$2::uuid,$3::bytea,$4::bytea,$5::bigint,$6::boolean) AS value',
  denied: 'SELECT identity_provision.first_actor_denied($1::uuid,$2::uuid,$3::bytea) AS value',
  commit: 'SELECT identity_provision.first_actor_commit($1::uuid,$2::uuid,$3::bytea,$4::bytea) AS value',
  status: 'SELECT identity_provision.first_actor_status($1::uuid,$2::uuid,$3::bytea) AS value',
} as const
async function call<T>(c: IdentityConnection, operation: keyof typeof statements, args: unknown[]): Promise<T> {
  const result = await c.query(statements[operation], args) as { rows: { value: T }[] }
  if (!result || result.rows?.length !== 1) throw unavailable()
  return result.rows[0].value
}

export function createFirstActorCeremony(pool: IdentityPool, manifest: FirstActorManifest, deps: Readonly<{
  custody: PrivateCustody; totpKey: PrivateKeyReference; totpKeyVersion: string; recoveryKey: PrivateKeyReference; lifetimeMs: number
  passwordAdmission: (password: string) => Promise<boolean>; normalizeEmail: (email: string) => string; now?: () => number
}>) {
  if (!manifest || Object.keys(manifest).sort().join(',') !== 'accountLabel,approval,displayName,email,installationId,operationId,principalId,tenantId,tenantName,userId' ||
      !['installationId','operationId','tenantId','userId','principalId'].every(k => valid({ type:'string',format:'uuid' }, manifest[k as keyof FirstActorManifest])) ||
      !valid({ type:'string',format:'email',maxLength:254 },manifest.email) ||
      !['tenantName','displayName','accountLabel','approval'].every(k => typeof manifest[k as keyof FirstActorManifest] === 'string' && manifest[k as keyof FirstActorManifest].length > 0 && manifest[k as keyof FirstActorManifest].length <= 120) ||
      !deps || deps.totpKey?.tenantId !== manifest.tenantId || deps.recoveryKey?.tenantId !== manifest.tenantId ||
      deps.totpKey.purpose !== 'totp-aead' || deps.recoveryKey.purpose !== 'recovery-hmac' ||
      typeof deps.totpKeyVersion !== 'string' || !deps.totpKeyVersion.length || typeof deps.passwordAdmission !== 'function' ||
      typeof deps.normalizeEmail !== 'function') throw unavailable()
  try { if (deps.normalizeEmail(manifest.email) !== manifest.email) throw unavailable() } catch { throw unavailable() }
  const captured = JSON.parse(JSON.stringify(manifest)) as FirstActorManifest
  const reference = (r: PrivateKeyReference) => Object.freeze({ tenantId:r.tenantId,purpose:r.purpose,keyId:r.keyId,version:r.version })
  const totp = reference(deps.totpKey), recovery = reference(deps.recoveryKey)
  const input = canonical({ ...captured, rules: firstActorRules, policy: profile.values,
    keyCatalog:{totp,recovery,keyVersion:deps.totpKeyVersion} })
  const digest = createHash('sha256').update(input).digest()
  const scope = [captured.installationId, captured.operationId, digest]
  const now = deps.now ?? Date.now
  const { custody, lifetimeMs, passwordAdmission, totpKeyVersion } = deps
  const capability = (value: string) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw invalid()
    return Buffer.from(hash('FIRST_ACTOR_CAP_V1',value),'hex')
  }
  async function run<T>(work: (c: IdentityConnection, aead: Buffer, keyVersion: string, recoveryKey: Buffer) => Promise<T>) {
    try {
      return await custody.withKeys([totp,recovery],lifetimeMs,async(borrow,lease) =>
        createPgIdentityUnitOfWork(createCustodyDeadlinePool(pool,lease)).run(c =>
          work(c,borrow(totp,k=>k),totpKeyVersion,borrow(recovery,k=>k))))
    } catch (error) { if (error instanceof AuthError) throw error; throw unavailable() }
  }
  return Object.freeze({
    async prepare(password: string) {
      return run(async(c,aead,keyVersion,recoveryKey) => {
        const state = await call<State>(c,'begin',[input,digest])
        // A retry or uncertain commit never regenerates or re-delivers secrets.
        if (state.state !== 'RESERVED') return state
        const passwordHash = await prepareReplacementHash(password,passwordAdmission)
        if (passwordHash instanceof AuthError) throw passwordHash
        const pending = prepareTotpEnrollment({tenantId:captured.tenantId,userId:captured.userId,bindingId:captured.operationId},
          {...approvedTotpEnrollmentPolicy,label:captured.accountLabel},aead,keyVersion)
        let batch: ReturnType<typeof prepareRecoveryCodes> | undefined
        try {
          batch = prepareRecoveryCodes(captured.tenantId,captured.userId,recoveryKey)
          const cap = token()
          const stored = await call<State>(c,'stage',[...scope,JSON.stringify({methodId:pending.methodId,ciphertext:pending.ciphertext.toString('hex'),keyVersion,
            passwordHash,capDigest:hash('FIRST_ACTOR_CAP_V1',cap),recovery:batch.digests.map(b=>b.toString('hex')),counter:null})])
          return privateArtifact(stored,{capability:cap,provisioningUri:pending.provisioningUri,recoveryCodes:batch.codes})
        } finally { pending.ciphertext.fill(0);batch?.digests.forEach(b=>b.fill(0)) }
      })
    },
    async confirm(cap: string, proof: string, recoveryAcknowledged: boolean) {
      const capHash = capability(cap)
      try {
        const confirmed = await run(async(c,aead,keyVersion) => {
          const found = await call<Material|null>(c,'material',[...scope,capHash])
          if (!found || found.keyVersion !== keyVersion || recoveryAcknowledged !== true) {
            await call(c,'denied',scope);return invalid()
          }
          const state = await call<State>(c,'status',scope)
          const binding = {tenantId:captured.tenantId,userId:captured.userId,methodId:found.methodId,purpose:'FIRST_ACTOR',ceremonyId:captured.operationId}
          const outcome = await verifyTotpFactor(proof,binding,{
            async readAuthorized(){return {binding,version:'1',lastCounter:found.counter,expiresAt:state.expiresAt!,algorithm:approvedTotpEnrollmentPolicy.algorithm}},
            async decryptSecret(){
              const envelope=Buffer.from(found.ciphertext,'hex')
              try{return openEnrollmentSecret(envelope,aead,keyVersion,{tenantId:captured.tenantId,userId:captured.userId,methodId:found.methodId,initialMethodVersion:'1',algorithm:approvedTotpEnrollmentPolicy.algorithm})}
              finally{envelope.fill(0)}
            },
            async consume(change){return call<boolean>(c,'confirm',[...scope,capHash,change.nextCounter,true])},
          },now)
          if (outcome instanceof AuthError) { await call(c,'denied',scope);return outcome }
          return call<State>(c,'status',scope)
        })
        // As in B1 factor handling: persist denial audit before surfacing error.
        if (confirmed instanceof AuthError) throw confirmed
        return confirmed
      } finally {capHash.fill(0)}
    },
    async commit(cap: string): Promise<State> {
      const capHash = capability(cap)
      try { return await run(c => call<State>(c,'commit',[...scope,capHash])) }
      finally {capHash.fill(0)}
    },
    async status(): Promise<State> {
      const deadline = performance.now()+5000
      // Same canonical guard, without needing Bao keys to recover a receipt.
      const lease = { remainingMs:()=>deadline-performance.now(), acknowledgeCommit(){} }
      try { return await createPgIdentityUnitOfWork(createCustodyDeadlinePool(pool,lease)).run(c=>call<State>(c,'status',scope)) }
      catch {throw unavailable()}
    },
  })
}
