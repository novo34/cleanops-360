import { randomUUID } from 'node:crypto'
import { canonical, valid } from './contracts.ts'
import { numeric } from './config.ts'
import { AuthError, digest, type Binding } from './service.ts'
import { prepareEmailOtp, emailOtpDigest, selectEnabledMethod } from './ceremony-preparation.ts'
import { sealMailPayload } from './mail-envelope.ts'
import type { V4Broker } from './v4-broker.ts'

export interface PrivateMailCustody {
  withWriteKey<T>(tenantId: string, work: (key: Buffer, version: string) => T): Promise<T>
}
type Purpose = 'LOGIN' | 'STEP_UP' | 'ENROLLMENT'
type Reference = { method: string; version: string; recipientVersion: string; purpose: Purpose; grant: string | null; resource: string | null; expiresAt: number }
const invalid = () => new AuthError(409, 'CEREMONY_UNAVAILABLE')
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => valid({ type: 'string', format: 'uuid' }, v)
const generation = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= BigInt('9223372036854775807')

/** Same caller-owned transaction as factors, audit, idempotency and session issuance.
 * Routing references use existing binding-scoped owned reservations. They contain
 * no proof, address, token or ciphertext and NEVER authorize consumption: SQL07
 * independently locks/revalidates the actual challenge, method and recipient.
 * No process-local cache, database tables, new grants or runtime activation. */
export function createEmailCeremony(broker: V4Broker, custody: PrivateMailCustody, hmac: Buffer,
  correlation: string, now: () => number) {
  function locator(binding: Binding, challenge: string) {
    if (!uuid(challenge) || !binding.tenantId || !binding.userId) throw invalid()
    return [Buffer.from(digest(challenge), 'hex'), Buffer.from(digest(canonical(['EMAIL_REFERENCE', binding.kind, binding.id, challenge])), 'hex')] as const
  }
  async function reference(cookie: string | null, binding: Binding, challenge: string): Promise<Reference> {
    const [key, hash] = locator(binding, challenge)
    const row = await broker.call('reserveOwned', [cookie, 'email-reference', key, hash, false])
    if (!object(row) || row.replay !== true || row.requestHash !== hash.toString('hex') || !object(row.data)) throw invalid()
    const r = row.data
    if (!uuid(r.method) || !generation(r.version) || !generation(r.recipientVersion) ||
        !['LOGIN', 'STEP_UP', 'ENROLLMENT'].includes(String(r.purpose)) ||
        !(r.grant === null || typeof r.grant === 'string') || !(r.resource === null || uuid(r.resource)) ||
        typeof r.expiresAt !== 'number' || r.expiresAt <= now() || r.expiresAt > binding.expiresAt ||
        (cookie === null ? r.purpose === 'LOGIN' : r.purpose === 'STEP_UP')) throw invalid()
    return r as Reference
  }
  async function material(cookie: string | null, binding: Binding, purpose: Purpose, grant: string | null, resource: string | null) {
    const m = await broker.call('mailMaterial', [cookie, purpose, grant, resource])
    if (!object(m) || m.bindingId !== binding.id || m.tenantId !== binding.tenantId || m.userId !== binding.userId ||
        !generation(m.recipientVersion) || !valid({ type: 'string', format: 'email', maxLength: numeric('email_max') }, m.recipient) ||
        typeof m.expiresAt !== 'string' || Date.parse(m.expiresAt) <= now() || Date.parse(m.expiresAt) > binding.expiresAt ||
        typeof m.recipientExpiresAt !== 'string' || Date.parse(m.recipientExpiresAt) <= now() || !Array.isArray(m.enabledMethods)) throw invalid()
    return m
  }
  async function issue(cookie: string | null, binding: Binding, purpose: Purpose, grant: string | null = null,
    resource: string | null = null, previous?: Reference) {
    const m = await material(cookie, binding, purpose, grant, resource)
    let method: string, version: string
    if (purpose === 'ENROLLMENT') {
      method = previous?.method ?? randomUUID(); version = '1'
      if (!previous && await broker.call('beginEmail', [cookie, method, String(m.recipientVersion), correlation]) !== method) throw invalid()
    } else {
      const selected = selectEnabledMethod(m.enabledMethods as Parameters<typeof selectEnabledMethod>[0], previous?.method)
      if (selected.kind !== 'EMAIL_OTP') throw invalid()
      method = selected.id; version = selected.version
    }
    if (previous && (previous.version !== version || previous.recipientVersion !== m.recipientVersion)) throw invalid()
    const challenge = randomUUID(), outbox = randomUUID(), issuedAt = now()
    const expiresAt = Math.min(issuedAt + numeric('email_otp_ttl') * 1000, Date.parse(String(m.expiresAt)), Date.parse(String(m.recipientExpiresAt)))
    const otp = prepareEmailOtp(cookie ?? binding.id, hmac)
    try {
      const sealed = await custody.withWriteKey(binding.tenantId!, (key, keyVersion) => ({ keyVersion,
        bytes: sealMailPayload({ recipient: String(m.recipient), code: otp.code, issuedAt, expiresAt }, key, keyVersion,
          { tenantId: binding.tenantId!, userId: binding.userId!, methodId: method, methodVersion: version,
            recipientVersion: String(m.recipientVersion), outboxId: outbox, challengeId: challenge }) }))
      try {
        const common = [cookie, method, version, String(m.recipientVersion), challenge, outbox, otp.proofDigest, sealed.bytes, sealed.keyVersion, new Date(expiresAt).toISOString()] as const
        const result = purpose === 'ENROLLMENT'
          ? await broker.call('issueEmailEnrollment', [...common, correlation])
          : await broker.call('issueEmail', [...common, grant, resource, correlation])
        if (result !== challenge) throw invalid()
      } finally { sealed.bytes.fill(0) }
    } finally { otp.proofDigest.fill(0) }
    const [key, hash] = locator(binding, challenge)
    const owned = await broker.call('reserveOwned', [cookie, 'email-reference', key, hash, false])
    if (!object(owned) || owned.replay !== false || owned.requestHash !== hash.toString('hex')) throw invalid()
    const ref: Reference = { method, version, recipientVersion: String(m.recipientVersion), purpose, grant, resource, expiresAt }
    if (!await broker.call('completeOwned', [cookie, 'email-reference', key, hash, JSON.stringify(ref)])) throw invalid()
    return { challenge_id: challenge, allowed_methods: ['EMAIL_OTP'], expires_at: new Date(expiresAt).toISOString() }
  }
  return Object.freeze({ issue,
    async resend(cookie: string | null, binding: Binding, challenge: string) {
      const r = await reference(cookie, binding, challenge)
      return issue(cookie, binding, r.purpose, r.grant, r.resource, r)
    },
    async verify(cookie: string | null, binding: Binding, challenge: string, proof: string, enrollment = false) {
      const r = await reference(cookie, binding, challenge)
      if ((r.purpose === 'ENROLLMENT') !== enrollment) throw invalid()
      const submitted = emailOtpDigest(proof, cookie ?? binding.id, hmac)
      try { return await broker.call('consumeEmail', [cookie, challenge, submitted, r.version, r.recipientVersion, correlation]) }
      finally { submitted.fill(0) }
    },
  })
}
