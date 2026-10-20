'use client'

import { useEffect, useRef, useState } from 'react'
import {ManageAccessPanel,type AccessDetail} from './manage-access-panel'
import { UsersDirectory } from './users-directory'
import { TotpEnrollmentQr } from './totp-enrollment-qr'
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
  const [accessOpen,setAccessOpen]=useState(false)
  const [accessView,setAccessView]=useState<{target:string;detail:AccessDetail}|null>(null)
  const [trustedDevices,setTrustedDevices]=useState<{id:string;created_at:string;expires_at:string}[]>([])
  const [trustedCursor,setTrustedCursor]=useState<string|null>(null)
  const [trustedStatus,setTrustedStatus]=useState<boolean|null>(null)
  const [sessionsCursor, setSessionsCursor] = useState<string | null>(null)
  const lastFailure=useRef<string|null>(null)
  const stepContext = useRef<StepContext | null>(null)
  const activeRequest = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const requestKeys = useRef(new UiRequestKeys())
  const selectionKeys = useRef(new Map<string, string>())
  function clearCeremony() {
    setAccessOpen(false);setAccessView(null)
    setTrustedDevices([]);setTrustedCursor(null);setTrustedStatus(null)
    generation.current++
    activeRequest.current?.abort(); activeRequest.current = null; setBusy(false)
    selectionKeys.current.clear(); requestKeys.current.clear()
    stepContext.current = null
    setSelection(null); setSelected(''); setChallenge(null); setPendingAction(null); setSessionsCursor(null); setEnrollmentAuthorized(false); setEmailEnrollment(false); setEmailPending(null); setRecovering(false); setResetting(false)
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
  const [enrollment, setEnrollment] = useState<{ enrollment_id: string; provisioning_uri: string; expires_at: string } | null>(null)
  const [resetting,setResetting]=useState(false)
  const [resetDone,setResetDone]=useState(false)
  const [recovering, setRecovering] = useState(false)
  const [emailPending, setEmailPending] = useState<{ challenge_id: string; allowed_methods: string[]; expires_at: string } | null>(null)
  const [emailEnrollment, setEmailEnrollment] = useState(false)
  const [enrollmentAuthorized, setEnrollmentAuthorized] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ operation: string; body?: object; accessTarget?:string } | null>(null)
  useEffect(() => {
    const authExpiry = view.auth && ('absolute_expires_at' in view.auth ? view.auth.absolute_expires_at : view.auth.expires_at)
    const deadlines = [selection?.expires_at, challenge?.expires_at, enrollment?.expires_at, emailPending?.expires_at, authExpiry].filter((value): value is string => !!value)
    if (!deadlines.length) return
    const remaining = Math.min(...deadlines.map(value => Date.parse(value))) - Date.now()
    const timer = setTimeout(() => {
      endCeremony('La verificación ha caducado. Inicia una nueva verificación.')
    }, Math.min(2_147_483_647, Math.max(0, remaining)))
    return () => clearTimeout(timer)
  }, [selection, challenge, enrollment, emailPending, view.auth])
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
    lastFailure.current=null
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
      if ([403, 409, 410].includes(response.status)) {
        if(response.status===403){try{const error=await response.json();if(valid(contract.components.schemas.Error,error)&&error.error.code==='STEP_UP_REQUIRED')lastFailure.current='STEP_UP_REQUIRED'}catch{ /* Safe generic failure; never infer authorization. */ }}
        endCeremony('No se pudo completar la verificación. Inicia una nueva verificación.'); return null }
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
    const auth = emailEnrollment && !stepContext.current
      ? await call('confirmEmail', { challenge_id: challenge.challenge_id, proof: String(data.get('proof')) })
      : await call('verifyMfa', { challenge_id: challenge.challenge_id, method: String(data.get('method')), proof: String(data.get('proof')) })
    if (auth) {
      if (stepContext.current && (auth.state !== 'ACTIVE' || view.auth?.state !== 'ACTIVE'
        || auth.session_id !== view.auth.session_id || auth.tenant_id !== view.auth.tenant_id || expired(auth.absolute_expires_at)
        || Date.parse(auth.absolute_expires_at) > Date.parse(view.auth.absolute_expires_at))) {
        endCeremony('Respuesta no válida. Inicia una nueva verificación.'); return
      }
      const action = pendingAction
      const retainedEmail = stepContext.current?.grant_id === 'B1-SELF-06' ? emailPending : null
      const retainedEnrollment = stepContext.current?.grant_id === 'B1-SELF-06' ? enrollment : null
      clearCeremony()
      accept(auth)
      if (retainedEmail && auth.state === 'ACTIVE') { setEmailPending(null); setEmailEnrollment(true); setChallenge(retainedEmail) }
      if (retainedEnrollment && auth.state === 'ACTIVE') { setEnrollment(retainedEnrollment); setEnrollmentAuthorized(true) }
      if (action && auth.state === 'ACTIVE' && !expired(auth.absolute_expires_at)) {
        const result = await call(action.operation, action.body)
        if (result && action.operation === 'enrollTotp') { setEnrollment(result); setEnrollmentAuthorized(false); setEmailEnrollment(false) }
        else if (result && action.operation === 'enrollEmail') { setEmailPending(result); setEmailEnrollment(false) }
        else if(result && action.operation==='changeAccess' && action.accessTarget){await loadUserAccess(action.accessTarget);setMessage('Permisos actualizados.')}
        else if(result && action.operation.includes('Trusted')){setTrustedDevices([]);setTrustedCursor(null);setTrustedStatus(action.operation==='registerTrustedDevice'?true:null);setMessage('Cambio de confianza confirmado. MFA sigue siendo obligatorio.')}
        else if(result&&action.operation==='adminResetMfa')setMessage('MFA restablecido. El usuario debe configurar y verificar un nuevo factor.')
        else if (result?.state && result.state !== 'REVOKED') accept(result)
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
  async function trustedList(cursor?:string){
    const result=await call('listTrustedDevices',undefined,undefined,undefined,cursor?{cursor}:undefined)
    if(result){setTrustedDevices(previous=>cursor?[...previous,...result.items.filter((item:{id:string})=>!previous.some(d=>d.id===item.id))]:result.items);setTrustedCursor(result.next_cursor)}
  }
  async function trustedAction(operation:string,body?:object){
    const direct=await call(operation,body)
    if(direct){setTrustedDevices([]);setTrustedCursor(null);setTrustedStatus(operation==='registerTrustedDevice'?true:null);setMessage('Cambio de confianza confirmado. MFA sigue siendo obligatorio.');return}
    if(lastFailure.current!=='STEP_UP_REQUIRED')return
    const result=await call('startStepUp',{grant_id:'B1-SELF-06'})
    if(result){setPendingAction({operation,body});prepare(result,{grant_id:'B1-SELF-06'})}
  }
  async function loadUserAccess(target:string){
    const result=await call('getUserAccess',undefined,undefined,undefined,{target_user_id:target})
    if(result){setAccessOpen(true);setAccessView({target,detail:result})}
  }
  async function changeAccess(body:object,target:string){
    const result=await call('changeAccess',body)
    if(result){await loadUserAccess(target);setMessage('Permisos actualizados.');return}
    if(lastFailure.current!=='STEP_UP_REQUIRED')return
    const step=await call('startStepUp',{grant_id:'B1-SELF-06'})
    if(step){setPendingAction({operation:'changeAccess',body,accessTarget:target});prepare(step,{grant_id:'B1-SELF-06'})}
  }
  async function enroll() {
    const result = await call('enrollTotp')
    if (result) setEnrollment(result)
  }
  return <main className="auth-panel" style={{ maxWidth: 640, margin: '3rem auto', padding: 24 }}>
    <h1>CleanOps 360 · Acceso</h1>
    <p role="status" aria-live="polite">{busy ? 'Procesando…' : message}</p>
    <fieldset disabled={busy} aria-busy={busy} style={{ border: 0, padding: 0 }}>
      {!view.auth && !challenge && !selection && !resetting && !resetDone && <form onSubmit={event => { event.preventDefault(); void login(event.currentTarget) }}>
        <p><label>Email <input name="email" type="email" autoComplete="username" required maxLength={254} /></label></p>
        <p><label>Contraseña <input name="password" type="password" autoComplete="current-password" required /></label></p>
        <button type="submit">Continuar</button>
      </form>}
      {!view.auth && !challenge && !selection && !resetting && !resetDone && <button type="button" onClick={()=>{clearCeremony();setResetting(true);setMessage('Necesitas el ticket obtenido por el procedimiento de identidad autorizado y tu código de recuperación.')}}>Restablecer contraseña</button>}
      {resetting && <form onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form);form.reset();const code=String(data.get('recovery_code')??'');const result=await call('resetPassword',{ticket:String(data.get('ticket')),new_password:String(data.get('new_password')),...(code?{recovery_code:code}:{})});if(result){clearCeremony();setView(emptyView);setResetDone(true);setMessage('Contraseña actualizada. Vuelve a iniciar el acceso y completa MFA.')}}}>
        <h2>Restablecer contraseña</h2>
        <p><label>Ticket de restablecimiento <input name="ticket" type="password" autoComplete="off" minLength={43} maxLength={43} pattern="[A-Za-z0-9_-]{43}" required /></label></p>
        <p><label>Código de recuperación <input name="recovery_code" type="password" autoComplete="off" minLength={26} maxLength={26} pattern="[A-Z2-7]{26}" /></label></p>
        <p><label>Nueva contraseña <input name="new_password" type="password" autoComplete="new-password" maxLength={128} required /></label></p>
        <button type="submit">Confirmar restablecimiento</button>
        <button type="button" onClick={()=>{clearCeremony();setMessage('')}}>Cancelar restablecimiento</button>
      </form>}
      {resetDone && <p><a href="/login">Volver al acceso</a></p>}
      {!view.auth && !resetDone && <p><a href="/login">Reiniciar acceso</a></p>}
      {view.auth && <p>{view.auth.state === 'ACTIVE' && !selection && !challenge ? 'Acceso confirmado. Elige una acción.' : 'Completa la verificación para acceder.'}</p>}
      {selection && !recovering && <form onSubmit={event => { event.preventDefault(); void selectMethod() }}>
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
      {challenge && !recovering && <form onSubmit={event => { event.preventDefault(); void verify(event.currentTarget) }}>
        {challenge.allowed_methods.includes('EMAIL_OTP') && <p>Introduce el código enviado a tu dirección verificada. No compartas este código.</p>}
        <label>Método <select name="method">{challenge.allowed_methods.map(m => <option key={m}>{m}</option>)}</select></label>
        <p><label>Código <input name="proof" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label></p>
        <button type="submit">Verificar</button>
        {challenge.allowed_methods.includes('EMAIL_OTP') && <button type="button" onClick={async () => { const r = await call(emailEnrollment ? 'resendEmailEnrollment' : 'resendEmail', { challenge_id: challenge.challenge_id }); if (r) setChallenge({ challenge_id: r.challenge_id, allowed_methods: r.allowed_methods ?? [r.method], expires_at: r.expires_at }) }}>Reenviar código</button>}
      </form>}
      {!recovering && (view.auth?.state === 'PENDING_MFA' || (selection && view.auth?.state !== 'ACTIVE')) && <button type="button" onClick={() => setRecovering(true)}>Usar código de recuperación</button>}
      {recovering && <form onSubmit={async event => {
        event.preventDefault(); const form=event.currentTarget; const data=new FormData(form);form.reset()
        const result=await call('recoverMfa',{recovery_code:String(data.get('recovery_code'))})
        if(result){clearCeremony();accept(result)}
      }}><h2>Recuperar segundo factor</h2><p>El código se consume una sola vez. Deberás configurar y verificar un nuevo método MFA antes de acceder.</p>
        <label>Código de recuperación <input name="recovery_code" type="password" autoComplete="off" pattern="[A-Z2-7]{26}" minLength={26} maxLength={26} required /></label>
        <button type="submit">Recuperar y configurar MFA</button>
      </form>}
      {view.auth?.state === 'ENROLLMENT_REQUIRED' && !enrollment && !challenge && <button type="button" onClick={async () => { const r = await call('enrollEmail'); if (r) { setEmailEnrollment(true); setChallenge(r) } }}>Configurar códigos por email</button>}
      {view.auth?.state === 'ENROLLMENT_REQUIRED' && !enrollment && !challenge && <button onClick={() => void enroll()}>Configurar autenticador</button>}
      {emailPending && !challenge && !selection && <section><h2>Confirma el método por email</h2>
        <p>Autoriza la confirmación con un método MFA ya activo antes de introducir el primer código del nuevo método.</p>
        <button type="button" onClick={async () => { const r = await call('startStepUp', { grant_id: 'B1-SELF-06' }); if (r) prepare(r, { grant_id: 'B1-SELF-06' }) }}>Autorizar confirmación email</button>
      </section>}
      {enrollment && !challenge && !selection && <section><h2>Configura tu autenticador</h2><p>Introduce esta URI en tu aplicación. Se muestra una sola vez.</p>
        <TotpEnrollmentQr key={enrollment.enrollment_id} uri={enrollment.provisioning_uri} />
        <output style={{ overflowWrap: 'anywhere' }}>{enrollment.provisioning_uri}</output>
        {view.auth?.state === 'ACTIVE' && !enrollmentAuthorized && <><p>Confirmar otro autenticador reemplaza los códigos de recuperación anteriores.</p><button onClick={async () => { const result = await call('startStepUp', { grant_id: 'B1-SELF-06' }); if (result) prepare(result, { grant_id: 'B1-SELF-06' }) }}>Autorizar confirmación</button></>}
        {(view.auth?.state !== 'ACTIVE' || enrollmentAuthorized) && <form onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); form.reset(); const r = await call('confirmTotp', { enrollment_id: enrollment.enrollment_id, proof: String(data.get('proof')) }); if (r) { accept(r.auth); setView(v => ({ ...v, codes: r.codes })) } }}>
          <label>Primer código <input name="proof" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label><button>Confirmar</button>
        </form>}</section>}
      {view.codes.length > 0 && <section><h2>Códigos de recuperación</h2><p>Guárdalos de forma segura. No volverán a mostrarse.</p><ul>{view.codes.map(c => <li key={c}><code>{c}</code></li>)}</ul><button onClick={() => setView(v => ({ ...v, codes: [] }))}>Ya los he guardado</button></section>}
      {view.auth && !challenge && !selection && !enrollment && <section>
        <button onClick={() => void tenants()}>Seleccionar empresa</button>
        <ul>{(view.tenants as Tenant[]).map(t => <li key={t.id}><button onClick={() => void choose(t.id)}>{t.name}</button></li>)}</ul>
      </section>}
      {view.auth?.state === 'ACTIVE' && !challenge && !selection && !enrollment && !emailPending && <section>
        <h2>Seguridad de la cuenta</h2>
        <button onClick={async () => { const result = await call('startStepUp', { grant_id: 'B1-SELF-05' }); if (result) { setPendingAction({ operation: 'enrollTotp' }); prepare(result, { grant_id: 'B1-SELF-05' }) } }}>Añadir autenticador</button>
        <button type="button" onClick={async () => { const r = await call('startStepUp', { grant_id: 'B1-SELF-05' }); if (r) { setPendingAction({ operation: 'enrollEmail' }); prepare(r, { grant_id: 'B1-SELF-05' }) } }}>Añadir códigos por email</button>
        <button onClick={async () => { const r = await call('getCurrentIdentity'); if (r) setMessage(`Sesión de ${r.display_name}`) }}>Mi identidad</button>
        <button onClick={() => void sessions()}>Mis sesiones</button>
        <ul>{(view.sessions as Session[]).map(s => <li key={s.id}><span>{s.device_label} · {s.browser_label} {s.is_current ? '(actual)' : ''}</span><dl>
          <dt>Creada</dt><dd><time dateTime={s.created_at}>{new Date(s.created_at).toLocaleString('es-CH')}</time></dd>
          <dt>Última actividad</dt><dd><time dateTime={s.last_activity_at}>{new Date(s.last_activity_at).toLocaleString('es-CH')}</time></dd>
          <dt>Caducidad absoluta</dt><dd><time dateTime={s.absolute_expires_at}>{new Date(s.absolute_expires_at).toLocaleString('es-CH')}</time></dd>
        </dl><button onClick={async () => { const r = await call('revokeSelfSession', undefined, s.id); if (r) { if (s.is_current) { clearCeremony(); setEnrollment(null); setView(emptyView) } else { setView(v => ({ ...v, sessions: [] })); setSessionsCursor(null) } } }}>Revocar</button></li>)}</ul>
        {sessionsCursor && <button onClick={() => void sessions(sessionsCursor)}>Cargar más sesiones</button>}
        <button onClick={async () => { const r = await call('startStepUp', { grant_id: 'B1-SELF-04' }); if (r) { setPendingAction({ operation: 'revokeOtherOwnSessions', body: { reason: 'Revocación de mis demás sesiones' } }); prepare(r, { grant_id: 'B1-SELF-04' }); setView(v => ({ ...v, sessions: [], codes: [] })); setSessionsCursor(null) } }}>Revocar mis demás sesiones</button>
        <section aria-labelledby="administration-heading"><h3 id="administration-heading">Administración</h3>
          <button type="button" onClick={()=>{setAccessOpen(v=>!v);setAccessView(null)}}>Usuarios y permisos</button>
          {accessOpen && <UsersDirectory onManageAccess={loadUserAccess} />}
          {accessOpen&&<form onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void loadUserAccess(String(d.get('access_target')))}}>
            <label>Usuario para Manage Access <input name="access_target" minLength={36} maxLength={36} required /></label>
            <button type="submit">Abrir Manage Access</button>
          </form>}
          {accessView&&<ManageAccessPanel key={accessView.target+':'+accessView.detail.policy_version} target={accessView.target} detail={accessView.detail} onReload={()=>loadUserAccess(accessView.target)} onChange={body=>changeAccess(body,accessView.target)} onCheck={async query=>{const r=await call('checkEffectiveAccess',undefined,undefined,undefined,query);return r?r.allowed:null}} />}
        </section>
        <section aria-labelledby="trusted-heading"><h3 id="trusted-heading">Dispositivos de confianza</h3>
          <p>Confianza válida hasta 30 días. No sustituye MFA ni prolonga tu sesión. No registres dispositivos compartidos.</p>
          <button type="button" onClick={()=>void trustedAction('registerTrustedDevice')}>Recordar este dispositivo</button>
          <button type="button" onClick={async()=>{const r=await call('verifyTrustedDevice');if(r)setTrustedStatus(r.valid)}}>Comprobar este dispositivo</button>
          {trustedStatus!==null && <p role="status">{trustedStatus?'Este dispositivo tiene confianza vigente.':'Este dispositivo no tiene confianza vigente.'}</p>}
          <button type="button" onClick={()=>void trustedList()}>Ver dispositivos de confianza</button>
          <ul>{trustedDevices.map((device,index)=><li key={device.id}><span>Dispositivo {index+1}</span><dl>
            <dt>Registrado</dt><dd><time dateTime={device.created_at}>{new Date(device.created_at).toLocaleString('es-CH')}</time></dd>
            <dt>Caduca</dt><dd><time dateTime={device.expires_at}>{new Date(device.expires_at).toLocaleString('es-CH')}</time></dd>
          </dl><button type="button" onClick={()=>void trustedAction('revokeTrustedDevice',{device_id:device.id})}>Revocar dispositivo {index+1}</button></li>)}</ul>
          {trustedCursor && <button type="button" onClick={()=>void trustedList(trustedCursor)}>Cargar más dispositivos</button>}
          <button type="button" onClick={()=>void trustedAction('revokeAllTrustedDevices')}>Revocar todos mis dispositivos</button>
          <details><summary>Revocación administrativa de confianza</summary><p>Requiere autorización del servidor sobre el usuario destinatario.</p>
            <form onSubmit={event=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form);form.reset();void trustedAction('adminRevokeTrustedDevices',{target_user_id:String(data.get('trusted_target'))})}}>
              <label>Usuario para revocar confianza <input name="trusted_target" minLength={36} maxLength={36} required /></label>
              <button type="submit">Verificar y revocar confianza del usuario</button>
            </form>
          </details>
        </section>
        <details><summary>Restablecer MFA de otro usuario</summary><p>Requiere comprobación de identidad independiente, autorización del servidor y step-up. Revoca factores, sesiones y dispositivos de confianza del destinatario en esta empresa.</p>
          <form onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form);form.reset();const body={target_user_id:String(data.get('mfa_reset_target')),ticket:String(data.get('mfa_reset_ticket')),reason:String(data.get('mfa_reset_reason'))};const r=await call('startStepUp',{grant_id:'B1-SELF-06'});if(r){setPendingAction({operation:'adminResetMfa',body});prepare(r,{grant_id:'B1-SELF-06'})}}}>
            <p><label>Usuario para restablecer MFA <input name="mfa_reset_target" minLength={36} maxLength={36} required /></label></p>
            <p><label>Comprobante verificado de reset MFA <input name="mfa_reset_ticket" type="password" autoComplete="off" minLength={43} maxLength={43} required /></label></p>
            <p><label>Motivo del reset MFA <input name="mfa_reset_reason" maxLength={500} required /></label></p>
            <button type="submit">Verificar y restablecer MFA</button>
          </form>
        </details>
        <details><summary>Autorizar restablecimiento de credenciales</summary><p>Solo para operadores autorizados, tras la comprobación independiente de identidad. No introduzcas la contraseña de otra persona.</p>
          <form onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form);form.reset();const body={target_user_id:String(data.get('target_user_id')),ticket:String(data.get('ticket')),reason:String(data.get('reason'))};const r=await call('startStepUp',{grant_id:'B1-SELF-06'});if(r){setPendingAction({operation:'authorizePasswordReset',body});prepare(r,{grant_id:'B1-SELF-06'})}}}>
            <p><label>Usuario destinatario <input name="target_user_id" minLength={36} maxLength={36} required /></label></p>
            <p><label>Ticket comprobado <input name="ticket" type="password" autoComplete="off" minLength={43} maxLength={43} required /></label></p>
            <p><label>Motivo del restablecimiento <input name="reason" maxLength={500} required /></label></p>
            <button type="submit">Verificar y autorizar restablecimiento</button>
          </form>
        </details>
        <button onClick={async () => { const r = await call('logout'); if (r) { clearCeremony(); setEnrollment(null); setView(emptyView); window.location.assign('/login') } }}>Cerrar sesión</button>
      </section>}
    </fieldset>
    {(selection || challenge || emailPending || recovering) && <button type="button" onClick={() => endCeremony('Verificación cancelada. Inicia una nueva verificación.')}>Cancelar verificación</button>}
  </main>
}
