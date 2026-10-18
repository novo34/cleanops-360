import { randomBytes } from 'node:crypto'
import { numeric } from './config.ts'
import { AuthError } from './service.ts'

/** Internal factor result only: never grants identity, MFA, tenant or session authority. */
export type PasswordFactor = { verified: true } | AuthError
/** Execute under the credential lock, in the same transaction as attempts and audit.
 * Return false if the credential version/hash changed. Never overwrite a password reset. */
export type ReplacePasswordHash = (expectedHash: string, replacementHash: string) => Promise<boolean>

const options = Object.freeze({
  memoryCost: numeric('argon_memory'), timeCost: numeric('argon_iterations'),
  parallelism: numeric('argon_parallelism'), version: 0x13, hashLength: 32,
})
const invalid = () => new AuthError(401, 'AUTH_INVALID')

/** Private reset preparation only. The caller must supply the approved local password
 * admission/corpus checker; missing or unavailable policy never admits a replacement.
 * No credential write, identity grant, HTTP projection or production default here. */
export async function prepareReplacementHash(password: string, admit: (value: string) => Promise<boolean>): Promise<string | AuthError> {
  if (typeof password !== 'string' || !password.isWellFormed() || !password.length ||
      password.length > numeric('password_max') * 2 || [...password].length > numeric('password_max'))
    return new AuthError(422, 'INVALID_INPUT')
  if(typeof admit!=='function')throw new AuthError(503,'AUTH_DEPENDENCY_UNAVAILABLE')
  try {
    const accepted=await admit(password)
    if(accepted===false)return new AuthError(422,'INVALID_INPUT')
    if(accepted!==true)throw new Error('POLICY_UNAVAILABLE')
    const argon=await import('argon2')
    return await argon.hash(password,{...options,type:argon.argon2id,salt:randomBytes(numeric('argon_salt'))})
  } catch { throw new AuthError(503,'AUTH_DEPENDENCY_UNAVAILABLE') }
}

function canonicalBytes(value: string, min: number, max: number): boolean {
  const bytes = Buffer.from(value, 'base64')
  return bytes.length >= min && bytes.length <= max && bytes.toString('base64').replace(/=+$/, '') === value
}

/** Only bounded Argon2id PHC records enter the native library.
 * Legacy lower costs/version/short salt are upgraded after a valid proof.
 * Costs above the trial envelope fail closed; they are never silently downgraded.
 * Admission/concurrency limits remain the private adapter's responsibility. */
function record(encoded: string) {
  if (typeof encoded !== 'string' || encoded.length > 256) return null
  const parts = /^\$argon2id\$v=(16|19)\$m=([1-9][0-9]{0,5}),t=([1-9][0-9]?),p=([1-9][0-9]?)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(encoded)
  if (!parts) return null
  const [, version, memory, iterations, parallelism, salt, hash] = parts
  const m = Number(memory), t = Number(iterations), p = Number(parallelism)
  if (p !== options.parallelism || m < 8 * p || m > options.memoryCost || t > options.timeCost) return null
  if (!canonicalBytes(salt, 8, numeric('argon_salt')) || !canonicalBytes(hash, 16, options.hashLength)) return null
  return { version: Number(version), memory: m, iterations: t, salt, hash }
}

/** Call from Transaction.execute after account/rate checks, using a trusted stored hash.
 * Invalid proof returns AuthError so B1 commits failed attempts. Dependency or CAS errors
 * throw AuthError(503), causing rollback and the existing generic fail-closed response.
 * The replacement is never exposed to HTTP, and successful verification is not login. */
export async function verifyPasswordFactor(
  password: string, encoded: string, replace: ReplacePasswordHash,
): Promise<PasswordFactor> {
  if (typeof password !== 'string' || !password.length || password.length > numeric('password_max') * 2 ||
      [...password].length > numeric('password_max') || !password.isWellFormed()) return invalid()
  const stored = record(encoded)
  if (!stored) return invalid()
  try {
    const argon = await import('argon2')
    if (!await argon.verify(encoded, password)) return invalid()
    const upgrade = argon.needsRehash(encoded, options) ||
      Buffer.from(stored.salt, 'base64').length !== numeric('argon_salt') ||
      Buffer.from(stored.hash, 'base64').length !== options.hashLength
    if (upgrade) {
      const replacement = await argon.hash(password, {
        ...options, type: argon.argon2id, salt: randomBytes(numeric('argon_salt')),
      })
      if (!await replace(encoded, replacement)) throw new Error('CREDENTIAL_CHANGED')
    }
    return { verified: true }
  } catch {
    // Do not include plaintext, PHC records or native-library diagnostics in errors.
    throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  }
}
