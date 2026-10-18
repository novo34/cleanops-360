import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { parseSelectorJson } from './selector-json.ts'
import { numeric, profile } from './config.ts'
import { canonical, operations, valid, type Operation } from './contracts.ts'

export class AuthError extends Error {
  status: number; code: string; retryAfter?: number
  constructor(status: number, code: string, retryAfter?: number) { super(code); this.status = status; this.code = code; this.retryAfter = retryAfter }
}
export const names = Object.freeze({ session: '__Host-cleanops_session', preauth: '__Host-cleanops_preauth', csrf: '__Host-cleanops_csrf', trusted: '__Host-cleanops_trusted' })
export const digest = (s: string) => createHash('sha256').update(s).digest('hex')
const cookieNames: readonly string[] = Object.values(names)
const tokenPattern = /^[A-Za-z0-9_-]{43}$/
export function token(): string { return randomBytes(numeric('session_token_entropy')).toString('base64url') }
export type Input = Record<string, unknown>
export type Binding = {
  kind: 'BOOTSTRAP' | 'PREAUTH' | 'ACTIVE'; id: string; csrfDigest: string; expiresAt: number
  state?: 'TENANT_SELECTION_REQUIRED' | 'ENROLLMENT_REQUIRED' | 'PENDING_MFA'
  tenantId?: string; userId?: string; sessionId?: string; absoluteExpiresAt?: number
}
export type Transition = { kind: 'PREAUTH' | 'ACTIVE'; token: string; csrf: string; expiresAt: number }
export type Effect = { data: unknown; transition?: Transition; clearSession?: boolean; trustedCookie?: { token: string; expiresAt: number } | null }
export interface Transaction {
  /** Must revalidate expiry, revocation, credential version, membership and tenant under locks. */
  resolve(cookies: Record<string, string>): Promise<Binding | null>
  /** Private, trusted actor; no identity/permission derived from payload or role names. */
  authorize(binding: Binding, rule: string, resource?: string): Promise<boolean>
  stepUp(binding: Binding, rule: string, resource?: string): Promise<boolean>
  rateLimit(operation: string, binding: Binding): Promise<number | null>
  /** Atomic reserve + effect + audit + completion on this same transaction/connection. */
  reserve(scope: string, requestHash: string): Promise<{ replay: boolean; requestHash?: string; data?: unknown; oneTime?: boolean; expiresAt?: number }>
  discard(scope: string): Promise<void>
  complete(scope: string, requestHash: string, data: unknown, oneTime: boolean): Promise<void>
  /** Identity service uses verifyPasswordFactor from ./password.ts for password proofs and
   * verifyTotpFactor from ./totp.ts for authorized TOTP ceremonies. Both are internal factors only.
   * TOTP consume must CAS the method-global counter and recheck context/version/expiry in this transaction.
   * Persist progressive rehash via its compare-and-swap callback under the credential lock in this transaction.
   * A verified password alone never authorizes MFA, tenant selection or session issuance.
   * Invalid factors commit attempts before returning an AuthError result; infrastructure errors roll back.
   * All successes include audit in the same commit. Method may return AuthError to commit a failed attempt. */
  execute(operation: string, input: Input, binding: Binding): Promise<Effect | AuthError>
}
export interface Backend {
  transaction<T>(work: (tx: Transaction) => Promise<T>, context?: { correlationId: string; operation: string }): Promise<T>
  /** Persist digest-only bootstrap binding and CSRF with preauth_ttl, or fail closed. */
  bootstrap(bindingDigest: string, csrfDigest: string, expiresAt: number): Promise<void>
}
export const closedBackend: Backend = {
  async transaction() { throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE') },
  async bootstrap() { throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE') },
}
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
export function cookie(name: string, value: string, seconds: number, httpOnly = true): string {
  if (!cookieNames.includes(name) || (value && !tokenPattern.test(value)) || !Number.isFinite(seconds)) throw new AuthError(503, 'INVALID_COOKIE_TRANSITION')
  return `${name}=${value}; Path=/; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(seconds))}${httpOnly ? '; HttpOnly' : ''}`
}
function cookies(request: Request): Record<string, string> {
  const result: Record<string, string> = Object.create(null)
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (!cookieNames.includes(name)) continue
    const value = rest.join('=')
    if (result[name] || !tokenPattern.test(value)) throw new AuthError(400, 'INVALID_COOKIE')
    result[name] = value
  }
  return result
}
async function body(request: Request): Promise<Uint8Array> {
  const limit = numeric('json_body_max')
  const declared = request.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new AuthError(413, 'BODY_TOO_LARGE')
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > limit) { await reader.cancel(); throw new AuthError(413, 'BODY_TOO_LARGE') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
function stateAllowed(operation: string, binding: Binding) {
  if(operation==='resetPassword')return binding.kind==='BOOTSTRAP'
  if (operation === 'recoverMfa') return binding.kind === 'PREAUTH' && binding.state === 'PENDING_MFA'
  if (operation === 'login') return binding.kind === 'BOOTSTRAP'
  if (operation === 'listAuthorizedTenants') return binding.kind !== 'BOOTSTRAP'
  if (operation === 'switchTenant') return binding.kind === 'ACTIVE' || binding.state === 'TENANT_SELECTION_REQUIRED'
  if (['enrollTotp', 'confirmTotp', 'enrollEmail', 'confirmEmail', 'resendEmailEnrollment'].includes(operation)) return binding.kind === 'ACTIVE' || binding.state === 'ENROLLMENT_REQUIRED'
  if (operation === 'verifyMfa' || operation === 'resendEmail' || operation === 'resendOtp' || operation === 'selectTotpMethod') return binding.kind === 'ACTIVE' || binding.state === 'PENDING_MFA'
  return binding.kind === 'ACTIVE'
}
function ruleFor(operation: Operation, input: Input): string | undefined {
  if (operation.operationId === 'startStepUp') return String(input.grant_id)
  if (operation.operationId === 'selectTotpMethod' && input.grant_id !== undefined) return String(input.grant_id)
  return operation['x-rule']
}
function resourceFor(operation: string, input: Input): string | undefined {
  if (operation === 'switchTenant') return String(input.target_tenant_id)
  if (['startStepUp', 'selectTotpMethod'].includes(operation) && input.resource_id) return String(input.resource_id)
  return undefined
}
export function createAuthHandler(backend: Backend, origin: string, now = () => Date.now()) {
  // This is a trusted deployment value, never Host/X-Forwarded-Host from the request.
  let trusted: URL
  try { trusted = new URL(origin) } catch { throw new Error('AUTH_ORIGIN_REQUIRED') }
  if (trusted.protocol !== 'https:' || trusted.origin !== origin) throw new Error('AUTH_HTTPS_ORIGIN_REQUIRED')
  const response = (data: unknown, status: number, correlation: string, extra: Headers = new Headers()) => {
    extra.set('Cache-Control', 'no-store'); extra.set('Vary', 'Cookie'); extra.set('Content-Type', 'application/json; charset=utf-8')
    return new Response(JSON.stringify(status === 200 ? { data, meta: { correlation_id: correlation } } : data), { status, headers: extra })
  }
  const failure = (error: unknown, correlation: string) => {
    const e = error instanceof AuthError ? error : new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
    const headers = new Headers()
    if (e.status === 429) headers.set('Retry-After', String(Math.max(1, Math.min(900, Math.ceil(e.retryAfter ?? 1)))))
    return response({ error: { code: e.code, message: 'No se pudo completar la solicitud.', details: [] }, correlation_id: correlation }, e.status, correlation, headers)
  }
  return {
    async bootstrap(): Promise<{ headers: Headers } | Response> {
      const correlation = randomUUID()
      try {
        const binding = token(), csrf = token(), expiresAt = now() + numeric('preauth_ttl') * 1000
        await backend.bootstrap(digest(binding), digest(csrf), expiresAt)
        const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Cookie' })
        headers.append('Set-Cookie', cookie(names.preauth, binding, numeric('preauth_ttl')))
        headers.append('Set-Cookie', cookie(names.csrf, csrf, numeric('preauth_ttl'), false))
        return { headers }
      } catch (error) { return failure(error, correlation) }
    },
    async handle(request: Request, operationId: string): Promise<Response> {
      const correlation = randomUUID()
      try {
        const operation = operations.find(o => o.operationId === operationId)
        if (!operation) throw new AuthError(404, 'NOT_FOUND')
        const url = new URL(request.url)
        const route = operation.path === '/me/sessions/{session_id}' ? /^\/me\/sessions\/([^/]+)$/.exec(url.pathname) : null
        if (url.origin !== origin || request.method !== operation.method || (!route && url.pathname !== operation.path)) throw new AuthError(400, 'INVALID_ROUTE')
        if (request.headers.has('content-encoding')) throw new AuthError(415, 'UNSUPPORTED_ENCODING')
        const query = Object.fromEntries(url.searchParams)
        for (const key of url.searchParams.keys()) if (url.searchParams.getAll(key).length !== 1 || !operation.parameters.some(p => p.in === 'query' && p.name === key)) throw new AuthError(400, 'INVALID_QUERY')
        const input: Input = {}
        for (const parameter of operation.parameters) {
          let value: unknown = parameter.in === 'header' ? request.headers.get(parameter.name) : parameter.in === 'query' ? query[parameter.name] : route?.[1]
          if (value === undefined || value === null) { if (parameter.required) throw new AuthError(400, 'MISSING_PARAMETER'); continue }
          if (parameter.schema.type === 'integer') value = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
          if (!valid(parameter.schema, value)) throw new AuthError(400, 'INVALID_PARAMETER')
          if (parameter.in !== 'header') input[parameter.name] = value
        }
        if (operation.parameters.some(p => p.in === 'query' && p.name === 'limit') && input.limit === undefined) input.limit = numeric('page_default')
        const raw = await body(request)
        if (operation.requestBody) {
          if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) throw new AuthError(415, 'JSON_REQUIRED')
          let parsed: unknown
          try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(raw)
            parsed = ['selectTotpMethod', 'confirmEmail', 'resendEmail', 'resendEmailEnrollment','recoverMfa','resetPassword','adminResetMfa','authorizePasswordReset','revokeTrustedDevice','adminRevokeTrustedDevices','changeAccess'].includes(operationId) ? parseSelectorJson(text) : JSON.parse(text)
          } catch { throw new AuthError(400, 'INVALID_JSON') }
          if (!valid(operation.requestBody.content['application/json'].schema, parsed)) throw new AuthError(422, 'INVALID_INPUT')
          Object.assign(input, parsed)
        } else if (raw.length) throw new AuthError(400, 'BODY_NOT_ALLOWED')
        const received = cookies(request)
        if (request.method !== 'GET') {
          const referer = request.headers.get('referer')
          if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') !== 'same-origin' || (referer && new URL(referer).origin !== origin)) throw new AuthError(403, 'CSRF_ORIGIN')
          const csrf = request.headers.get('x-csrf-token') ?? ''
          if (!received[names.csrf] || !safeEqual(csrf, received[names.csrf])) throw new AuthError(403, 'CSRF_INVALID')
        }
        const outcome = await backend.transaction(async tx => {
          const binding = await tx.resolve(received)
          if (!binding || binding.expiresAt <= now() || !stateAllowed(operationId, binding)) throw new AuthError(401, 'AUTH_INVALID')
          if (request.method !== 'GET' && !safeEqual(digest(received[names.csrf]), binding.csrfDigest)) throw new AuthError(403, 'CSRF_INVALID')
          if (operationId === 'selectTotpMethod') {
            if (binding.kind === 'ACTIVE' ? input.grant_id === undefined : input.grant_id !== undefined || input.resource_id !== undefined)
              throw new AuthError(422, 'INVALID_INPUT')
          }
          const rule = ruleFor(operation, input), resource = resourceFor(operationId, input)
          if (rule && !await tx.authorize(binding, rule, resource)) throw new AuthError(403, 'POLICY_DENIED')
          const needsStep = binding.kind === 'ACTIVE' && ['switchTenant','revokeOtherOwnSessions','enrollTotp','confirmTotp','enrollEmail','confirmEmail','resendEmailEnrollment','recoverMfa','resetPassword','adminResetMfa','authorizePasswordReset','registerTrustedDevice','revokeTrustedDevice','revokeAllTrustedDevices','adminRevokeTrustedDevices'].includes(operationId)
          if (needsStep && !await tx.stepUp(binding, rule!, resource)) throw new AuthError(403, 'STEP_UP_REQUIRED')
          const retry = await tx.rateLimit(operationId, binding)
          // Return instead of throw so the transaction commits failed-attempt counters.
          if (retry !== null) return new AuthError(429, 'RATE_LIMITED', retry)
          const key = operation.parameters.some(p => p.in === 'header' && p.name === 'Idempotency-Key') ? request.headers.get('idempotency-key') : null
          const scope = key ? canonical([binding.kind, binding.id, binding.tenantId ?? null, binding.userId ?? null, operationId, key]) : null
          const requestHash = digest(canonical(input))
          if (scope) {
            const reservation = await tx.reserve(scope, requestHash)
            if (reservation.replay) {
              if (reservation.requestHash !== requestHash) throw new AuthError(409, 'IDEMPOTENCY_MISMATCH')
              if ((reservation.expiresAt ?? 0) <= now()) throw new AuthError(409, 'IDEMPOTENCY_EXPIRED')
              if (reservation.oneTime) throw new AuthError(409, 'RESULT_NOT_REPLAYABLE')
              if (operationId === 'selectTotpMethod') {
                const data = reservation.data as Input
                if (!data || (binding.kind === 'PREAUTH' ? data.state !== 'PENDING_MFA' : data.state !== undefined) ||
                    !valid(operation.responses['200'].content['application/json'].schema, { data, meta: { correlation_id: correlation } }))
                  throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
              }
              return { data: reservation.data, ...(['revokeTrustedDevice','revokeAllTrustedDevices'].includes(operationId)?{trustedCookie:null}:{}) } as Effect
            }
          }
          const effect = await tx.execute(operationId, input, binding)
          if (effect instanceof AuthError) {
            if (scope) await tx.discard(scope)
            return effect
          }
          if (!valid(operation.responses['200'].content['application/json'].schema, { data: effect.data, meta: { correlation_id: correlation } })) throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
          if (operationId === 'recoverMfa' && ((effect.data as Input).state !== 'ENROLLMENT_REQUIRED' || effect.transition?.kind !== 'PREAUTH')) throw new AuthError(503, 'MFA_REQUIRED')
          if (operationId === 'login' && (effect.data as Input).state === 'ACTIVE') throw new AuthError(503, 'MFA_REQUIRED')
          const authData = effect.data as Input
          if(['getUserAccess','checkEffectiveAccess','changeAccess','adminResetMfa'].includes(operationId) && (effect.transition || effect.clearSession))throw new AuthError(503,'INVALID_BACKEND_RESPONSE')
          if (operationId.includes('Trusted') && effect.transition) throw new AuthError(503,'INVALID_BACKEND_RESPONSE')
          if (operationId==='registerTrustedDevice') {
            const t=effect.trustedCookie, device=(effect.data as Input).device as Input
            if(!t || !tokenPattern.test(t.token) || !Number.isSafeInteger(t.expiresAt) || t.expiresAt<=now() || t.expiresAt>now()+numeric('trusted_device_max')*1000 || t.expiresAt!==Date.parse(String(device.expires_at))) throw new AuthError(503,'INVALID_COOKIE_TRANSITION')
          } else if(effect.trustedCookie!==undefined && (!['revokeTrustedDevice','revokeAllTrustedDevices'].includes(operationId) || effect.trustedCookie!==null)) throw new AuthError(503,'INVALID_COOKIE_TRANSITION')
          if(operationId==='resetPassword' && (effect.transition || authData.state!=='PASSWORD_RESET' || effect.clearSession!==true))throw new AuthError(503,'INVALID_BACKEND_RESPONSE')
          if (operationId === 'selectTotpMethod' &&
              (effect.transition || (binding.kind === 'PREAUTH' ? authData.state !== 'PENDING_MFA' : authData.state !== undefined)))
            throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
          const authState = authData.state ?? (authData.auth as Input | undefined)?.state
          if (binding.kind === 'ACTIVE' && ['verifyMfa','confirmTotp'].includes(operationId)) {
            const auth = operationId === 'confirmTotp' ? authData.auth as Input : authData
            if (effect.transition || auth.session_id !== binding.sessionId || auth.tenant_id !== binding.tenantId || Date.parse(String(auth.absolute_expires_at)) > (binding.absoluteExpiresAt ?? binding.expiresAt)) throw new AuthError(503, 'INVALID_STEP_UP_TRANSITION')
          }
          if (operationId === 'getCurrentIdentity' && (authData.id !== binding.userId || authData.tenant_id !== binding.tenantId)) throw new AuthError(503, 'INVALID_SUBJECT_RESPONSE')
          if (operationId === 'listSelfSessions' && (authData.items as Input[]).some(s => s.user_id !== binding.userId || s.tenant_id !== binding.tenantId)) throw new AuthError(503, 'INVALID_SUBJECT_RESPONSE')
          if (operationId === 'switchTenant' && authState === 'ACTIVE' && (authData.tenant_id !== input.target_tenant_id || authData.session_id === binding.sessionId)) throw new AuthError(503, 'INVALID_SWITCH_TRANSITION')
          if (['logout','revokeSelfSession'].includes(operationId) && Number(authData.revoked_count) > 1) throw new AuthError(503, 'INVALID_REVOCATION_RESULT')
          const mustRotate = operationId === 'login' || operationId === 'switchTenant' || (binding.kind === 'PREAUTH' && ['verifyMfa','confirmTotp'].includes(operationId))
          if (mustRotate && !effect.transition) throw new AuthError(503, 'MISSING_COOKIE_TRANSITION')
          if (operationId === 'logout' || (operationId === 'revokeSelfSession' && input.session_id === binding.sessionId)) effect.clearSession = true
          if (effect.transition) {
            const { kind, token: value, csrf, expiresAt } = effect.transition
            if (!tokenPattern.test(value) || !tokenPattern.test(csrf) || expiresAt <= now()) throw new AuthError(503, 'INVALID_COOKIE_TRANSITION')
            if ((kind === 'ACTIVE') !== (authState === 'ACTIVE')) throw new AuthError(503, 'INVALID_COOKIE_TRANSITION')
            const absolute = authData.absolute_expires_at ?? (authData.auth as Input | undefined)?.absolute_expires_at
            if (kind === 'ACTIVE' && (typeof absolute !== 'string' || expiresAt > Date.parse(absolute))) throw new AuthError(503, 'INVALID_COOKIE_TRANSITION')
            if (kind === 'PREAUTH' && expiresAt > now() + numeric('preauth_ttl') * 1000) throw new AuthError(503, 'INVALID_COOKIE_TRANSITION')
          }
          if (scope) await tx.complete(scope, requestHash, ['enrollTotp','confirmTotp','enrollEmail','confirmEmail','resendEmailEnrollment','recoverMfa','resetPassword','registerTrustedDevice','adminResetMfa','changeAccess'].includes(operationId) ? null : effect.data, ['enrollTotp','confirmTotp','enrollEmail','confirmEmail','resendEmailEnrollment','recoverMfa','resetPassword','registerTrustedDevice','adminResetMfa','changeAccess'].includes(operationId))
          return effect
        }, { correlationId: correlation, operation: operationId })
        if (outcome instanceof AuthError) throw outcome
        if (!valid(operation.responses['200'].content['application/json'].schema, { data: outcome.data, meta: { correlation_id: correlation } })) throw new AuthError(503, 'INVALID_BACKEND_RESPONSE')
        const headers = new Headers()
        // Cookies are emitted only after the transaction promise confirms commit.
        if(outcome.trustedCookie===null)headers.append('Set-Cookie',cookie(names.trusted,'',0))
        else if(outcome.trustedCookie)headers.append('Set-Cookie',cookie(names.trusted,outcome.trustedCookie.token,(outcome.trustedCookie.expiresAt-now())/1000))
        if (outcome.transition) {
          const t = outcome.transition, age = (t.expiresAt - now()) / 1000
          headers.append('Set-Cookie', cookie(t.kind === 'ACTIVE' ? names.session : names.preauth, t.token, age))
          headers.append('Set-Cookie', cookie(names.csrf, t.csrf, age, false))
          if (t.kind === 'ACTIVE') headers.append('Set-Cookie', cookie(names.preauth, '', 0))
        }
        if(operationId==='resetPassword' && outcome.clearSession)headers.append('Set-Cookie',cookie(names.preauth,'',0))
        if (outcome.clearSession) { headers.append('Set-Cookie', cookie(names.session, '', 0)); headers.append('Set-Cookie', cookie(names.csrf, '', 0, false)) }
        return response(outcome.data, 200, correlation, headers)
      } catch (error) { return failure(error, correlation) }
    },
    profile,
  }
}
