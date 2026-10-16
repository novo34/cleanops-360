import { createHmac } from 'node:crypto'
import { canonical } from './contracts.ts'
import { numeric } from './config.ts'
import { AuthError, type Binding } from './service.ts'
import { verifyPasswordFactor } from './password.ts'
import { verifyTotpFactor, type TotpBinding, type TotpRecord } from './totp.ts'
import type { V4Broker } from './v4-broker.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const invalid = () => new AuthError(401, 'AUTH_INVALID')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function generation(value: unknown): string {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  if (typeof text !== 'string' || !/^[1-9][0-9]{0,18}$/.test(text) || BigInt(text) > BigInt('9223372036854775807')) throw unavailable()
  return text
}
export interface PrivateFactorKeys {
  /** Precomputed real Argon2id trial hash; supplied privately, never a fallback credential. */
  dummyPasswordHash: string
  auditKey: Buffer
  otpKey: Buffer
  recoveryKey: Buffer
  /** Authenticated key-provider implementation, validating method/tenant/user/version AAD.
   * Returns fresh owned plaintext; no network/second database connection in this callback. */
  decryptTotp(ciphertext: Buffer, keyVersion: string, record: TotpRecord): Promise<Uint8Array>
}
export type CredentialProof = Readonly<{ principalId: string; version: string }>
/** Transaction-local proof capabilities. No browser-supplied password_verified/counter is accepted.
 * This object must be created inside the scoped broker transaction, never cached globally. */
