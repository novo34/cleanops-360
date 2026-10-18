import { createEmailCeremony, type PrivateMailCustody } from './email-ceremony.ts'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { approvedTotpEnrollmentPolicy } from './enrollment-policy.ts'
import { canonical } from './contracts.ts'
import { numeric, profile } from './config.ts'
import { AuthError, digest, names, token, type Backend, type Binding, type Effect, type Input, type Transaction } from './service.ts'
import { selectTotpMethod, sessionPolicyForRisk, prepareSessionLabels, eligibleTotpMethods, validateTotpMethodLimit, prepareTotpEnrollment, type CeremonySubject } from './ceremony-preparation.ts'
import { createV4IdentityRepository } from './v4-broker.ts'
import { createApprovedFactors, type PrivateFactorKeys } from './approved-factors.ts'
import type { IdentityPool } from './pg-identity-driver.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const invalid = () => new AuthError(401, 'AUTH_INVALID')
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)
const hex = (value: string) => Buffer.from(value, 'hex')
function date(value: unknown): string {
  const d = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  if (!d || !Number.isFinite(d.getTime())) throw unavailable()
  return d.toISOString()
}
export interface ApprovedBackendDependencies {
  mail?: PrivateMailCustody
  factors: PrivateFactorKeys
  cursorKey: Buffer
  now?: () => number
  /** Already HMAC-keyed dimensions from trusted ingress, never headers/body or default IP. */
  transport(): Readonly<{ network: Buffer; device: Buffer }>
  /** Same normalization policy as account provisioning, never password normalization. */
  normalizeEmail(email: string): string
  /** Trusted private labels for new sessions; no browser/header defaults. */
  /** Explicit private bound; no production default. */
  maxEligibleTotpMethods?: number
  /** Private custody capability. Missing/unavailable custody fails closed; no runtime flag.
   * Provider must scope TOTP write keys to the tenant and wipe borrowed key bytes.
   * Operational OpenBao binding is not configured by this interface. */
  enrollment?: {
    withWriteKey<T>(tenantId: string, work: (key: Buffer, keyVersion: string) => T): Promise<T>
    accountAlias(subject: CeremonySubject): Promise<string>
  }
  sessionLabels?(): Readonly<{ device: string; browser: string }>
}
type PreparedChallenge = { challenge_id: string; allowed_methods: string[]; expires_at: string }
type RequiredSelection = { state: 'TOTP_SELECTION_REQUIRED'; methods: { method_id: string; kind: 'TOTP' }[]; expires_at: string }
type Reservation = { operation: string; key: Buffer; hash: string; oneTime: boolean; raw: string | null; done: boolean }
/** Uninstalled private Backend for the approved extension. One broker/connection for all
 * reads, factor proofs, CAS, effects, audit and idempotency. No runtime flag or setter. */
