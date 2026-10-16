'use client'

import { useEffect, useRef, useState } from 'react'
import { contract, operations, valid } from '@/lib/b1/contracts'
import { emptyView, receiveAuth, type AuthState } from '@/lib/b1/ui-state'

type Selection = { state: 'TOTP_SELECTION_REQUIRED'; methods: { method_id: string; kind: 'TOTP' }[]; expires_at: string }
type StepContext = { grant_id: string; resource_id?: string }
type Tenant = { id: string; name: string }
type Session = { id: string; device_label: string; browser_label: string; is_current: boolean }
export function AuthPanel() {
  const [view, setView] = useState(emptyView)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selected, setSelected] = useState('')
  const stepContext = useRef<StepContext | null>(null)
  const inFlight = useRef(false)
  const generation = useRef(0)
  const selectionKeys = useRef(new Map<string, string>())
  function clearCeremony() {
    generation.current++
    selectionKeys.current.clear()
    stepContext.current = null
    setSelection(null); setSelected(''); setChallenge(null); setPendingAction(null)
  }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [challenge, setChallenge] = useState<{ challenge_id: string; allowed_methods: string[]; expires_at: string } | null>(null)
  const [enrollment, setEnrollment] = useState<{ enrollment_id: string; provisioning_uri: string } | null>(null)
  const [pendingAction, setPendingAction] = useState<{ operation: string; body?: object } | null>(null)
  useEffect(() => {
    const expires = selection?.expires_at ?? challenge?.expires_at
    if (!expires) return
    const timer = setTimeout(() => {
      clearCeremony(); setView(emptyView); setMessage('La verificación ha caducado. Vuelve a iniciar el acceso.')
    }, Math.max(0, Date.parse(expires) - Date.now()))
    return () => clearTimeout(timer)
  }, [selection, challenge])
  async function call(operation: string, body?: object, sessionId?: string, idempotencyKey?: string) {
    if (inFlight.current) return null
    inFlight.current = true
    const requestGeneration = generation.current
    setBusy(true); setMessage('')
    try {
      const op = operations.find(o => o.operationId === operation)!
      if (op.requestBody && !valid(op.requestBody.content['application/json'].schema, body)) throw new Error('Revisa los campos de la solicitud.')
      const path = op.path.replace('{session_id}', sessionId ?? '')
      const csrf = document.cookie.split('; ').find(c => c.startsWith('__Host-cleanops_csrf='))?.split('=')[1]
      if (op.method !== 'GET' && !csrf) throw new Error('Autenticación no disponible. Vuelve a cargar esta página para reintentar.')
      const response = await fetch(path, { method: op.method, credentials: 'same-origin', cache: 'no-store',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          ...(op.parameters.some(p => p.name === 'Idempotency-Key') ? { 'Idempotency-Key': idempotencyKey ?? crypto.randomUUID() } : {}) },
        body: body ? JSON.stringify(body) : undefined })
      const result = await response.json()
      if (requestGeneration !== generation.current) return null
      if (!response.ok) {
        if (!valid(contract.components.schemas.Error, result)) throw new Error('Respuesta no válida; vuelve a iniciar el acceso.')
        if ([401, 403, 409, 410].includes(response.status)) { clearCeremony(); setView(emptyView); setEnrollment(null) }
        throw new Error(response.status === 429 ? `Demasiados intentos. Reintenta en ${response.headers.get('Retry-After') ?? 'unos'} segundos.` : 'No se pudo completar la verificación. Vuelve a iniciar el acceso.')
      }
      if (!valid(op.responses['200'].content['application/json'].schema, result)) throw new Error('Respuesta no válida; no se ha confirmado el cambio.')
      return result.data
    } catch { setMessage('No se pudo confirmar la solicitud. Reintenta o vuelve a iniciar el acceso.'); return null }
    finally { inFlight.current = false; setBusy(false) }
  }
  function prepare(result: Selection | { challenge_id: string; allowed_methods: string[]; expires_at: string }, context: StepContext | null) {
    stepContext.current = context
    setSelected(''); selectionKeys.current.clear()
    if ('state' in result && result.state === 'TOTP_SELECTION_REQUIRED') {
      setChallenge(null); setSelection(result)
    } else { setSelection(null); setChallenge(result as { challenge_id: string; allowed_methods: string[]; expires_at: string }) }
  }
  async function selectMethod() {
    if (!selection || !selection.methods.some(m => m.method_id === selected) || Date.parse(selection.expires_at) <= Date.now()) return
    const body = { totp_method_id: selected, ...stepContext.current }
    let key = selectionKeys.current.get(selected)
    if (!key) { key = crypto.randomUUID(); selectionKeys.current.set(selected, key) }
    const result = await call('selectTotpMethod', body, undefined, key)
    if (!result) return
    if (Date.parse(result.expires_at) <= Date.now() || (stepContext.current ? result.state !== undefined : result.state !== 'PENDING_MFA')) {
      clearCeremony(); setView(emptyView); setMessage('Respuesta no válida. Vuelve a iniciar el acceso.'); return
    }
    setSelection(null); setSelected(''); selectionKeys.current.clear()
    if (stepContext.current) setChallenge(result)
    else accept(result)
  }
  function accept(auth: AuthState | Selection) {
    if (auth.state === 'TOTP_SELECTION_REQUIRED') { setView(emptyView); prepare(auth, null); return }
    setSelection(null); setSelected(''); selectionKeys.current.clear()
    setView(previous => receiveAuth(previous, auth)); setEnrollment(null); setChallenge(null)
    if (auth.state === 'PENDING_MFA') setChallenge(auth)
  }
  async function login(form: HTMLFormElement) {
    const data = new FormData(form)
    const password = String(data.get('password')); form.reset()
    const auth = await call('login', { email: String(data.get('email')), password })
    if (auth) accept(auth)
  }
  async function verify(form: HTMLFormElement) {
    if (!challenge) return
    const data = new FormData(form); form.reset()
    const auth = await call('verifyMfa', { challenge_id: challenge.challenge_id, method: String(data.get('method')), proof: String(data.get('proof')) })
    if (auth) {
      accept(auth)
      if (pendingAction) {
        const action = pendingAction; setPendingAction(null)
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
    const body = { target_tenant_id: id, reason: 'Selección explícita de empresa' }
    // Drop company records before any pending switch, including failed or cancelled ceremonies.
    setView(v => ({ ...v, sessions: [], tenants: [], codes: [] })); setEnrollment(null)
    if (view.auth?.state === 'ACTIVE') {
      const result = await call('startStepUp', { grant_id: 'B1-SELF-08', resource_id: id })
      if (result) { setPendingAction({ operation: 'switchTenant', body }); prepare(result, { grant_id: 'B1-SELF-08', resource_id: id }) }
    } else { const auth = await call('switchTenant', body); if (auth) accept(auth) }
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
      {view.auth && <p>{view.auth.state === 'ACTIVE' ? 'Acceso confirmado. Elige una acción.' : 'Completa la verificación para acceder.'}</p>}
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
      {(selection || challenge) && <button type="button" onClick={() => { clearCeremony(); setView(emptyView); setEnrollment(null); setMessage('Verificación cancelada. Vuelve a iniciar el acceso.') }}>Cancelar verificación</button>}
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
        <button onClick={async () => { const r = await call('listSelfSessions'); if (r) setView(v => ({ ...v, sessions: r.items })) }}>Mis sesiones</button>
        <ul>{(view.sessions as Session[]).map(s => <li key={s.id}>{s.device_label} · {s.browser_label} {s.is_current ? '(actual)' : ''}<button onClick={async () => { const r = await call('revokeSelfSession', undefined, s.id); if (r) { if (s.is_current) setView(emptyView); else setView(v => ({ ...v, sessions: [] })) } }}>Revocar</button></li>)}</ul>
        <button onClick={async () => { const r = await call('startStepUp', { grant_id: 'B1-SELF-04' }); if (r) { setPendingAction({ operation: 'revokeOtherOwnSessions', body: { reason: 'Revocación de mis demás sesiones' } }); prepare(r, { grant_id: 'B1-SELF-04' }); setView(v => ({ ...v, sessions: [], codes: [] })) } }}>Revocar mis demás sesiones</button>
        <button onClick={async () => { const r = await call('logout'); if (r) { setView(emptyView); setPendingAction(null) } }}>Cerrar sesión</button>
      </section>}
    </fieldset>
  </main>
}
