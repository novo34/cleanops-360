import { numeric } from './config.ts'
import { AuthError } from './service.ts'

/** Trusted server-resolved context, never copied from request selectors. */
export type TotpBinding = Readonly<{
  userId: string; tenantId: string; methodId: string; purpose: string; ceremonyId: string
}>
export type TotpRecord = Readonly<{
  binding: TotpBinding; version: string; lastCounter: number | null; expiresAt: number
  algorithm: 'SHA1' | 'SHA256' | 'SHA512'
}>
export type TotpConsumption = Readonly<{
  binding: TotpBinding; version: string; expectedCounter: number | null
  nextCounter: number; verifiedAt: number
}>
export interface TotpDependencies {
  /** Check authorized ceremony/purpose, subject, tenant, method state/revocation and expiry.
   * Enrollment may expose only its pending method; other purposes require an active method. */
  readAuthorized(binding: TotpBinding): Promise<TotpRecord | null>
  /** Authenticated decryption from private storage; return a fresh owned buffer, never a shared cache.
   * Storage binds ciphertext to method/subject/tenant/version. No plaintext in records or logs. */
  decryptSecret(record: TotpRecord): Promise<Uint8Array>
  /** In the caller's transaction: atomically recheck authorization, expiry and method version,
   * CAS the GLOBAL user/tenant/method counter (not a counter per purpose/ceremony),
   * then consume the ceremony and audit. Return false on revocation, replay or a race.
   * No success/session may escape until that transaction commits. */
  consume(change: TotpConsumption): Promise<boolean>
}
const fields = ['userId', 'tenantId', 'methodId', 'purpose', 'ceremonyId'] as const
const invalid = () => new AuthError(401, 'AUTH_INVALID')
function validBinding(binding: TotpBinding): boolean {
  return !!binding && fields.every(key => typeof binding[key] === 'string' && binding[key].length > 0 && binding[key].length <= 256)
}

/** Internal factor proof only. V4 configuration remains trial-only, not production approval.
 * OTPAuth handles RFC cryptography and constant-time token comparison; no token/secret is returned.
 * Invalid proofs return AuthError for committed attempt accounting. Infrastructure errors throw
 * generic 503 for rollback, without attaching dependency diagnostics or secret-bearing causes. */
export async function verifyTotpFactor(
  code: string, authorized: TotpBinding, deps: TotpDependencies, now: () => number = Date.now,
): Promise<{ verified: true } | AuthError> {
  if (!validBinding(authorized) || typeof code !== 'string' ||
      !new RegExp('^[0-9]{' + numeric('totp_digits') + '}$').test(code)) return invalid()
  // Snapshot before any await, including against accidental mutation by an adapter.
  const binding = Object.freeze(Object.fromEntries(fields.map(key => [key, authorized[key]]))) as TotpBinding
  let plaintext: Uint8Array | undefined
  let secretBytes: Uint8Array | undefined
  try {
    const timestamp = now()
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('CLOCK_UNAVAILABLE')
    const found = await deps.readAuthorized(binding)
    if (!found || !validBinding(found.binding) || fields.some(key => found.binding[key] !== binding[key])) return invalid()
    const record: TotpRecord = Object.freeze({
      binding, version: found.version, lastCounter: found.lastCounter,
      expiresAt: found.expiresAt, algorithm: found.algorithm,
    })
    if (!Number.isSafeInteger(record.expiresAt) || record.expiresAt <= timestamp) return invalid()
    if (typeof record.version !== 'string' || !record.version.length ||
        !['SHA1', 'SHA256', 'SHA512'].includes(record.algorithm) ||
        (record.lastCounter !== null && (!Number.isSafeInteger(record.lastCounter) || record.lastCounter < 0))) throw new Error('INVALID_METHOD')
    const { TOTP, Secret } = await import('otpauth')
    plaintext = await deps.decryptSecret(record)
    // RFC 4226 minimum 128 bits; RFC 6238 keys are provisioned separately.
    // Bound decrypted input defensively; this is not an enrollment policy.
    if (!(plaintext instanceof Uint8Array) || plaintext.length < 16 || plaintext.length > 128) throw new Error('INVALID_SECRET')
    const secret = new Secret({ buffer: Uint8Array.from(plaintext).buffer })
    secretBytes = secret.bytes
    const period = numeric('totp_period'), window = numeric('totp_window')
    const delta = TOTP.validate({
      token: code, secret, algorithm: record.algorithm, digits: numeric('totp_digits'),
      period, timestamp, window,
    })
    if (delta === null) return invalid()
    const nextCounter = TOTP.counter({ period, timestamp }) + delta
    if (!Number.isSafeInteger(nextCounter) || nextCounter < 0 ||
        (record.lastCounter !== null && nextCounter <= record.lastCounter)) return invalid()
    // Re-read trusted time after asynchronous I/O, so slow decryption cannot extend a proof.
    const verifiedAt = now()
    if (!Number.isSafeInteger(verifiedAt) || verifiedAt < timestamp) throw new Error('CLOCK_UNAVAILABLE')
    if (verifiedAt >= record.expiresAt ||
        Math.abs(TOTP.counter({ period, timestamp: verifiedAt }) - nextCounter) > window) return invalid()
    const change: TotpConsumption = Object.freeze({
      binding, version: record.version, expectedCounter: record.lastCounter, nextCounter, verifiedAt,
    })
    if (await deps.consume(change) !== true) return invalid()
    return { verified: true }
  } catch {
    throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  } finally {
    // Best-effort zeroization of owned plaintext copies; JS cannot guarantee complete erasure.
    if (plaintext instanceof Uint8Array) plaintext.fill(0)
    secretBytes?.fill(0)
  }
}
