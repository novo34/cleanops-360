import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { Secret, TOTP } from 'otpauth'
import { canonical } from './contracts.ts'
import { numeric } from './config.ts'
import { AuthError } from './service.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)
export type CeremonySubject = Readonly<{ tenantId: string; userId: string; bindingId: string }>
export type EnrollmentAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'
export type EnrollmentAad = Readonly<{
  tenantId: string; userId: string; methodId: string; initialMethodVersion: '1'
}>
function subject(value: CeremonySubject) {
  if (!value || !uuid(value.tenantId) || !uuid(value.userId) || !uuid(value.bindingId)) throw unavailable()
}
function aad(value: EnrollmentAad, keyVersion: string) {
  if (!value || !uuid(value.tenantId) || !uuid(value.userId) || !uuid(value.methodId) ||
      value.initialMethodVersion !== '1' || typeof keyVersion !== 'string' || !keyVersion.length) throw unavailable()
  return Buffer.from(canonical(['cleanops-totp-envelope-1', keyVersion, value.tenantId, value.userId, value.methodId, value.initialMethodVersion]))
}
function key(value: Buffer) { if (!Buffer.isBuffer(value) || value.length !== 32) throw unavailable() }

/** Pure mapping of EXISTING V4 values, not authority to issue a session.
 * Risk must come from locked server material; unknown/absent risk never defaults. */
export function sessionPolicyForRisk(risk: unknown) {
  if (risk === 'SENSITIVE') return Object.freeze({ absoluteSeconds: numeric('absolute_sensitive'), idleSeconds: numeric('idle_sensitive') })
  if (risk === 'OPERATIONAL') return Object.freeze({ absoluteSeconds: numeric('absolute_operational'), idleSeconds: numeric('idle_operational') })
  throw unavailable()
}

/** Explicit server method choice only. An ambiguous set has no guessed preference/fallback. */
export function selectEnabledMethod(
  methods: readonly Readonly<{ id: string; kind: 'EMAIL_OTP' | 'TOTP'; version: string }>[],
  selectedId?: string,
) {
  if (!Array.isArray(methods) || methods.some(m => !m || !uuid(m.id) || !['EMAIL_OTP', 'TOTP'].includes(m.kind) || !/^[1-9][0-9]*$/.test(m.version)) ||
      new Set(methods.map(m => m.id)).size !== methods.length) throw unavailable()
  const selected = selectedId === undefined ? methods.length === 1 ? methods[0] : undefined : methods.find(m => m.id === selectedId)
  if (!selected) throw unavailable()
  return Object.freeze({ ...selected })
}

/** Candidate envelope for the pending contract. Standard AES-256-GCM, 96-bit random
 * nonce and 128-bit tag from node:crypto. No database, storage, logging or runtime hook.
 * Format: version byte 1 | nonce(12) | tag(16) | ciphertext.
 * AAD binds the INITIAL method generation; state/CAS version changes do not rekey it. */
export function sealEnrollmentSecret(plaintext: Uint8Array, encryptionKey: Buffer, keyVersion: string, context: EnrollmentAad): Buffer {
  key(encryptionKey)
  if (!(plaintext instanceof Uint8Array) || plaintext.length < 16 || plaintext.length > 128) throw unavailable()
  const additionalData = aad(context, keyVersion), nonce = randomBytes(12)
  try {
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, nonce)
    cipher.setAAD(additionalData)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted])
  } catch { throw unavailable() }
  finally { additionalData.fill(0) }
}
export function openEnrollmentSecret(envelope: Buffer, encryptionKey: Buffer, keyVersion: string, context: EnrollmentAad): Uint8Array {
  key(encryptionKey)
  if (!Buffer.isBuffer(envelope) || envelope.length < 45 || envelope.length > 157 || envelope[0] !== 1) throw unavailable()
  const additionalData = aad(context, keyVersion)
  let provisional: Buffer | undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, envelope.subarray(1, 13))
    decipher.setAAD(additionalData); decipher.setAuthTag(envelope.subarray(13, 29))
    provisional = decipher.update(envelope.subarray(29))
    const final = decipher.final()
    return Buffer.concat([provisional, final])
  } catch { throw unavailable() }
  finally { additionalData.fill(0); provisional?.fill(0) }
}

export type PreparedEnrollment = Readonly<{
  subject: CeremonySubject; methodId: string; initialVersion: '1'; algorithm: EnrollmentAlgorithm
  ciphertext: Buffer; keyVersion: string; provisioningUri: string
}>
/** Preparation only: NEVER expose provisioningUri before a future insert + COMMIT.
 * Algorithm and entropy are mandatory private policy inputs, with NO new defaults.
 * The SQL contract for accepting the assigned method remains pending approval. */
export function prepareTotpEnrollment(
  actor: CeremonySubject, policy: Readonly<{ algorithm: EnrollmentAlgorithm; secretBytes: number; issuer: string; label: string }>,
  encryptionKey: Buffer, keyVersion: string,
): PreparedEnrollment {
  subject(actor)
  if (!policy || !['SHA1', 'SHA256', 'SHA512'].includes(policy.algorithm) ||
      !Number.isSafeInteger(policy.secretBytes) || policy.secretBytes < 16 || policy.secretBytes > 128 ||
      typeof policy.issuer !== 'string' || !policy.issuer.length || typeof policy.label !== 'string' || !policy.label.length) throw unavailable()
  const captured = Object.freeze({ ...actor }), methodId = randomUUID()
  const context: EnrollmentAad = Object.freeze({ tenantId: captured.tenantId, userId: captured.userId, methodId, initialMethodVersion: '1' })
  const secret = new Secret({ size: policy.secretBytes })
  try {
    const ciphertext = sealEnrollmentSecret(secret.bytes, encryptionKey, keyVersion, context)
    const provisioningUri = new TOTP({ issuer: policy.issuer, label: policy.label, algorithm: policy.algorithm,
      digits: numeric('totp_digits'), period: numeric('totp_period'), secret }).toString()
    if (provisioningUri.length > numeric('provisioning_uri_max')) throw unavailable()
    return Object.freeze({ subject: captured, methodId, initialVersion: '1' as const, algorithm: policy.algorithm, ciphertext, keyVersion, provisioningUri })
  } finally { secret.bytes.fill(0) }
}

/** Shared HMAC domain for the already-approved EMAIL_OTP verifier.
 * scope is a trusted raw preauth cookie or current session UUID, never a browser selector.
 * No SMTP, outbox write or plaintext logging. Sealing/enqueue depend on a future approved plan. */
export function emailOtpDigest(code: string, scope: string, hmacKey: Buffer): Buffer {
  if (!Buffer.isBuffer(hmacKey) || hmacKey.length < 32 || typeof scope !== 'string' ||
      (!uuid(scope) && !/^[A-Za-z0-9_-]{43}$/.test(scope)) ||
      typeof code !== 'string' || !new RegExp('^[0-9]{' + numeric('otp_digits') + '}$').test(code)) throw unavailable()
  return createHmac('sha256', hmacKey).update(canonical(['EMAIL_OTP', scope, code])).digest()
}
export function prepareEmailOtp(scope: string, hmacKey: Buffer) {
  const digits = numeric('otp_digits')
  const code = String(randomInt(10 ** digits)).padStart(digits, '0')
  return Object.freeze({ code, proofDigest: emailOtpDigest(code, scope, hmacKey) })
}
