import { AuthError, digest } from './service.ts'
import { numeric } from './config.ts'
import { createV4IdentityRepository } from './v4-broker.ts'
import type { IdentityPool } from './pg-identity-driver.ts'

export type OtpScope = Readonly<{ mode: 'PREAUTH' | 'ACTIVE'; bindingDigest: string }>
/** The same private HMAC provider/domain used by issue_challenge. No raw key or code in SQL.
 * The issuer must use an external-key HMAC32, not an unkeyed hash of six digits. */
export type OtpDigester = (code: string, scope: OtpScope) => Promise<Buffer>
const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
/** Actual EMAIL_OTP verification call composition. The V4 broker locks challenge, verifies
 * subject/tenant/ceremony/expiry/attempt budget, and atomically moves ISSUED to VERIFIED.
 * false is a committed failed attempt. SQL/network errors roll back, never simulate success.
 * Session issuance is intentionally separate and is NOT performed by this factor operation. */
export function createPrivateOtpOperations(pool: IdentityPool, digestCode: OtpDigester) {
  const repository = createV4IdentityRepository(pool)
  return Object.freeze({
    verifyEmailOtp(
      rawCookie: string, mode: 'PREAUTH' | 'ACTIVE', challenge: string, code: string, correlation: string,
    ): Promise<{ verified: true } | AuthError> {
      if (!/^[A-Za-z0-9_-]{43}$/.test(rawCookie) || !['PREAUTH', 'ACTIVE'].includes(mode) ||
          ![challenge, correlation].every(value => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))) {
        return Promise.resolve(new AuthError(401, 'AUTH_INVALID'))
      }
      return repository.transaction(async broker => {
        if (mode === 'ACTIVE') await broker.call('beginContext', [rawCookie])
        else await broker.call('preauthSummary', [rawCookie])
        const preauth = mode === 'PREAUTH' ? rawCookie : null
        const rows = await broker.call('challengeMaterial', [preauth, challenge])
        if (rows.length === 0) return new AuthError(401, 'AUTH_INVALID')
        if (rows.length !== 1 || rows[0].kind !== 'EMAIL_OTP') return new AuthError(401, 'AUTH_INVALID')
        let proof: Buffer | null = null
        try {
          if (typeof code === 'string' && new RegExp('^[0-9]{' + numeric('otp_digits') + '}$').test(code)) {
            const scope = Object.freeze({ mode, bindingDigest: digest(rawCookie) })
            try { proof = await digestCode(code, scope) } catch { throw unavailable() }
            if (!Buffer.isBuffer(proof) || proof.length !== 32) throw unavailable()
          }
          const ok = await broker.call('verifyChallenge', [preauth, challenge, proof, null, correlation])
          return ok ? { verified: true as const } : new AuthError(401, 'AUTH_INVALID')
        } finally { if (Buffer.isBuffer(proof)) proof.fill(0) }
      })
    },
  })
}
