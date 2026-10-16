import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { canonical } from './contracts.ts'
import { numeric, profile } from './config.ts'
import { AuthError, digest, names, token, type Backend, type Binding, type Effect, type Input, type Transaction } from './service.ts'
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
  factors: PrivateFactorKeys
  cursorKey: Buffer
  now?: () => number
  /** Already HMAC-keyed dimensions from trusted ingress, never headers/body or default IP. */
  transport(): Readonly<{ network: Buffer; device: Buffer }>
  /** Same normalization policy as account provisioning, never password normalization. */
  normalizeEmail(email: string): string
}
type Reservation = { operation: string; key: Buffer; hash: string; oneTime: boolean; raw: string | null; done: boolean }
/** Uninstalled private Backend for the approved extension. One broker/connection for all
 * reads, factor proofs, CAS, effects, audit and idempotency. No runtime flag or setter. */
export function createApprovedPrivateBackend(pool: IdentityPool, deps: ApprovedBackendDependencies): Backend {
  if (!Buffer.isBuffer(deps.cursorKey) || deps.cursorKey.length < 32) throw unavailable()
  const repository = createV4IdentityRepository(pool), now = deps.now ?? Date.now
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
      let actor: Binding | undefined, raw = '', csrf = ''
      const reservations = new Map<string, Reservation>()
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
        return data
      }
      async function preauthResult(cookie: string): Promise<{ data: Input; expiresAt: number }> {
        const summary = await broker.call('preauthSummary', [cookie])
        if (!object(summary)) throw unavailable()
        const expiresAt = Date.parse(String(summary.expires_at))
        if (!Number.isSafeInteger(expiresAt) || expiresAt <= now() || expiresAt > now() + numeric('preauth_ttl') * 1000) throw unavailable()
        if (summary.state === 'TENANT_SELECTION_REQUIRED') return { data: { state: summary.state, expires_at: new Date(expiresAt).toISOString() }, expiresAt }
        if (summary.state === 'ENROLLMENT_REQUIRED') return { data: { state: summary.state, allowed_methods: ['TOTP'], expires_at: new Date(expiresAt).toISOString() }, expiresAt }
        // The approved broker still exposes no method discovery/challenge recipient policy.
        // Never guess a factor or emit a PENDING_MFA response without a real challenge.
        throw unavailable()
      }
      async function auth(binding: Binding, rule: string, resource?: string) {
        owns(binding)
        const rows = await broker.call('authorization', [preauth(), rule, resource ?? null])
        if (rows.length !== 1 || typeof rows[0].allowed !== 'boolean' || typeof rows[0].step_up !== 'boolean') throw unavailable()
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
          const preferPreauth = ['verifyMfa', 'confirmTotp', 'switchTenant', 'listAuthorizedTenants', 'enrollTotp', 'resendOtp'].includes(operationHint)
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
          if (!['login', 'verifyMfa', 'resendOtp', 'startStepUp', 'enrollTotp', 'confirmTotp'].includes(operation)) return null
          const transport = deps.transport()
          if (![transport.network, transport.device].every(key => Buffer.isBuffer(key) && key.length === 32)) throw unavailable()
          const purpose = operation === 'login' ? 'LOGIN' : ['verifyMfa', 'confirmTotp'].includes(operation) ? 'OTP_VERIFY' : 'OTP_ISSUE'
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
          const operation = parts[4], oneTime = ['enrollTotp', 'confirmTotp'].includes(operation), key = hex(digest(parts[5])), rawPreauth = preauth()
          const result = await broker.call('reserveOwned', [rawPreauth, operation, key, hex(requestHash), oneTime])
          if (!object(result) || typeof result.replay !== 'boolean' || result.requestHash !== requestHash ||
              result.oneTime !== oneTime || typeof result.expiresAt !== 'number' || result.expiresAt <= now()) throw unavailable()
          if (!result.replay) reservations.set(scope, { operation, key, hash: requestHash, oneTime, raw: rawPreauth, done: false })
          return { replay: result.replay, requestHash, oneTime, expiresAt: result.expiresAt, data: result.data }
        },
        async discard(scope) {
          const r = reservation(scope)
          if (!await broker.call('discardOwned', [r.raw, r.operation, r.key, hex(r.hash)])) throw unavailable()
          r.done = true
        },
        async complete(scope, hash, data, oneTime) {
          const r = reservation(scope)
          if (hash !== r.hash || oneTime !== r.oneTime || (oneTime && data !== null)) throw unavailable()
          if (!await broker.call('completeOwned', [r.raw, r.operation, r.key, hex(hash), oneTime ? null : JSON.stringify(data)])) throw unavailable()
          r.done = true
        },
        async execute(operation, input, binding): Promise<Effect | AuthError> {
          owns(binding); await resolveAgain()
          if (['logout', 'revokeSelfSession', 'revokeOtherOwnSessions', 'switchTenant', 'confirmTotp'].includes(operation) &&
              ![...reservations.values()].some(r => !r.done && r.operation === operation && (operation !== 'confirmTotp' || r.oneTime))) throw unavailable()
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
            await factors.preauth(proof, null, hex(digest(cookie)), hex(digest(newCsrf)))
            const memberships = await broker.call('memberships', [cookie])
            if (memberships.length > numeric('membership_max') || memberships.some(r => !uuid(r.id))) throw unavailable()
            const matching = input.organization_hint === undefined ? [] : memberships.filter(r => r.id === input.organization_hint)
            const chosen = matching.length === 1 ? matching[0] : memberships.length === 1 ? memberships[0] : undefined
            if (chosen) await broker.call('selectTenant', [cookie, String(chosen.id), correlation])
            const result = await preauthResult(cookie)
            return { data: result.data, transition: { kind: 'PREAUTH', token: cookie, csrf: newCsrf, expiresAt: result.expiresAt } }
          }
          if (operation === 'switchTenant') {
            const target = String(input.target_tenant_id)
            if (!uuid(target)) throw invalid()
            if (binding.kind === 'PREAUTH') {
              await broker.call('selectTenant', [raw, target, correlation])
              const result = await preauthResult(raw)
              // V4 selection keeps its proof binding; rotate cookies only via broker-supported switch.
              return { data: result.data, transition: { kind: 'PREAUTH', token: raw, csrf, expiresAt: result.expiresAt } }
            }
            const cookie = token(), newCsrf = token()
            await broker.call('beginSwitch', [cookie, hex(digest(newCsrf)), target, correlation])
            const result = await preauthResult(cookie)
            return { data: result.data, transition: { kind: 'PREAUTH', token: cookie, csrf: newCsrf, expiresAt: result.expiresAt } }
          }
          if (operation === 'confirmTotp') {
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
              if (binding.kind !== 'ACTIVE') throw unavailable()
              return { data: { codes, display_once: true, auth: await activeSummary(binding) } }
            } finally { digests.forEach(value => value.fill(0)) }
          }
          if (operation === 'verifyMfa') {
            // D1 approval does not include D4 verified-recipient/delivery contracts.
            if (input.method === 'EMAIL_OTP') throw unavailable()
            const result = input.method === 'TOTP' ?
              await factors.totp(String(input.proof), binding, preauth(), String(input.challenge_id), binding.kind === 'ACTIVE' ? 'STEP_UP' : 'LOGIN') :
              invalid()
            if (result instanceof AuthError) return result
            if (binding.kind === 'ACTIVE') return { data: await activeSummary(binding) }
            // No trusted risk_class exists in approved broker outputs: never guess session lifetimes.
            throw unavailable()
          }
          // Enrollment allocation/AAD, method discovery and session risk material are
          // genuine missing broker inputs, not interchangeable with callbacks returning ALLOW.
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
