'use client'

import { useEffect, useRef, useState } from 'react'
import { contract, operations, valid } from '@/lib/b1/contracts'
import { UiRequestKeys } from '@/lib/b1/ui-request-keys'
import { emptyView, receiveAuth, type AuthState } from '@/lib/b1/ui-state'

type Selection = { state: 'TOTP_SELECTION_REQUIRED'; methods: { method_id: string; kind: 'TOTP' }[]; expires_at: string }
type StepContext = { grant_id: string; resource_id?: string }
function expired(expiresAt: string) { return Date.parse(expiresAt) <= Date.now() }
type Tenant = { id: string; name: string }
type Session = { id: string; device_label: string; browser_label: string; is_current: boolean; created_at: string; last_activity_at: string; absolute_expires_at: string }
export function AuthPanel() {
  const [view, setView] = useState(emptyView)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selected, setSelected] = useState('')
  const [sessionsCursor, setSessionsCursor] = useState<string | null>(null)
  const stepContext = useRef<StepContext | null>(null)
  const activeRequest = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const requestKeys = useRef(new UiRequestKeys())
  const selectionKeys = useRef(new Map<string, string>())
  function clearCeremony() {
    generation.current++
    activeRequest.current?.abort(); activeRequest.current = null; setBusy(false)
    selectionKeys.current.clear(); requestKeys.current.clear()
    stepContext.current = null
    setSelection(null); setSelected(''); setChallenge(null); setPendingAction(null); setSessionsCursor(null)
  }
  function endCeremony(notice: string, invalidateSession = false) {
    clearCeremony(); setEnrollment(null)
    setView(previous => !invalidateSession && previous.auth?.state === 'ACTIVE' && !expired(previous.auth.absolute_expires_at)
      ? { ...emptyView, auth: previous.auth } : emptyView)
    setMessage(notice)
  }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [challenge, setChallenge] = useState<{ challenge_id: string; allowed_methods: string[]; expires_at: string } | null>(null)
  const [enrollment, setEnrollment] = useState<{ enrollment_id: string; provisioning_uri: string } | null>(null)
  const [pendingAction, setPendingAction] = useState<{ operation: string; body?: object } | null>(null)
  useEffect(() => {
    const authExpiry = view.auth && ('absolute_expires_at' in view.auth ? view.auth.absolute_expires_at : view.auth.expires_at)
    const deadlines = [selection?.expires_at, challenge?.expires_at, authExpiry].filter((value): value is string => !!value)
    if (!deadlines.length) return
    const remaining = Math.min(...deadlines.map(value => Date.parse(value))) - Date.now()
    const timer = setTimeout(() => {
      endCeremony('La verificación ha caducado. Inicia una nueva verificación.')
    }, Math.min(2_147_483_647, Math.max(0, remaining)))
    return () => clearTimeout(timer)
  }, [selection, challenge, view.auth])
  function requestKey(scope: string) {
    let key = selectionKeys.current.get(scope)
    if (!key) { key = crypto.randomUUID(); selectionKeys.current.set(scope, key) }
    return key
  }
  async function call(operation: string, body?: object, sessionId?: string, idempotencyKey?: string, query?: Record<string, string>) {
    if (activeRequest.current) return null
    const controller = new AbortController()
    activeRequest.current = controller
    const requestGeneration = generation.current
    setBusy(true); setMessage('')
    try {
      const op = operations.find(o => o.operationId === operation)!
      if (op.requestBody && !valid(op.requestBody.content['application/json'].schema, body)) throw new Error('INVALID_REQUEST')
      if (query && Object.entries(query).some(([name, value]) => {
        const parameter = op.parameters.find(p => p.in === 'query' && p.name === name)
        return !parameter || !valid(parameter.schema, value)
      })) throw new Error('INVALID_QUERY')
      const path = op.path.replace('{session_id}', sessionId ?? '') + (query ? '?' + new URLSearchParams(query).toString() : '')
      const csrf = document.cookie.split('; ').find(c => c.startsWith('__Host-cleanops_csrf='))?.split('=')[1]
      if (op.method !== 'GET' && !csrf) throw new Error('CSRF_REQUIRED')
      const retry = op.parameters.some(p => p.name === 'Idempotency-Key') && !idempotencyKey && operation !== 'startStepUp'
        ? await requestKeys.current.forRequest(operation, path, body) : null
      if (requestGeneration !== generation.current) return null
      const response = await fetch(path, { method: op.method, credentials: 'same-origin', cache: 'no-store',
        redirect: 'error', signal: controller.signal,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          ...(op.parameters.some(p => p.name === 'Idempotency-Key') ? { 'Idempotency-Key': idempotencyKey ?? (operation === 'startStepUp' ? requestKey('step-up:' + JSON.stringify(body)) : retry!.key) } : {}) },
        body: body ? JSON.stringify(body) : undefined })
      if (requestGeneration !== generation.current) return null
      // Authentication loss is authoritative even if the error body is malformed.
      if (response.status === 401) { endCeremony('La sesión ha caducado. Vuelve a iniciar el acceso.', true); return null }
      // Ceremony/authorization failure is not evidence that the ACTIVE session was revoked.
      if ([403, 409, 410].includes(response.status)) { endCeremony('No se pudo completar la verificación. Inicia una nueva verificación.'); return null }
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) throw new Error('INVALID_CONTENT_TYPE')
      const result = await response.json()
      if (requestGeneration !== generation.current) return null
      if (response.status !== 200) {
        if (!valid(contract.components.schemas.Error, result)) throw new Error('INVALID_ERROR')
        setMessage(response.status === 429 ? 'Demasiados intentos. Espera antes de reintentar.' : 'No se pudo confirmar la solicitud. Reintenta o vuelve a iniciar el acceso.')
        return null
      }
      if (!valid(op.responses['200'].content['application/json'].schema, result)) throw new Error('INVALID_RESPONSE')
      retry?.confirmed()
      return result.data
    } catch {
      if (requestGeneration === generation.current) setMessage('No se pudo confirmar la solicitud. Reintenta o vuelve a iniciar el acceso.')
      return null
    } finally {
      if (activeRequest.current === controller) { activeRequest.current = null; setBusy(false) }
    }
  }
  function prepare(result: Selection | { challenge_id: string; allowed_methods: string[]; expires_at: string }, context: StepContext | null) {
    if (expired(result.expires_at)) { endCeremony('La verificación ha caducado. Inicia una nueva verificación.'); return }
    stepContext.current = context
    setSelected(''); selectionKeys.current.clear()
    if ('state' in result && result.state === 'TOTP_SELECTION_REQUIRED') {
      setChallenge(null); setSelection(result)
    } else { setSelection(null); setChallenge(result as { challenge_id: string; allowed_methods: string[]; expires_at: string }) }
  }
  async function selectMethod() {
    if (!selection || !selection.methods.some(m => m.method_id === selected)) return
    if (expired(selection.expires_at)) { endCeremony('La verificación ha caducado. Inicia una nueva verificación.'); return }
    const body = { totp_method_id: selected, ...stepContext.current }
    const key = requestKey(selected)
    const result = await call('selectTotpMethod', body, undefined, key)
    if (!result) return
    if (expired(result.expires_at) || result.allowed_methods.length !== 1 || result.allowed_methods[0] !== 'TOTP' || (stepContext.current ? result.state !== undefined : result.state !== 'PENDING_MFA')) {
      endCeremony('Respuesta no válida. Inicia una nueva verificación.'); return
    }
    setSelection(null); setSelected(''); selectionKeys.current.clear()
    if (stepContext.current) setChallenge(result)
    else accept(result)
  }
  function accept(auth: AuthState | Selection) {
    if (expired('absolute_expires_at' in auth ? auth.absolute_expires_at : auth.expires_at)) {
      endCeremony('La verificación ha caducado. Vuelve a iniciar el acceso.'); return
    }
    if (auth.state === 'TOTP_SELECTION_REQUIRED') { setView(emptyView); prepare(auth, null); return }
    setSelection(null); setSelected(''); selectionKeys.current.clear()
    setView(previous => receiveAuth(previous, auth)); setEnrollment(null); setChallenge(null)
    if (auth.state === 'PENDING_MFA') setChallenge(auth)
  }
  async function login(form: HTMLFormElement) {
    const data = new FormData(form)
    const password = String(data.get('password')); form.reset()
    const auth = await call('login', { email: String(data.get('email')), password })
    // The V4 service explicitly forbids issuing ACTIVE from password login.
    if (auth?.state === 'ACTIVE') { endCeremony('Respuesta no válida. Vuelve a iniciar el acceso.', true); return }
    if (auth) accept(auth)
  }
  async function verify(form: HTMLFormElement) {
    if (!challenge) return
    if (expired(challenge.expires_at)) { endCeremony('La verificación ha caducado. Inicia una nueva verificación.'); return }
    const data = new FormData(form); form.reset()
    const auth = await call('verifyMfa', { challenge_id: challenge.challenge_id, method: String(data.get('method')), proof: String(data.get('proof')) })
    if (auth) {
      if (stepContext.current && (auth.state !== 'ACTIVE' || view.auth?.state !== 'ACTIVE'
        || auth.session_id !== view.auth.session_id || auth.tenant_id !== view.auth.tenant_id || expired(auth.absolute_expires_at)
        || Date.parse(auth.absolute_expires_at) > Date.parse(view.auth.absolute_expires_at))) {
        endCeremony('Respuesta no válida. Inicia una nueva verificación.'); return
      }
      const action = pendingAction
      clearCeremony()
      accept(auth)
      if (action && auth.state === 'ACTIVE' && !expired(auth.absolute_expires_at)) {
        const result = await call(action.operation, action.body)
        if (result?.state && result.state !== 'REVOKED') accept(result)
        else if (result) { setView(v => ({ ...v, sessions: [] })); setMessage('Cambio confirmado.') }
      }
    }
  }
  async function tenants() {
    const result = await call('listAuthorizedTenants')
    if (result) setView(v => ({ ...v, tenants: result.items }))
  }
  async function choose(id: string) {
    setSessionsCursor(null)
    const body = { target_tenant_id: id, reason: 'Selección explícita de empresa' }
    // Drop company records before any pending switch, including failed or cancelled ceremonies.
    setView(v => ({ ...v, sessions: [], tenants: [], codes: [] })); setEnrollment(null)
    if (view.auth?.state === 'ACTIVE') {
      const result = await call('startStepUp', { grant_id: 'B1-SELF-08', resource_id: id })
      if (result) { setPendingAction({ operation: 'switchTenant', body }); prepare(result, { grant_id: 'B1-SELF-08', resource_id: id }) }
    } else { const auth = await call('switchTenant', body); if (auth) accept(auth) }
  }
  async function sessions(cursor?: string) {
    const result = await call('listSelfSessions', undefined, undefined, undefined, cursor ? { cursor } : undefined)
    if (!result) return
    setView(previous => ({ ...previous, sessions: cursor
      ? [...previous.sessions, ...result.items.filter((item: Session) => !(previous.sessions as Session[]).some(existing => existing.id === item.id))]
      : result.items }))
    setSessionsCursor(result.next_cursor)
  }
  async function enroll() {
    const result = await call('enrollTotp')
    if (result) setEnrollment(result)
  }
  return <main className="auth-panel" style={{ maxWidth: 640, margin: '3rem auto', padding: 24 }}>
    <h1>CleanOps 360 · Acceso</h1>
    <p role="status" aria-live="polite">{busy ? 'Procesando…' : message}</p>
    <fieldset disabled={busy} aria-busy={busy} style={{ border: 0, padding: 0 }}>
      {!view.auth && !challenge && !selection && <form onSubmit={event => { event.preventDefault(); void login(event.currentTarget) }}>
        <p><label>Email <input name="email" type="email" autoComplete="username" required maxLength={254} /></label></p>
        <p><label>Contraseña <input name="password" type="password" autoComplete="current-password" required /></label></p>
        <button type="submit">Continuar</button>
      </form>}
      {view.auth && <p>{view.auth.state === 'ACTIVE' && !selection && !challenge ? 'Acceso confirmado. Elige una acción.' : 'Completa la verificación para acceder.'}</p>}
      {selection && <form onSubmit={event => { event.preventDefault(); void selectMethod() }}>
        <fieldset>
          <legend>Selecciona tu autenticador</legend>
          <p>Elige la aplicación configurada con la que introducirás el código.</p>
          {selection.methods.map((method, index) => <p key={method.method_id}><label>
            <input type="radio" name="totp-method" checked={selected === method.method_id} onChange={() => setSelected(method.method_id)} required />
            Aplicación de autenticación {index + 1}
          </label></p>)}
        </fieldset>
        <button type="submit" disabled={!selected}>Continuar con este método</button>
      </form>}
      {challenge && <form onSubmit={event => { event.preventDefault(); void verify(event.currentTarget) }}>
        <label>Método <select name="method">{challenge.allowed_methods.map(m => <option key={m}>{m}</option>)}</select></label>
        <p><label>Código <input name="proof" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label></p>
        <button type="submit">Verificar</button>
        {challenge.allowed_methods.includes('EMAIL_OTP') && <button type="button" onClick={async () => { const r = await call('resendOtp', { challenge_id: challenge.challenge_id }); if (r) setChallenge({ challenge_id: r.challenge_id, allowed_methods: [r.method], expires_at: r.expires_at }) }}>Reenviar código</button>}
      </form>}
      {view.auth?.state === 'ENROLLMENT_REQUIRED' && !enrollment && <button onClick={() => void enroll()}>Configurar autenticador</button>}
      {enrollment && <section><h2>Configura tu autenticador</h2><p>Introduce esta URI en tu aplicación. Se muestra una sola vez.</p>
        <output style={{ overflowWrap: 'anywhere' }}>{enrollment.provisioning_uri}</output>
        <form onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); form.reset(); const r = await call('confirmTotp', { enrollment_id: enrollment.enrollment_id, proof: String(data.get('proof')) }); if (r) { accept(r.auth); setView(v => ({ ...v, codes: r.codes })) } }}>
          <label>Primer código <input name="proof" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label><button>Confirmar</button>
        </form></section>}
      {view.codes.length > 0 && <section><h2>Códigos de recuperación</h2><p>Guárdalos de forma segura. No volverán a mostrarse.</p><ul>{view.codes.map(c => <li key={c}><code>{c}</code></li>)}</ul><button onClick={() => setView(v => ({ ...v, codes: [] }))}>Ya los he guardado</button></section>}
      {view.auth && !challenge && !selection && !enrollment && <section>
        <button onClick={() => void tenants()}>Seleccionar empresa</button>
        <ul>{(view.tenants as Tenant[]).map(t => <li key={t.id}><button onClick={() => void choose(t.id)}>{t.name}</button></li>)}</ul>
      </section>}
      {view.auth?.state === 'ACTIVE' && !challenge && !selection && !enrollment && <section>
        <h2>Seguridad de la cuenta</h2>
        <button onClick={async () => { const r = await call('getCurrentIdentity'); if (r) setMessage(`Sesión de ${r.display_name}`) }}>Mi identidad</button>
        <button onClick={() => void sessions()}>Mis sesiones</button>
        <ul>{(view.sessions as Session[]).map(s => <li key={s.id}><span>{s.device_label} · {s.browser_label} {s.is_current ? '(actual)' : ''}</span><dl>
          <dt>Creada</dt><dd><time dateTime={s.created_at}>{new Date(s.created_at).toLocaleString('es-CH')}</time></dd>
          <dt>Última actividad</dt><dd><time dateTime={s.last_activity_at}>{new Date(s.last_activity_at).toLocaleString('es-CH')}</time></dd>
          <dt>Caducidad absoluta</dt><dd><time dateTime={s.absolute_expires_at}>{new Date(s.absolute_expires_at).toLocaleString('es-CH')}</time></dd>
        </dl><button onClick={async () => { const r = await call('revokeSelfSession', undefined, s.id); if (r) { if (s.is_current) { clearCeremony(); setEnrollment(null); setView(emptyView) } else { setView(v => ({ ...v, sessions: [] })); setSessionsCursor(null) } } }}>Revocar</button></li>)}</ul>
        {sessionsCursor && <button onClick={() => void sessions(sessionsCursor)}>Cargar más sesiones</button>}
        <button onClick={async () => { const r = await call('startStepUp', { grant_id: 'B1-SELF-04' }); if (r) { setPendingAction({ operation: 'revokeOtherOwnSessions', body: { reason: 'Revocación de mis demás sesiones' } }); prepare(r, { grant_id: 'B1-SELF-04' }); setView(v => ({ ...v, sessions: [], codes: [] })); setSessionsCursor(null) } }}>Revocar mis demás sesiones</button>
        <button onClick={async () => { const r = await call('logout'); if (r) { clearCeremony(); setEnrollment(null); setView(emptyView) } }}>Cerrar sesión</button>
      </section>}
    </fieldset>
    {(selection || challenge) && <button type="button" onClick={() => endCeremony('Verificación cancelada. Inicia una nueva verificación.')}>Cancelar verificación</button>}
  </main>
}
