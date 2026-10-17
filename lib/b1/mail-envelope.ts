import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { canonical, valid } from './contracts.ts'
import { numeric } from './config.ts'
import { privateArtifact } from './ceremony-preparation.ts'
import { AuthError } from './service.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
/** Private codec, not proof of recipient verification or an installed worker contract. */
export type MailContext = Readonly<{ tenantId: string; userId: string; methodId: string; methodVersion: string;
  recipientVersion: string; outboxId: string; challengeId: string }>
export type MailPayload = Readonly<{ recipient: string; code: string; issuedAt: number; expiresAt: number }>
function aad(context: MailContext, version: string) {
  if (!context || typeof version !== 'string' || !version.length || /[\p{Cc}\p{Cf}]/u.test(version)) throw unavailable()
  for (const field of ['tenantId','userId','methodId','outboxId','challengeId'] as const)
    if (!valid({ type: 'string', format: 'uuid' }, context[field])) throw unavailable()
  for (const field of ['methodVersion','recipientVersion'] as const)
    if (typeof context[field] !== 'string' || !/^[1-9][0-9]{0,18}$/.test(context[field]) || BigInt(context[field]) > BigInt('9223372036854775807')) throw unavailable()
  return Buffer.from(canonical(['cleanops-mail-envelope-2', version, context.tenantId, context.userId, context.methodId,
    context.methodVersion, context.recipientVersion, context.outboxId, context.challengeId]))
}
function payload(value: unknown): asserts value is MailPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable()
  const item = value as Record<string, unknown>
  if (Object.keys(item).length !== 4 || !['recipient','code','issuedAt','expiresAt'].every(k => Object.hasOwn(item,k)) ||
      !valid({ type: 'string', format: 'email', maxLength: numeric('email_max') }, item.recipient) ||
      typeof item.code !== 'string' || !new RegExp('^[0-9]{'+numeric('otp_digits')+'}$').test(item.code) ||
      !Number.isSafeInteger(item.issuedAt) || !Number.isSafeInteger(item.expiresAt) ||
      Number(item.issuedAt) < 0 || Number(item.expiresAt) <= Number(item.issuedAt) ||
      Number(item.expiresAt) - Number(item.issuedAt) > numeric('email_otp_ttl') * 1000) throw unavailable()
}
function key(value: Buffer) { if (!Buffer.isBuffer(value) || value.length !== 32) throw unavailable() }
/** AES256GCM v2, separate MAIL AAD/domain and key purpose. No plaintext SQL or logs.
 * Consumer MUST revalidate verified recipient/method generations and lease in DB;
 * this codec cannot manufacture that authorization and is not wired to HTTP/runtime. */
export function sealMailPayload(value: MailPayload, encryptionKey: Buffer, version: string, context: MailContext): Buffer {
  key(encryptionKey); payload(value)
  const additional = aad(context,version), plaintext = Buffer.from(canonical(value)), nonce = randomBytes(12)
  try {
    if (plaintext.length > numeric('json_body_max')) throw unavailable()
    const cipher = createCipheriv('aes-256-gcm',encryptionKey,nonce,{ authTagLength: 16 })
    cipher.setAAD(additional)
    const encrypted = Buffer.concat([cipher.update(plaintext),cipher.final()])
    return Buffer.concat([Buffer.from([2]),nonce,cipher.getAuthTag(),encrypted])
  } catch { throw unavailable() }
  finally { plaintext.fill(0); additional.fill(0) }
}
export function openMailPayload(envelope: Buffer, encryptionKey: Buffer, version: string, context: MailContext, now: number): Readonly<MailPayload> {
  key(encryptionKey)
  if (!Number.isSafeInteger(now) || !Buffer.isBuffer(envelope) || envelope.length < 30 ||
      envelope.length > numeric('json_body_max') + 29 || envelope[0] !== 2) throw unavailable()
  const additional = aad(context,version)
  let provisional: Buffer | undefined, plaintext: Buffer | undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm',encryptionKey,envelope.subarray(1,13),{ authTagLength: 16 })
    decipher.setAAD(additional); decipher.setAuthTag(envelope.subarray(13,29))
    provisional = decipher.update(envelope.subarray(29))
    plaintext = Buffer.concat([provisional,decipher.final()])
    const value: unknown = JSON.parse(new TextDecoder('utf-8',{ fatal: true }).decode(plaintext))
    payload(value)
    if (now < value.issuedAt || now >= value.expiresAt) throw unavailable()
    return privateArtifact({}, value)
  } catch { throw unavailable() }
  finally { additional.fill(0); provisional?.fill(0); plaintext?.fill(0) }
}