export function createApprovedPrivateBackend(pool: IdentityPool, deps: ApprovedBackendDependencies): Backend {
  if (!Buffer.isBuffer(deps.cursorKey) || deps.cursorKey.length < 32) throw unavailable()
  const repository = createV4IdentityRepository(pool), now = deps.now ?? Date.now
  const methodLimit = deps.maxEligibleTotpMethods === undefined ? undefined : validateTotpMethodLimit(deps.maxEligibleTotpMethods)
  function cursor(actor: Binding, kind: string, last: unknown): string {
    const payload = Buffer.from(canonical([actor.kind, actor.id, actor.tenantId ?? null, actor.userId ?? null, kind, actor.expiresAt, last])).toString('base64url')
    return payload + '.' + createHmac('sha256', deps.cursorKey).update(payload).digest('base64url')
  }
  function readCursor(actor: Binding, kind: string, encoded: unknown): unknown {
    if (encoded === undefined) return null
    if (typeof encoded !== 'string' || encoded.length > numeric('cursor_max')) throw new AuthError(400, 'INVALID_CURSOR')
    const [payload, signature, extra] = encoded.split('.')
    if (!payload || !signature || extra !== undefined) throw new AuthError(400, 'INVALID_CURSOR')
    const actual = Buffer.from(signature, 'base64url'), expected = createHmac('sha256', deps.cursorKey).update(payload).digest()
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AuthError(400, 'INVALID_CURSOR')
    let parts: unknown
    try { parts = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { throw new AuthError(400, 'INVALID_CURSOR') }
    if (!Array.isArray(parts) || parts.length !== 7 || canonical(parts.slice(0, 5)) !== canonical([actor.kind, actor.id, actor.tenantId ?? null, actor.userId ?? null, kind]) ||
        typeof parts[5] !== 'number' || parts[5] <= now() || parts[5] > actor.expiresAt) throw new AuthError(400, 'INVALID_CURSOR')
    return parts[6]
  }
  function transaction<T>(work: (tx: Transaction) => Promise<T>, context = { correlationId: randomUUID(), operation: '' }): Promise<T> {
    const correlation = context.correlationId, operationHint = context.operation
    if (!uuid(correlation)) return Promise.reject(unavailable())
    return repository.transaction(async broker => {
      const policy = await broker.call('policy', [])
      if (!object(policy) || canonical(policy) !== canonical(profile.values)) throw unavailable()
      const factors = createApprovedFactors(broker, deps.factors, correlation, now)
      const mail = deps.mail ? createEmailCeremony(broker, deps.mail, deps.factors.otpKey!, correlation, now) : undefined
      let actor: Binding | undefined, raw = '', csrf = ''
      const reservations = new Map<string, Reservation>()
      // Do not persist an offline-guessable SHA fingerprint of six-digit proofs.
      const requestTag = (hash: string) => createHmac('sha256', deps.factors.auditKey).update(canonical(['B1_OWNED_REQUEST_V1', hash])).digest('hex')
      let stepUpRequest: { grant: string; resource: string | null } | undefined
      function owns(binding: Binding) { if (!actor || binding !== actor) throw invalid(); return actor }
      function preauth() { if (!actor || actor.kind === 'BOOTSTRAP') throw invalid(); return actor.kind === 'PREAUTH' ? raw : null }
      async function resolveAgain() {
        if (!actor) throw invalid()
        const latest = await broker.call('binding', [raw, csrf, actor.kind])
        if (!object(latest) || latest.id !== actor.id || latest.kind !== actor.kind ||
            (latest.tenantId ?? undefined) !== actor.tenantId || (latest.userId ?? undefined) !== actor.userId ||
            latest.csrfDigest !== actor.csrfDigest || typeof latest.expiresAt !== 'number' || latest.expiresAt <= now()) throw invalid()
      }
      async function activeSummary(binding: Binding) {
        const data = await broker.call('activeSummary', [])
        if (!object(data) || data.state !== 'ACTIVE' || data.session_id !== binding.sessionId || data.tenant_id !== binding.tenantId ||
            Date.parse(String(data.absolute_expires_at)) > (binding.absoluteExpiresAt ?? binding.expiresAt)) throw unavailable()
        return { state: 'ACTIVE', session_id: data.session_id, tenant_id: data.tenant_id, absolute_expires_at: date(data.absolute_expires_at) }
      }
      async function ownedInternal<T>(cookie: string | null, operation: string, input: Input, work: () => Promise<T>): Promise<T> {
        const scope = 'internal:' + randomUUID(), key = hex(digest(token())), hash = digest(canonical(input))
        const result = await broker.call('reserveOwned', [cookie, operation, key, hex(requestTag(hash)), true])
        if (!object(result) || result.replay !== false || result.requestHash !== requestTag(hash) || result.oneTime !== true ||
            typeof result.expiresAt !== 'number' || result.expiresAt <= now()) throw unavailable()
        const r: Reservation = { operation, key, hash, oneTime: true, raw: cookie, done: false }
        reservations.set(scope, r)
        const outcome = await work()
        const ok = outcome instanceof AuthError ?
          await broker.call('discardOwned', [cookie, operation, key, hex(requestTag(hash))]) :
          await broker.call('completeOwned', [cookie, operation, key, hex(requestTag(hash)), null])
        if (!ok) throw unavailable()
        r.done = true
        return outcome
      }
      async function material(cookie: string | null, purpose: 'LOGIN' | 'STEP_UP' | 'ISSUE_SESSION' | 'ENROLLMENT',
        expected: { id: string; tenantId?: string; userId?: string; expiresAt: number }, grant: string | null = null, resource: string | null = null) {
        const value = await broker.call('mfaMaterial', [cookie, purpose, grant, resource])
        const expiresAt = Date.parse(value.expiresAt)
        if (value.bindingId !== expected.id || value.tenantId !== expected.tenantId ||
            (expected.userId !== undefined && value.userId !== expected.userId) ||
            !Number.isSafeInteger(expiresAt) || expiresAt <= now() || expiresAt > expected.expiresAt) throw invalid()
        if (purpose === 'LOGIN' || purpose === 'STEP_UP') eligibleTotpMethods(value.enabledMethods, methodLimit)
        sessionPolicyForRisk(value.riskClass)
        return value
      }
      async function totpChallenge(cookie: string | null, purpose: 'LOGIN' | 'STEP_UP',
        expected: { id: string; tenantId?: string; userId?: string; expiresAt: number },
        grant: string | null = null, resource: string | null = null, selectedId?: string, expectedVersion?: string,
        allowSelection = false): Promise<PreparedChallenge | RequiredSelection> {
        const value = await material(cookie, purpose, expected, grant, resource)
        if (selectedId === undefined && value.enabledMethods.length > 0 && value.enabledMethods.every(method => method.kind === 'EMAIL_OTP')) {
          if (!mail) throw unavailable()
          const binding: Binding = { kind: cookie === null ? 'ACTIVE' : 'PREAUTH', id: expected.id, tenantId: value.tenantId,
            userId: value.userId, expiresAt: expected.expiresAt, csrfDigest: '' }
          return mail.issue(cookie, binding, purpose, grant, resource)
        }
        const eligible = eligibleTotpMethods(value.enabledMethods, methodLimit)
        if (allowSelection && selectedId === undefined && eligible.length > 1)
          return { state: 'TOTP_SELECTION_REQUIRED', methods: eligible.map(m => ({ method_id: m.id, kind: 'TOTP' })), expires_at: date(value.expiresAt) }
        // Selector is a locator; generation always comes from the locked material.
        const selected = selectTotpMethod(value.enabledMethods, selectedId)
        if (expectedVersion !== undefined && selected.version !== expectedVersion) throw invalid()
        const challenge = await broker.call('boundChallenge', [cookie, 'TOTP', selected.id, selected.version, null, null, null, grant, resource, correlation])
        const detail = await broker.call('totpMaterial', [cookie, challenge, purpose])
        if (!object(detail) || !object(detail.binding) || detail.binding.tenantId !== value.tenantId ||
            detail.binding.userId !== value.userId || detail.binding.methodId !== selected.id ||
            detail.binding.ceremonyId !== challenge || detail.binding.purpose !== purpose || detail.version !== selected.version ||
            (detail.grant_key ?? null) !== grant || (detail.resource_id ?? null) !== resource ||
            (purpose === 'STEP_UP' && detail.session_id !== expected.id) ||
            typeof detail.expiresAt !== 'number' || !Number.isSafeInteger(detail.expiresAt) ||
            detail.expiresAt <= now() || detail.expiresAt > Date.parse(value.expiresAt)) throw unavailable()
        return { challenge_id: challenge, allowed_methods: ['TOTP'], expires_at: new Date(detail.expiresAt).toISOString() }
      }
      async function preauthResult(cookie: string, expected?: { id: string; tenantId: string }): Promise<{ data: Input; expiresAt: number }> {
        const summary = await broker.call('preauthSummary', [cookie])
        if (!object(summary)) throw unavailable()
        const expiresAt = Date.parse(String(summary.expires_at))
        if (!Number.isSafeInteger(expiresAt) || expiresAt <= now() || expiresAt > now() + numeric('preauth_ttl') * 1000) throw unavailable()
        if (summary.state === 'TENANT_SELECTION_REQUIRED') return { data: { state: summary.state, expires_at: new Date(expiresAt).toISOString() }, expiresAt }
        if (summary.state === 'ENROLLMENT_REQUIRED') return { data: { state: summary.state, allowed_methods: ['TOTP'], expires_at: new Date(expiresAt).toISOString() }, expiresAt }
        if (summary.state !== 'PENDING_MFA' || !expected) throw unavailable()
        const data = await ownedInternal(cookie, operationHint === 'switchTenant' ? 'switchTenant' : 'login', { binding: expected.id, tenant: expected.tenantId }, () =>
          totpChallenge(cookie, 'LOGIN', { ...expected, expiresAt }, null, null, undefined, undefined, true))
        return { data: 'state' in data ? data : { state: 'PENDING_MFA', ...data }, expiresAt }
      }
      async function issueSession(binding: Binding): Promise<Effect> {
        const value = await material(raw, 'ISSUE_SESSION', binding), policy = sessionPolicyForRisk(value.riskClass)
        const labels = prepareSessionLabels(deps.sessionLabels?.())
        const cookie = token(), newCsrf = token()
        const result = await broker.call('issueSession', [raw, hex(digest(cookie)), hex(digest(newCsrf)),
          policy.absoluteSeconds, policy.idleSeconds, labels.device, labels.browser, correlation])
        if (!object(result) || result.state !== 'ACTIVE' || !uuid(result.session_id) || result.tenant_id !== binding.tenantId) throw unavailable()
        const absolute = Date.parse(String(result.absolute_expires_at))
        if (!Number.isSafeInteger(absolute) || absolute <= now() || absolute > now() + policy.absoluteSeconds * 1000) throw unavailable()
        return { data: { state: 'ACTIVE', session_id: result.session_id, tenant_id: result.tenant_id, absolute_expires_at: new Date(absolute).toISOString() },
          transition: { kind: 'ACTIVE', token: cookie, csrf: newCsrf, expiresAt: Math.min(absolute, now() + policy.idleSeconds * 1000) } }
      }
      async function factorDenied(binding: Binding) {
        const pseudonym = createHmac('sha256', deps.factors.auditKey).update(canonical(['MFA_DENIED', binding.id])).digest()
        try { await broker.call('securityEvent', ['MFA_DENIED', pseudonym, null, null, correlation]) }
        finally { pseudonym.fill(0) }
        return new AuthError(422, 'MFA_INVALID')
      }
      async function auth(binding: Binding, rule: string, resource?: string) {
        owns(binding)
        const rows = await broker.call('authorization', [preauth(), rule, resource ?? null])
        if (rows.length !== 1 || typeof rows[0].allowed !== 'boolean' || typeof rows[0].step_up !== 'boolean') throw unavailable()
        if (binding.kind === 'ACTIVE' && rows[0].allowed === true) stepUpRequest = { grant: rule, resource: resource ?? null }
        return rows[0]
      }
      function reservation(scope: string) {
        const r = reservations.get(scope)
        if (!r || r.done) throw unavailable()
        return r
      }
      const tx: Transaction = {
        async resolve(cookies) {
          if (actor) throw unavailable()
          const preferPreauth = ['verifyMfa', 'recoverMfa', 'confirmTotp', 'switchTenant', 'listAuthorizedTenants', 'enrollTotp', 'enrollEmail', 'confirmEmail', 'resendEmailEnrollment', 'resendEmail', 'resendOtp', 'selectTotpMethod'].includes(operationHint)
          const mode = operationHint === 'login' ? 'BOOTSTRAP' :
            preferPreauth && cookies[names.preauth] ? 'PREAUTH' : cookies[names.session] ? 'ACTIVE' : 'PREAUTH'
          raw = cookies[mode === 'ACTIVE' ? names.session : names.preauth] ?? ''; csrf = cookies[names.csrf] ?? ''
          if (!/^[A-Za-z0-9_-]{43}$/.test(raw) || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) return null
          const value = await broker.call('binding', [raw, csrf, mode])
          if (!object(value) || value.kind !== mode || typeof value.id !== 'string' || typeof value.csrfDigest !== 'string' ||
              !/^[a-f0-9]{64}$/.test(value.csrfDigest) || typeof value.expiresAt !== 'number' ||
              !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now()) throw invalid()
          const b: Binding = { kind: mode, id: value.id, csrfDigest: value.csrfDigest, expiresAt: value.expiresAt }
          if (mode === 'ACTIVE') {
            if (!uuid(value.id) || !uuid(value.tenantId) || !uuid(value.userId) || !uuid(value.sessionId)) throw invalid()
            Object.assign(b, { tenantId: value.tenantId, userId: value.userId, sessionId: value.sessionId })
            const summary = await broker.call('activeSummary', [])
            if (!object(summary) || summary.session_id !== b.sessionId || summary.tenant_id !== b.tenantId) throw invalid()
            const absolute = Date.parse(String(summary.absolute_expires_at))
            if (!Number.isSafeInteger(absolute) || absolute < b.expiresAt) throw invalid()
            b.absoluteExpiresAt = absolute
          } else if (mode === 'PREAUTH') {
            if (!uuid(value.id) || !['TENANT_SELECTION_REQUIRED', 'PENDING_MFA', 'ENROLLMENT_REQUIRED'].includes(String(value.state))) throw invalid()
            b.state = value.state as Binding['state']
            if (b.state !== 'TENANT_SELECTION_REQUIRED') {
              if (!uuid(value.tenantId) || !uuid(value.userId)) throw invalid()
              Object.assign(b, { tenantId: value.tenantId, userId: value.userId })
            } else if (value.tenantId || value.userId) throw invalid()
          }
          actor = Object.freeze(b); return actor
        },
        async authorize(binding, rule, resource) { return (await auth(binding, rule, resource)).allowed === true },
        async stepUp(binding, rule, resource) { return (await auth(binding, rule, resource)).step_up === true },
        async rateLimit(operation, binding) {
          owns(binding)
          if (!['login', 'verifyMfa', 'recoverMfa', 'resendOtp', 'startStepUp', 'enrollTotp', 'confirmTotp', 'enrollEmail', 'confirmEmail', 'resendEmailEnrollment', 'resendEmail', 'selectTotpMethod'].includes(operation)) return null
          const transport = deps.transport()
          if (![transport.network, transport.device].every(key => Buffer.isBuffer(key) && key.length === 32)) throw unavailable()
          const purpose = operation === 'login' ? 'LOGIN' : ['verifyMfa', 'recoverMfa', 'confirmTotp', 'confirmEmail'].includes(operation) ? 'OTP_VERIFY' : 'OTP_ISSUE'
          const subject = createHmac('sha256', deps.factors.auditKey).update(canonical([purpose, binding.tenantId ?? null, binding.userId ?? binding.id])).digest()
          const values = [subject, transport.network, transport.device], dims = ['USER', 'IP', 'DEVICE'] as const
          const limits = purpose === 'LOGIN' ? [numeric('login_user_limit'), numeric('login_ip_limit'), numeric('login_device_limit')] :
            [numeric('otp_issue_user_limit'), numeric('otp_issue_ip_limit'), numeric('otp_issue_device_limit')]
          let retry = 0
          for (let i = 0; i < values.length; i++) retry = Math.max(retry, await broker.call('rateAttempt', [values[i], dims[i], purpose, limits[i]]))
          return retry > 0 ? retry : null
        },
        async reserve(scope, requestHash) {
          if (!actor || actor.kind === 'BOOTSTRAP' || !/^[a-f0-9]{64}$/.test(requestHash) || reservations.has(scope)) throw unavailable()
          let parts: unknown
          try { parts = JSON.parse(scope) } catch { throw unavailable() }
          if (!Array.isArray(parts) || parts.length !== 6 ||
              canonical(parts.slice(0, 4)) !== canonical([actor.kind, actor.id, actor.tenantId ?? null, actor.userId ?? null]) ||
              typeof parts[4] !== 'string' || typeof parts[5] !== 'string') throw unavailable()
          if (operationHint && parts[4] !== operationHint) throw unavailable()
          const operation = parts[4], oneTime = ['enrollTotp', 'confirmTotp', 'enrollEmail', 'confirmEmail', 'resendEmailEnrollment', 'recoverMfa'].includes(operation), key = hex(digest(parts[5])), rawPreauth = preauth()
          const result = await broker.call('reserveOwned', [rawPreauth, operation, key, hex(requestTag(requestHash)), oneTime])
          if (!object(result) || typeof result.replay !== 'boolean' || result.requestHash !== requestTag(requestHash) ||
              result.oneTime !== oneTime || typeof result.expiresAt !== 'number' || result.expiresAt <= now()) throw unavailable()
          if (result.replay && ['startStepUp', 'resendOtp', 'resendEmail', 'selectTotpMethod'].includes(operation)) {
            if (operation === 'startStepUp' && object(result.data) && result.data.state === 'TOTP_SELECTION_REQUIRED') {
              if (!stepUpRequest) throw unavailable()
              const current = await material(rawPreauth, 'STEP_UP', actor, stepUpRequest.grant, stepUpRequest.resource)
              const methods = eligibleTotpMethods(current.enabledMethods, methodLimit).map(m => ({ method_id: m.id, kind: 'TOTP' }))
              if (methods.length < 2 || canonical(methods) !== canonical(result.data.methods) ||
                  Date.parse(String(result.data.expires_at)) <= now() ||
                  Date.parse(String(result.data.expires_at)) > Date.parse(current.expiresAt))
                throw new AuthError(409, 'SELECTION_CHANGED')
              return { replay: true, requestHash, oneTime, expiresAt: result.expiresAt, data: result.data }
            }
            if (!object(result.data) || !uuid(result.data.challenge_id) ||
                Date.parse(String(result.data.expires_at)) <= now()) throw unavailable()
            if (result.data.method === 'EMAIL_OTP' || (Array.isArray(result.data.allowed_methods) && result.data.allowed_methods.includes('EMAIL_OTP'))) throw new AuthError(409, 'RESULT_NOT_REPLAYABLE')
            const purpose = actor.kind === 'ACTIVE' ? 'STEP_UP' : 'LOGIN'
            const detail = await broker.call('totpMaterial', [rawPreauth, result.data.challenge_id, purpose])
            if (!object(detail) || !object(detail.binding) || detail.binding.tenantId !== actor.tenantId ||
                detail.binding.userId !== actor.userId || detail.binding.ceremonyId !== result.data.challenge_id ||
                detail.binding.purpose !== purpose || typeof detail.expiresAt !== 'number' ||
                detail.expiresAt <= now() || detail.expiresAt !== Date.parse(String(result.data.expires_at))) throw invalid()
            const grant = detail.grant_key ?? null, resource = detail.resource_id ?? null
            if (actor.kind === 'ACTIVE') {
              if (typeof grant !== 'string' || (resource !== null && !uuid(resource)) ||
                  !(await auth(actor, grant, resource === null ? undefined : String(resource))).allowed) throw new AuthError(403, 'POLICY_DENIED')
            }
            const fresh = await material(rawPreauth, purpose, actor, grant as string | null, resource as string | null)
            const selected = selectTotpMethod(fresh.enabledMethods, String(detail.binding.methodId))
            if (selected.version !== detail.version) throw invalid()
          }
          if (!result.replay) reservations.set(scope, { operation, key, hash: requestHash, oneTime, raw: rawPreauth, done: false })
          return { replay: result.replay, requestHash, oneTime, expiresAt: result.expiresAt, data: result.data }
        },
        async discard(scope) {
          const r = reservation(scope)
          if (!await broker.call('discardOwned', [r.raw, r.operation, r.key, hex(requestTag(r.hash))])) throw unavailable()
          r.done = true
        },
        async complete(scope, hash, data, oneTime) {
          const r = reservation(scope)
          if (hash !== r.hash || oneTime !== r.oneTime || (oneTime && data !== null)) throw unavailable()
          if (!await broker.call('completeOwned', [r.raw, r.operation, r.key, hex(requestTag(hash)), oneTime ? null : JSON.stringify(data)])) throw unavailable()
          r.done = true
        },
        async execute(operation, input, binding): Promise<Effect | AuthError> {
          owns(binding); await resolveAgain()
          if (['recoverMfa', 'logout', 'revokeSelfSession', 'revokeOtherOwnSessions', 'switchTenant', 'enrollTotp', 'confirmTotp', 'enrollEmail', 'confirmEmail', 'resendEmailEnrollment', 'resendEmail', 'startStepUp', 'resendOtp', 'selectTotpMethod'].includes(operation) &&
              ![...reservations.values()].some(r => !r.done && r.operation === operation && (!['enrollTotp', 'confirmTotp', 'enrollEmail', 'confirmEmail', 'resendEmailEnrollment', 'recoverMfa'].includes(operation) || r.oneTime))) throw unavailable()
          if (operation === 'getCurrentIdentity') {
            const rows = await broker.call('identity', [])
            if (rows.length !== 1 || rows[0].tenant_id !== binding.tenantId || rows[0].id !== binding.userId) throw unavailable()
            return { data: rows[0] }
          }
          if (operation === 'listAuthorizedTenants') {
            const rows = await broker.call('memberships', [preauth()]), limit = Number(input.limit ?? numeric('page_default'))
            if (rows.length > numeric('membership_max') || !Number.isInteger(limit) || limit < 1 || limit > numeric('page_max') ||
                rows.some(r => !uuid(r.id) || typeof r.name !== 'string')) throw unavailable()
            const after = readCursor(binding, 'TENANTS', input.cursor)
            if (after !== null && !uuid(after)) throw new AuthError(400, 'INVALID_CURSOR')
            const filtered = rows.sort((a, b) => String(a.id).localeCompare(String(b.id))).filter(r => after === null || String(r.id) > String(after))
            const items = filtered.slice(0, limit)
            return { data: { items, next_cursor: filtered.length > limit ? cursor(binding, 'TENANTS', items.at(-1)!.id) : null } }
          }
          if (operation === 'listSelfSessions') {
            const limit = Number(input.limit ?? numeric('page_default')), after = readCursor(binding, 'SESSIONS', input.cursor)
            if (!Number.isInteger(limit) || limit < 1 || limit > numeric('page_max')) throw new AuthError(400, 'INVALID_INPUT')
            if (after !== null && (!object(after) || !uuid(after.id) || typeof after.time !== 'string')) throw new AuthError(400, 'INVALID_CURSOR')
            const key = after as { id: string; time: string } | null
            const rows = await broker.call('sessions', [limit, key ? date(key.time) : null, key?.id ?? null])
            if (rows.length > limit || rows.some(r => r.tenant_id !== binding.tenantId || r.user_id !== binding.userId)) throw unavailable()
            const items = rows.map(r => ({ id: r.id, tenant_id: r.tenant_id, user_id: r.user_id,
              device_label: r.device_label, browser_label: r.browser_label, is_current: r.is_current,
              created_at: date(r.created_at), last_activity_at: date(r.last_activity_at), absolute_expires_at: date(r.absolute_expires_at) }))
            const last = items.at(-1)
            return { data: { items, next_cursor: last && rows.length === limit ? cursor(binding, 'SESSIONS', { id: last.id, time: last.created_at }) : null } }
          }
          if (['logout', 'revokeSelfSession', 'revokeOtherOwnSessions'].includes(operation)) {
            const target = operation === 'logout' ? binding.sessionId : input.session_id
            if (operation !== 'revokeOtherOwnSessions' && !uuid(target)) throw unavailable()
            const count = operation === 'revokeOtherOwnSessions' ? await broker.call('revokeOtherSessions', [correlation]) :
              await broker.call('revokeSession', [String(target), correlation])
            if (operation !== 'revokeOtherOwnSessions' && count > 1) throw unavailable()
            return { data: { state: 'REVOKED', revoked_count: count }, clearSession: target === binding.sessionId }
          }
          if (operation === 'login') {
            const email = deps.normalizeEmail(String(input.email))
            if (!email || email.length > numeric('email_max')) return invalid()
            const userBucket = createHmac('sha256', deps.factors.auditKey).update(canonical(['LOGIN', email])).digest()
            const retry = await broker.call('rateAttempt', [userBucket, 'USER', 'LOGIN', numeric('login_user_limit')])
            if (retry > 0) return new AuthError(429, 'RATE_LIMITED', retry)
            const proof = await factors.password(email, String(input.password))
            if (proof instanceof AuthError) return proof
            const cookie = token(), newCsrf = token()
            const preauthId = await factors.preauth(proof, null, hex(digest(cookie)), hex(digest(newCsrf)))
            const memberships = await broker.call('memberships', [cookie])
            if (memberships.length > numeric('membership_max') || memberships.some(r => !uuid(r.id))) throw unavailable()
            const matching = input.organization_hint === undefined ? [] : memberships.filter(r => r.id === input.organization_hint)
            const chosen = matching.length === 1 ? matching[0] : memberships.length === 1 ? memberships[0] : undefined
            if (chosen) await broker.call('selectTenant', [cookie, String(chosen.id), correlation])
            const result = await preauthResult(cookie, chosen ? { id: preauthId, tenantId: String(chosen.id) } : undefined)
            return { data: result.data, transition: { kind: 'PREAUTH', token: cookie, csrf: newCsrf, expiresAt: result.expiresAt } }
          }
          if (operation === 'switchTenant') {
            const target = String(input.target_tenant_id)
            if (!uuid(target)) throw invalid()
            // No approved PREAUTH selection rotation primitive; keep that path closed.
            if (binding.kind === 'PREAUTH') throw unavailable()
            const cookie = token(), newCsrf = token()
            const preauthId = await broker.call('beginSwitch', [cookie, hex(digest(newCsrf)), target, correlation])
            const result = await preauthResult(cookie, { id: preauthId, tenantId: target })
            return { data: result.data, transition: { kind: 'PREAUTH', token: cookie, csrf: newCsrf, expiresAt: result.expiresAt } }
          }
          if (operation === 'startStepUp') {
            if (binding.kind !== 'ACTIVE') throw invalid()
            const grant = String(input.grant_id), resource = input.resource_id === undefined ? null : String(input.resource_id)
            if (!['B1-SELF-04', 'B1-SELF-05', 'B1-SELF-06', 'B1-SELF-08'].includes(grant) ||
                ((grant === 'B1-SELF-08') !== (resource !== null)) || (resource !== null && !uuid(resource))) throw invalid()
            if (!(await auth(binding, grant, resource ?? undefined)).allowed) throw new AuthError(403, 'POLICY_DENIED')
            return { data: await totpChallenge(null, 'STEP_UP', binding, grant, resource, undefined, undefined, true) }
          }
          if (operation === 'selectTotpMethod') {
            validateTotpMethodLimit(methodLimit)
            if (typeof input.totp_method_id !== 'string') throw new AuthError(422, 'INVALID_INPUT')
            if (binding.kind !== 'ACTIVE' && (binding.kind !== 'PREAUTH' || binding.state !== 'PENDING_MFA')) throw invalid()
            const grant = input.grant_id === undefined ? null : String(input.grant_id)
            const resource = input.resource_id === undefined ? null : String(input.resource_id)
            if (binding.kind === 'ACTIVE') {
              if (grant === null || !['B1-SELF-04', 'B1-SELF-05', 'B1-SELF-06', 'B1-SELF-08'].includes(grant) ||
                  ((grant === 'B1-SELF-08') !== (resource !== null)) || (resource !== null && !uuid(resource)))
                throw new AuthError(422, 'INVALID_INPUT')
              if (!(await auth(binding, grant, resource ?? undefined)).allowed) throw new AuthError(403, 'POLICY_DENIED')
            } else if (grant !== null || resource !== null) throw new AuthError(422, 'INVALID_INPUT')
            const data = await totpChallenge(preauth(), binding.kind === 'ACTIVE' ? 'STEP_UP' : 'LOGIN',
              binding, grant, resource, input.totp_method_id as string)
            if ('state' in data) throw unavailable()
            return { data: binding.kind === 'PREAUTH' ? { state: 'PENDING_MFA', ...data } : data }
          }
          if (operation === 'recoverMfa') {
            if (binding.kind !== 'PREAUTH' || binding.state !== 'PENDING_MFA' || !binding.tenantId || !binding.userId ||
                typeof input.recovery_code !== 'string' || !/^[A-Z2-7]{26}$/.test(input.recovery_code) ||
                !Buffer.isBuffer(deps.factors.recoveryKey) || deps.factors.recoveryKey.length < 32) throw invalid()
            const cookie = token(), newCsrf = token()
            const proof = createHmac('sha256', deps.factors.recoveryKey).update(canonical(['RECOVERY', binding.tenantId, binding.userId, input.recovery_code])).digest()
            let id: unknown
            try { id = await broker.call('recoverEnrollment', [raw, proof, hex(digest(cookie)), hex(digest(newCsrf)), correlation]) }
            finally { proof.fill(0) }
            if (id === null) return factorDenied(binding)
            if (!uuid(id)) throw unavailable()
            const result = await preauthResult(cookie, {id, tenantId:binding.tenantId})
            if (result.data.state !== 'ENROLLMENT_REQUIRED' || result.expiresAt > binding.expiresAt) throw unavailable()
            return { data: result.data, transition: {kind:'PREAUTH',token:cookie,csrf:newCsrf,expiresAt:result.expiresAt} }
          }
          if (['enrollEmail', 'confirmEmail', 'resendEmailEnrollment'].includes(operation)) {
            if (!mail || (binding.kind !== 'ACTIVE' && binding.state !== 'ENROLLMENT_REQUIRED')) throw unavailable()
            if (operation === 'enrollEmail') return { data: await mail.issue(preauth(), binding, 'ENROLLMENT') }
            if (operation === 'resendEmailEnrollment') return { data: await mail.resend(preauth(), binding, String(input.challenge_id)) }
            const ok = await mail.verify(preauth(), binding, String(input.challenge_id), String(input.proof), true)
            if (!ok) return factorDenied(binding)
            return binding.kind === 'ACTIVE' ? { data: await activeSummary(binding) } : issueSession(binding)
          }
          if (operation === 'resendEmail' || operation === 'resendOtp') {
            if (mail) {
              // EMAIL references live in a separate owned namespace. A lookup for a
              // TOTP UUID would create a pending reservation, so routing is explicit.
              if (operation === 'resendEmail') {
                const data = await mail.resend(preauth(), binding, String(input.challenge_id))
                return { data: { challenge_id: data.challenge_id, method: 'EMAIL_OTP', expires_at: data.expires_at } }
              }
            }

            const purpose = binding.kind === 'ACTIVE' ? 'STEP_UP' : 'LOGIN', cookie = preauth()
            const previous = await broker.call('totpMaterial', [cookie, String(input.challenge_id), purpose])
            if (!object(previous) || !object(previous.binding) || previous.binding.tenantId !== binding.tenantId ||
                previous.binding.userId !== binding.userId || previous.binding.ceremonyId !== input.challenge_id ||
                previous.binding.purpose !== purpose || !uuid(previous.binding.methodId) ||
                typeof previous.expiresAt !== 'number' || previous.expiresAt <= now()) throw invalid()
            const grant = previous.grant_key ?? null, resource = previous.resource_id ?? null
            if (binding.kind === 'ACTIVE') {
              if (typeof grant !== 'string' || (resource !== null && !uuid(resource)) ||
                  !(await auth(binding, grant, resource === null ? undefined : String(resource))).allowed) throw new AuthError(403, 'POLICY_DENIED')
            } else if (grant !== null || resource !== null) throw invalid()
            const data = await totpChallenge(cookie, purpose, binding, grant as string | null, resource as string | null, previous.binding.methodId, String(previous.version))
            if ('state' in data) throw unavailable()
            return { data: { challenge_id: data.challenge_id, method: 'TOTP', expires_at: data.expires_at } }
          }
          if (operation === 'enrollTotp') {
            if (!deps.enrollment || methodLimit === undefined || !binding.tenantId || !binding.userId ||
                (binding.kind !== 'ACTIVE' && (binding.kind !== 'PREAUTH' || binding.state !== 'ENROLLMENT_REQUIRED'))) throw unavailable()
            const trusted = await material(preauth(), 'ENROLLMENT', binding)
            if (eligibleTotpMethods(trusted.enabledMethods, methodLimit).length >= methodLimit) return new AuthError(409, 'METHOD_LIMIT')
            const subject = Object.freeze({ tenantId: trusted.tenantId, userId: trusted.userId, bindingId: trusted.bindingId })
            const label = await deps.enrollment.accountAlias(subject)
            if (typeof label !== 'string' || !label.trim() || /[\p{Cc}\p{Cf}]/u.test(label)) throw unavailable()
            const prepared = await deps.enrollment.withWriteKey(subject.tenantId, (key, keyVersion) =>
              prepareTotpEnrollment(subject, { ...approvedTotpEnrollmentPolicy, label }, key, keyVersion))
            try {
              const assigned = await broker.call('enrollAssigned', [preauth(), subject.tenantId, subject.userId,
                prepared.methodId, prepared.initialVersion, prepared.ciphertext, prepared.keyVersion, prepared.algorithm, correlation])
              const expiresAt = Date.parse(assigned.expiresAt)
              if (expiresAt <= now() || expiresAt > Date.parse(trusted.expiresAt)) throw unavailable()
              return { data: { enrollment_id: assigned.methodId, provisioning_uri: prepared.provisioningUri, expires_at: date(assigned.expiresAt) } }
            } finally { prepared.ciphertext.fill(0) }
          }
          if (operation === 'confirmTotp') {
            if (binding.kind !== 'ACTIVE' && (binding.kind !== 'PREAUTH' || binding.state !== 'ENROLLMENT_REQUIRED')) throw invalid()
            const authorization = await auth(binding, 'B1-SELF-06')
            if (!authorization.allowed || (binding.kind === 'ACTIVE' && !authorization.step_up)) throw new AuthError(403, 'STEP_UP_REQUIRED')
            if (!Buffer.isBuffer(deps.factors.recoveryKey) || deps.factors.recoveryKey.length < 32 || !binding.tenantId || !binding.userId) throw unavailable()
            const { Secret } = await import('otpauth')
            const codes: string[] = [], digests: Buffer[] = []
            try {
              for (let attempt = 0; attempt < numeric('recovery_count') * 2 && codes.length < numeric('recovery_count'); attempt++) {
                const secret = new Secret({ size: numeric('recovery_entropy') })
                let code: string
                try { code = secret.base32 } finally { secret.bytes.fill(0) }
                if (!/^[A-Z2-7]{26}$/.test(code)) throw unavailable()
                if (codes.includes(code)) continue
                codes.push(code)
                digests.push(createHmac('sha256', deps.factors.recoveryKey).update(canonical(['RECOVERY', binding.tenantId, binding.userId, code])).digest())
              }
              if (codes.length !== numeric('recovery_count')) throw unavailable()
              const result = await factors.totp(String(input.proof), binding, preauth(), String(input.enrollment_id), 'ENROLLMENT', digests)
              if (result instanceof AuthError) return result
              if (binding.kind === 'ACTIVE') return { data: { codes, display_once: true, auth: await activeSummary(binding) } }
              const issued = await issueSession(binding)
              return { ...issued, data: { codes, display_once: true, auth: issued.data } }
            } finally { digests.forEach(value => value.fill(0)) }
          }
          if (operation === 'verifyMfa') {
            if (input.method === 'EMAIL_OTP') {
              if (!mail) throw unavailable()
              return ownedInternal(preauth(), 'verifyMfa', input, async () => {
                if (!await mail.verify(preauth(), binding, String(input.challenge_id), String(input.proof))) return factorDenied(binding)
                return binding.kind === 'ACTIVE' ? { data: await activeSummary(binding) } : issueSession(binding)
              })
            }
            if (input.method !== 'TOTP') throw unavailable()
            if (binding.kind !== 'ACTIVE' && (binding.kind !== 'PREAUTH' || binding.state !== 'PENDING_MFA')) throw invalid()
            return ownedInternal(preauth(), 'verifyMfa', input, async () => {
              const result = await factors.totp(String(input.proof), binding, preauth(), String(input.challenge_id), binding.kind === 'ACTIVE' ? 'STEP_UP' : 'LOGIN')
              if (result instanceof AuthError) return result
              if (binding.kind === 'ACTIVE') return { data: await activeSummary(binding) }
              return issueSession(binding)
            })
          }
          // Unsupported ceremonies remain closed; no fallback custody or EMAIL delivery.
          throw unavailable()
        },
      }
      const result = await work(Object.freeze(tx))
      if ([...reservations.values()].some(r => !r.done)) throw unavailable()
      return result
    })
  }
  return Object.freeze({
    transaction,
    bootstrap(bindingDigest: string, csrfDigest: string, expiresAt: number) {
      if (![bindingDigest, csrfDigest].every(v => /^[a-f0-9]{64}$/.test(v)) || !Number.isSafeInteger(expiresAt) ||
          expiresAt <= now() || expiresAt > now() + numeric('preauth_ttl') * 1000) return Promise.reject(unavailable())
      return repository.transaction(async broker => { await broker.call('bootstrap', [hex(bindingDigest), hex(csrfDigest)]) })
    },
  })
}
