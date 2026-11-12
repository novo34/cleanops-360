/** TOTP enrollment custody for the private runtime: binds the approved-backend `enrollment`
 * capability to the installation's reviewed TOTP key inside an already acquired custody lease.
 * No key is created, selected from request data or copied; the borrowed bytes stay owned by custody.
 */
import { AuthError } from './service.ts'
import type { PrivateKeyReference } from './openbao-keys.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
type Borrow = <T>(reference: PrivateKeyReference, work: (key: Buffer) => T) => T
type TotpKeyVersion = Readonly<{ keyVersion: string; reference: PrivateKeyReference }>

export function createTotpEnrollmentCustody(versions: readonly TotpKeyVersion[], borrow: Borrow, origin: string) {
  // Neutral authenticator label: the installation host. Never an email, user or tenant identifier.
  const alias = new URL(origin).hostname
  if (!alias || typeof borrow !== 'function' || !Array.isArray(versions)) throw unavailable()
  return Object.freeze({
    async withWriteKey<T>(tenantId: string, work: (key: Buffer, keyVersion: string) => T): Promise<T> {
      // Exactly one reviewed TOTP key is the write key. With several versions the write key is a
      // rotation decision this runtime does not take: fail closed instead of guessing.
      const current = versions.length === 1 ? versions[0] : undefined
      if (!current || current.reference.purpose !== 'totp-aead' || typeof tenantId !== 'string' ||
          current.reference.tenantId.toLowerCase() !== tenantId.toLowerCase() || typeof work !== 'function') throw unavailable()
      return borrow(current.reference, key => {
        if (!Buffer.isBuffer(key) || key.length !== 32) throw unavailable()
        return work(key, current.keyVersion)
      })
    },
    async accountAlias(): Promise<string> { return alias },
  })
}
