'use client'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import {TotpEnrollmentQr} from './totp-enrollment-qr'

export function InvitationAcceptancePanel(){
 const link=useRef<{invitation_id:string;token:string}|null>(null)
 const [state,setState]=useState<'INITIAL'|'MFA_REQUIRED'|'READY'|'ACCEPTED'>('INITIAL')
 const [uri,setUri]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{
  const fragment=new URLSearchParams(window.location.hash.slice(1))
  const invitation_id=fragment.get('id'),token=fragment.get('token')
  window.history.replaceState(null,'',window.location.pathname)
  if(invitation_id&&token)link.current={invitation_id,token}
  return ()=>{link.current=null}
 },[])
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return
  const form=event.currentTarget,fields=new FormData(form)
  let input:Record<string,unknown>
  if(state==='INITIAL'){
   if(!link.current){setMessage('El enlace no está disponible. Solicita una nueva invitación.');return}
   input={operation:'PREPARE',...link.current,password:String(fields.get('password')??'')}
  }else input=state==='MFA_REQUIRED'?{operation:'FACTOR',proof:String(fields.get('proof')??'')}:{operation:'ACCEPT'}
  form.reset();setBusy(true);setMessage('')
  try{
   const csrf=document.cookie.split(';').map(p=>p.trim()).find(p=>p.startsWith('__Host-cleanops_invitation_csrf='))?.split('=')[1]??''
   const response=await fetch('/auth/invitations/acceptance',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(input)})
   delete input.password;delete input.token
   const result=await response.json()
   if(!response.ok)throw new Error(response.status===503?'La aceptación no está disponible todavía.':'No se pudo verificar la invitación. Comprueba el enlace y tus datos.')
   if(!['MFA_REQUIRED','READY','ACCEPTED'].includes(result.data?.state))throw new Error('Respuesta no disponible.')
   setState(result.data.state);setUri(result.data.provisioning_uri??'')
   if(result.data.state==='ACCEPTED')link.current=null
  }catch(error){setMessage(error instanceof Error?error.message:'No se pudo completar la solicitud.')}
  finally{delete input.password;delete input.token;setBusy(false)}
 }
 return <main style={{maxWidth:560,margin:'4rem auto',padding:'1.5rem'}}>
  <h1>Aceptar invitación</h1>
  <p>Verifica tus credenciales y completa la seguridad requerida antes de activar tu acceso.</p>
  {state==='ACCEPTED'?<><p role="status">Invitación aceptada. Ya puedes iniciar sesión.</p><a href="/login">Ir al inicio de sesión</a></>:<form onSubmit={submit} aria-busy={busy}>
   {state==='INITIAL'&&<><p>Si ya tienes una cuenta, utiliza tu contraseña actual. En caso contrario, elige tu primera contraseña.</p><label htmlFor="invitation-password">Contraseña</label><input id="invitation-password" name="password" type="password" autoComplete="current-password" maxLength={1024} required disabled={busy}/></>}
   {state==='MFA_REQUIRED'&&<><p>Configura tu autenticador y verifica el código. Este paso todavía no activa el acceso.</p>{uri&&<TotpEnrollmentQr uri={uri}/>}<label htmlFor="invitation-proof">Código de autenticación</label><input id="invitation-proof" name="proof" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy}/></>}
   {state==='READY'&&<p>Verificación completada. Confirma la activación para continuar al inicio de sesión ordinario.</p>}
   <button type="submit" disabled={busy}>{busy?'Verificando…':state==='READY'?'Activar acceso':'Verificar'}</button>
  </form>}
  {message&&<p role="alert">{message}</p>}
 </main>
}