export function createApprovedFactors(broker: V4Broker, keys: PrivateFactorKeys, correlation: string, now = Date.now) {
  if (!uuid(correlation) || !Buffer.isBuffer(keys.auditKey) || keys.auditKey.length < 32 ||
      !Buffer.isBuffer(keys.otpKey) || keys.otpKey.length < 32 || !keys.dummyPasswordHash.startsWith('$argon2id$')) throw unavailable()
  const dummy = /^\$argon2id\$v=19\$m=([0-9]+),t=([0-9]+),p=([0-9]+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(keys.dummyPasswordHash)
  if (!dummy || Number(dummy[1]) !== numeric('argon_memory') || Number(dummy[2]) !== numeric('argon_iterations') ||
      Number(dummy[3]) !== numeric('argon_parallelism') ||
      Buffer.from(dummy[4], 'base64').length !== numeric('argon_salt') ||
      Buffer.from(dummy[5], 'base64').length !== 32 ||
      [dummy[4], dummy[5]].some(v => Buffer.from(v, 'base64').toString('base64').replace(/=+$/, '') !== v)) throw unavailable()
  const proofs = new WeakMap<CredentialProof, string>()
  async function denied(code: 'LOGIN_DENIED' | 'MFA_DENIED', subject: string) {
    const pseudonym = createHmac('sha256', keys.auditKey).update(canonical([code, subject])).digest()
    await broker.call('securityEvent', [code, pseudonym, null, null, correlation])
    return invalid()
  }
  return Object.freeze({
    async password(normalizedEmail: string, password: string): Promise<CredentialProof | AuthError> {
      const rows = await broker.call('credentialLocked', [normalizedEmail])
      if (rows.length > 1) throw unavailable()
      const row = rows[0]
      if (!row) {
        await verifyPasswordFactor(password, keys.dummyPasswordHash, async () => true)
        return denied('LOGIN_DENIED', normalizedEmail)
      }
      if (!uuid(row.principal_id) || typeof row.password_hash !== 'string') throw unavailable()
      const version = generation(row.credential_version), principal = row.principal_id
      let expected = row.password_hash
      const result = await verifyPasswordFactor(password, expected, async (oldHash, replacement) => {
        const ok = await broker.call('rehashCas', [principal, version, oldHash, replacement])
        if (ok) expected = replacement
        return ok
      })
      if (result instanceof AuthError) return denied('LOGIN_DENIED', normalizedEmail)
      const proof = Object.freeze({ principalId: principal, version })
      proofs.set(proof, expected)
      return proof
    },
    async preauth(proof: CredentialProof, tenant: string | null, cookie: Buffer, csrf: Buffer): Promise<string> {
      const expected = proofs.get(proof)
      if (!expected || (tenant !== null && !uuid(tenant)) || cookie.length !== 32 || csrf.length !== 32) throw unavailable()
      // Consume the in-process capability once; SQL independently rechecks version/hash.
      proofs.delete(proof)
      return broker.call('preauthVerified', [proof.principalId, tenant, proof.version, expected, cookie, csrf])
    },
    async totp(code: string, actor: Binding, rawPreauth: string | null, ceremony: string, purpose: 'LOGIN' | 'STEP_UP' | 'ENROLLMENT', recovery: Buffer[] = []): Promise<{ verified: true } | AuthError> {
      if (!uuid(actor.tenantId) || !uuid(actor.userId) || !uuid(ceremony) ||
          (actor.kind === 'ACTIVE') !== (rawPreauth === null) ||
          (purpose === 'STEP_UP' && actor.kind !== 'ACTIVE') || (purpose === 'LOGIN' && actor.kind !== 'PREAUTH')) return invalid()
      const material = await broker.call('totpMaterial', [rawPreauth, ceremony, purpose])
      if (!object(material) || !object(material.binding)) throw unavailable()
      const b = material.binding
      if (b.tenantId !== actor.tenantId || b.userId !== actor.userId || !uuid(b.methodId) ||
          b.purpose !== purpose || b.ceremonyId !== ceremony) return denied('MFA_DENIED', actor.id)
      const binding: TotpBinding = Object.freeze({ tenantId: actor.tenantId, userId: actor.userId, methodId: b.methodId, purpose, ceremonyId: ceremony })
      const version = generation(material.version)
      if ((material.lastCounter !== null && (typeof material.lastCounter !== 'number' || !Number.isSafeInteger(material.lastCounter) || material.lastCounter < 0)) ||
          typeof material.expiresAt !== 'number' || !Number.isSafeInteger(material.expiresAt) ||
          !['SHA1', 'SHA256', 'SHA512'].includes(String(material.algorithm)) ||
          typeof material.secret_ciphertext !== 'string' || typeof material.key_version !== 'string') throw unavailable()
      const record: TotpRecord = Object.freeze({
        binding, version, lastCounter: material.lastCounter as number | null,
        expiresAt: Math.min(material.expiresAt, actor.expiresAt), algorithm: material.algorithm as TotpRecord['algorithm'],
      })
      let attempted = false
      const result = await verifyTotpFactor(code, binding, {
        async readAuthorized() { return record },
        async decryptSecret() {
          const ciphertext = Buffer.from(material.secret_ciphertext as string, 'base64')
          try {
            if (!ciphertext.length || ciphertext.toString('base64') !== material.secret_ciphertext) throw unavailable()
            return await keys.decryptTotp(ciphertext, material.key_version as string, record)
          } finally { ciphertext.fill(0) }
        },
        async consume(change) {
          attempted = true
          if (purpose === 'ENROLLMENT') {
            return broker.call('consumeEnrollment', [rawPreauth, ceremony, version, change.expectedCounter, change.nextCounter, recovery, correlation])
          }
          return broker.call('consumeTotp', [rawPreauth, ceremony, purpose, version, change.expectedCounter, change.nextCounter, correlation])
        },
      }, now)
      if (result instanceof AuthError) {
        if (!attempted && purpose !== 'ENROLLMENT') {
          if (await broker.call('consumeTotp', [rawPreauth, ceremony, purpose, version, record.lastCounter, null, correlation]) !== false) throw unavailable()
        }
        return denied('MFA_DENIED', actor.id)
      }
      return result
    },
    async emailOtp(code: string, actor: Binding, rawPreauth: string | null, ceremony: string) {
      if (!uuid(ceremony) || (actor.kind === 'ACTIVE') !== (rawPreauth === null)) return invalid()
      const rows = await broker.call('otpMaterial', [rawPreauth, ceremony])
      if (rows.length !== 1 || rows[0].kind !== 'EMAIL_OTP') return denied('MFA_DENIED', actor.id)
      const scope = rawPreauth === null ? actor.sessionId : rawPreauth
      if (!scope) throw unavailable()
      const proof = /^[0-9]{6}$/.test(code) ? createHmac('sha256', keys.otpKey).update(canonical(['EMAIL_OTP', scope, code])).digest() : null
      try {
        const ok = await broker.call('consumeOtp', [rawPreauth, ceremony, proof, correlation])
        return ok ? { verified: true as const } : denied('MFA_DENIED', actor.id)
      } finally { proof?.fill(0) }
    },
  })
}
