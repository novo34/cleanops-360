'use client'
import {useEffect,useRef,useState} from 'react'

type Invitation={id:string;display_name:string;email:string;state:'ISSUED'|'EXPIRED'|'REVOKED'|'CONSUMED';version:string;expires_at:string}
type Page={items:Invitation[];next_after:string|null;can_invite:boolean}
type Props={refresh:number;onList:(after?:string)=>Promise<Page|null>;onChange:(body:object)=>Promise<boolean|'STEP_UP'>}
const labels={ISSUED:'Pendiente',EXPIRED:'Caducada',REVOKED:'Revocada',CONSUMED:'Aceptada'}
export function InvitationsPanel({refresh,onList,onChange}:Props){
 const [page,setPage]=useState<Page|null>(null),[after,setAfter]=useState<string|undefined>(),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [selected,setSelected]=useState<{row:Invitation;operation:'RESEND'|'REVOKE'}|null>(null)
 const readRef=useRef(onList),writePending=useRef(false),dialog=useRef<HTMLDialogElement>(null),focus=useRef<HTMLElement|null>(null)
 useEffect(()=>{readRef.current=onList},[onList])
 useEffect(()=>{
  let current=true
  void(async()=>{setBusy(true);setError('');setPage(null);try{const result=await readRef.current(after);if(current){setPage(result);if(!result)setError('No se pudieron consultar las invitaciones.')}}catch{if(current)setError('No se pudieron consultar las invitaciones.')}finally{if(current)setBusy(false)}})()
  return()=>{current=false}
 },[after,refresh,revision])
 function close(){if(writePending.current)return;dialog.current?.close();setSelected(null);focus.current?.focus()}
 async function save(body:object,form:HTMLFormElement){
  if(writePending.current||!page?.can_invite)return
  writePending.current=true;setSaving(true);setError('')
  try{
   const result=await onChange(body)
   if(result===true){form.reset();dialog.current?.close();setSelected(null);setAfter(undefined);setRevision(value=>value+1);focus.current?.focus()}
   else if(!result)setError('No se pudo confirmar la solicitud. Actualiza las invitaciones antes de reintentar.')
  }catch{setError('No se pudo confirmar la solicitud. Actualiza las invitaciones antes de reintentar.')}
  finally{writePending.current=false;setSaving(false)}
 }
 return <section className="users-directory" aria-labelledby="invitations-title" aria-busy={busy||saving}>
  <h3 id="invitations-title">Invitaciones</h3><p>Enlace individual de un solo uso. La persona elige su contraseña y verifica MFA cuando lo exige la política. El enlace no concede acceso por sí mismo.</p>
  <button type="button" disabled={busy||saving} onClick={()=>{setAfter(undefined);setRevision(value=>value+1)}}>Actualizar invitaciones</button>
  {busy&&<p role="status">Consultando invitaciones…</p>}{error&&<p role="alert">{error}</p>}
  {page&&<>
   {!page.can_invite&&<p>Solo lectura: no tienes autorización para gestionar invitaciones.</p>}
   {page.items.length===0?<p>No hay invitaciones que mostrar.</p>:<div className="users-table-wrap"><table><caption>Invitaciones de esta empresa</caption><thead><tr><th scope="col">Persona</th><th scope="col">Email</th><th scope="col">Estado</th><th scope="col">Caducidad</th><th scope="col">Acciones</th></tr></thead><tbody>
    {page.items.map(row=><tr key={row.id}><th scope="row">{row.display_name}</th><td>{row.email}</td><td>{labels[row.state]}</td><td><time dateTime={row.expires_at}>{new Date(row.expires_at).toLocaleString('es-CH')}</time></td><td>
     {(['RESEND','REVOKE'] as const).map(operation=><button key={operation} type="button" disabled={!page.can_invite||saving||!['ISSUED','EXPIRED'].includes(row.state)} onClick={()=>{focus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSelected({row,operation});dialog.current?.showModal()}}>{operation==='RESEND'?'Reenviar':'Revocar'} invitación de {row.display_name}</button>)}
    </td></tr>)}
   </tbody></table></div>}
   <nav aria-label="Paginación de invitaciones"><button type="button" disabled={!after||busy||saving} onClick={()=>setAfter(undefined)}>Primera página</button><button type="button" disabled={!page.next_after||busy||saving} onClick={()=>setAfter(page.next_after??undefined)}>Siguiente página</button></nav>
   <form onSubmit={event=>{event.preventDefault();const form=event.currentTarget,fields=new FormData(form);void save({operation:'CREATE',display_name:String(fields.get('display_name')??'').trim(),email:String(fields.get('email')??'').trim(),reason:String(fields.get('reason')??'').trim()},form)}}>
    <fieldset disabled={!page.can_invite||saving}><legend>Invitar a una persona</legend>
     <p><label>Nombre de la persona <input name="display_name" maxLength={120} autoComplete="off" required /></label></p>
     <p><label>Email de la invitación <input name="email" type="email" maxLength={254} autoComplete="off" required /></label></p>
     <p><label>Motivo de la invitación <input name="reason" maxLength={500} required /></label></p><button type="submit">{saving?'Guardando solicitud…':'Enviar invitación'}</button>
    </fieldset>
   </form>
  </>}
  <dialog ref={dialog} aria-labelledby="invitation-confirm-title" onCancel={event=>{event.preventDefault();close()}}>
   {selected&&<form onSubmit={event=>{event.preventDefault();const fields=new FormData(event.currentTarget);void save({operation:selected.operation,invitation_id:selected.row.id,expected_version:selected.row.version,reason:String(fields.get('reason')??'').trim()},event.currentTarget)}}>
    <h4 id="invitation-confirm-title">{selected.operation==='RESEND'?'Reenviar invitación':'Revocar invitación'}</h4>
    <p>{selected.row.display_name} · {selected.row.email}</p><p>{selected.operation==='RESEND'?'El enlace anterior dejará de ser válido.':'El enlace y cualquier aceptación pendiente dejarán de ser válidos.'}</p>
    <fieldset disabled={saving}><label>Motivo de la modificación <input name="reason" maxLength={500} required /></label><button type="submit">Confirmar {selected.operation==='RESEND'?'reenvío':'revocación'}</button></fieldset>
    <button type="button" disabled={saving} onClick={close}>Cancelar</button>
   </form>}
  </dialog>
 </section>
}
