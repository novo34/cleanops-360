'use client'
import {useRef,useState} from 'react'
import {accessChangeFromForm,AccessFormError} from '../lib/b2/access-form'
export type AccessDetail={policy_version:string;can_manage:boolean;can_manage_global:boolean;roles:{id:string;label:string;start_at:string;expires_at:string|null}[];rules:{id:string;role_id:string|null;action:string;resource_kind:string;resource_id:string|null;effect:string;start_at:string;expires_at:string|null}[]}
export type RoleOption={role_id:string;label:string;assignable:boolean}
const actions=['view','create','edit','approve','delete','export','manage_permissions'] as const
type Props={target:string;detail:AccessDetail;onReload:()=>Promise<void>;onChange:(body:object)=>Promise<void>;onCheck:(query:Record<string,string>)=>Promise<boolean|null>;onTargetCheck?:(query:Record<string,string>)=>Promise<boolean|null>;onRoles?:(after?:string)=>Promise<{items:RoleOption[];next_after:string|null}|null>}
export function ManageAccessPanel({target,detail,onReload,onChange,onCheck,onTargetCheck,onRoles}:Props){
 const [operation,setOperation]=useState('USER_RULE'),[check,setCheck]=useState<boolean|null>(null),[error,setError]=useState('')
 const [roles,setRoles]=useState<RoleOption[]>([]),[nextRole,setNextRole]=useState<string|null>(null),[rolesBusy,setRolesBusy]=useState(false),[rolesError,setRolesError]=useState('')
 const [targetCheck,setTargetCheck]=useState<boolean|null>(null),[checking,setChecking]=useState(false),[checkError,setCheckError]=useState('')
 const [saving,setSaving]=useState(false),writePending=useRef(false),draftIds=useRef<Record<string,string>>({})
 async function submit(form:HTMLFormElement){
  if(writePending.current||!detail.can_manage)return
  setError('')
  try{
   const body=accessChangeFromForm(operation,target,detail.policy_version,new FormData(form),()=>draftIds.current[operation]??(draftIds.current[operation]=crypto.randomUUID()))
   writePending.current=true;setSaving(true)
   await onChange(body)
  }catch(failure){setError(failure instanceof AccessFormError?failure.message:'No se pudo confirmar el cambio. Actualiza los permisos antes de reintentar.')}
  finally{writePending.current=false;setSaving(false)}
 }
 return <section className="manage-access-panel" aria-labelledby="access-title">
  <nav aria-label="Ubicación de permisos"><p>Administración → Usuarios → Detalle de usuario → Manage Access</p></nav>
  <h3 id="access-title">Manage Access</h3><p>Usuario: {target}</p>
  <p>La API comprueba los permisos en cada operación. Una regla mostrada puede estar programada o caducada; no implica acceso efectivo.</p>
  <button type="button" disabled={saving} onClick={()=>void onReload()}>Actualizar permisos</button>
  {!detail.can_manage&&<p>Solo lectura: no tienes autorización para modificar este usuario.</p>}
  <h4>Roles asignados</h4><ul>{detail.roles.map(role=><li key={role.id}><strong>{role.label}</strong><p>{role.id}</p><p>Desde <time dateTime={role.start_at}>{role.start_at}</time>{role.expires_at&&<> hasta <time dateTime={role.expires_at}>{role.expires_at}</time></>}</p></li>)}</ul>
  <h4>Reglas y overrides individuales</h4><ul>{detail.rules.map(rule=><li key={rule.id}><strong>{rule.effect} · {rule.action} · {rule.resource_kind}</strong><p>Regla: {rule.id}{rule.role_id?' · Rol: '+rule.role_id:' · Individual'}</p><p>Recurso: {rule.resource_id??'Ámbito del tipo en esta empresa'}</p><p>Desde <time dateTime={rule.start_at}>{rule.start_at}</time>{rule.expires_at&&<> hasta <time dateTime={rule.expires_at}>{rule.expires_at}</time></>}</p></li>)}</ul>
  {!detail.roles.length&&<p>No hay roles asignados.</p>}{!detail.rules.length&&<p>No hay reglas individuales ni heredadas que mostrar.</p>}
  {onRoles&&detail.can_manage&&<div><button type="button" disabled={rolesBusy} onClick={async()=>{setRolesBusy(true);setRolesError('');try{const result=await onRoles(nextRole??undefined);if(result){setRoles(previous=>[...previous,...result.items.filter(role=>!previous.some(existing=>existing.role_id===role.role_id))]);setNextRole(result.next_after)}else setRolesError('No se pudo consultar el catálogo de roles.')}catch{setRolesError('No se pudo consultar el catálogo de roles.')}finally{setRolesBusy(false)}}}>{rolesBusy?'Consultando roles…':nextRole?'Cargar más roles':'Consultar roles disponibles'}</button><datalist id="access-role-options">{roles.map(role=><option key={role.role_id} value={role.role_id} disabled={!role.assignable} label={role.label+(role.assignable?'':' · Fuera de tu ámbito de asignación')} />)}</datalist>{rolesError&&<p role="alert">{rolesError}</p>}{roles.length>0&&<p role="status">{roles.length} roles consultados. La asignación se valida de nuevo al guardar.</p>}</div>}
  <fieldset disabled={!detail.can_manage||saving} aria-busy={saving}><legend>Modificar asignaciones</legend>
   <label htmlFor="access-operation">Tipo de cambio</label><select id="access-operation" value={operation} onChange={e=>{setOperation(e.target.value);setError('')}}>
    <option value="USER_RULE">Override individual</option><option value="MEMBERSHIP">Asignar rol</option>
    {detail.can_manage_global&&<><option value="ROLE">Crear o editar rol</option><option value="ROLE_RULE">Regla de rol</option></>}
    <option value="REVOKE">Revocar asignación</option>
   </select>
   <form key={operation} onSubmit={event=>{event.preventDefault();void submit(event.currentTarget)}}>
    {['ROLE','ROLE_RULE','MEMBERSHIP'].includes(operation)&&<p><label>Identificador del rol <input name="role_id" list={operation==='MEMBERSHIP'?'access-role-options':undefined} minLength={36} maxLength={36} required={operation!=='ROLE'} /></label></p>}
    {operation==='ROLE'&&<p><label>Nombre del rol <input name="label" maxLength={120} required /></label></p>}
    {['USER_RULE','ROLE_RULE'].includes(operation)&&<>
     <p><label>Identificador de regla existente <input name="rule_id" minLength={36} maxLength={36} /></label></p><p>Déjalo vacío para una regla nueva.</p>
     <p><label htmlFor="access-action">Acción de la regla</label><select id="access-action" name="action">{actions.map(a=><option key={a}>{a}</option>)}</select></p>
     <p><label>Tipo de recurso <input name="resource_kind" maxLength={80} pattern="[A-Za-z][A-Za-z0-9_.-]*" required /></label></p>
     <p><label>Recurso concreto <input name="resource_id" minLength={36} maxLength={36} /></label></p>
     <p><label htmlFor="access-effect">Efecto</label><select id="access-effect" name="effect"><option>ALLOW</option><option>DENY</option></select></p>
    </>}
    {['USER_RULE','ROLE_RULE','MEMBERSHIP'].includes(operation)&&<>
     <p>Las fechas y horas se interpretan en la zona horaria de tu dispositivo.</p>
     <p><label>Inicio de vigencia <input type="datetime-local" step="1" name="start_at" required /></label></p>
     <p><label>Fin de vigencia <input type="datetime-local" step="1" name="expires_at" /></label></p>
    </>}
    {operation==='REVOKE'&&<>
     <p><label htmlFor="access-assignment_kind">Tipo de asignación</label><select id="access-assignment_kind" name="assignment_kind"><option value="RULE">Regla</option>{detail.can_manage_global&&<option value="ROLE">Rol completo</option>}<option value="MEMBERSHIP">Pertenencia a rol</option></select></p>
     <p><label>Identificador a revocar <input name="target_id" minLength={36} maxLength={36} required /></label></p>
     {detail.can_manage_global&&<p><label><input type="checkbox" name="global_rule" /> Regla de rol global, sin usuario individual</label></p>}
    </>}
    <p><label>Motivo del cambio <input name="reason" maxLength={500} required /></label></p>
    <button type="submit">{saving?'Guardando cambio…':'Guardar cambio de acceso'}</button>
   </form>
  </fieldset>
  {error&&<p role="alert">{error}</p>}
  {onTargetCheck&&<form onInput={()=>{setTargetCheck(null);setCheckError('')}} onSubmit={async event=>{event.preventDefault();const fields=new FormData(event.currentTarget),resource=String(fields.get('resource_id')??'');setChecking(true);setTargetCheck(null);setCheckError('');try{const result=await onTargetCheck({action:String(fields.get('action')),resource_kind:String(fields.get('resource_kind')),...(resource?{resource_id:resource}:{})});setTargetCheck(result);if(result===null)setCheckError('No se pudo consultar el permiso efectivo.')}catch{setCheckError('No se pudo consultar el permiso efectivo.')}finally{setChecking(false)}}}>
   <h4>Permisos efectivos del usuario seleccionado</h4><p>Resultado vigente para este usuario. Las acciones requieren su autenticación y los controles de seguridad correspondientes.</p>
   <p><label htmlFor="target-check-action">Acción del usuario</label><select id="target-check-action" name="action">{actions.map(action=><option key={action}>{action}</option>)}</select></p>
   <p><label>Tipo de recurso del usuario <input name="resource_kind" maxLength={80} pattern="[A-Za-z][A-Za-z0-9_.-]*" required /></label></p>
   <p><label>Recurso del usuario <input name="resource_id" minLength={36} maxLength={36} /></label></p><button type="submit" disabled={checking}>{checking?'Consultando permiso…':'Consultar permiso del usuario'}</button>
   {targetCheck!==null&&<p role="status">{targetCheck?'El usuario tiene este permiso en el ámbito consultado.':'El usuario no tiene este permiso en el ámbito consultado.'}</p>}{checkError&&<p role="alert">{checkError}</p>}
  </form>}
  <form onInput={()=>setCheck(null)} onSubmit={async e=>{e.preventDefault();const d=new FormData(e.currentTarget),resource=String(d.get('resource_id')??'');setCheck(await onCheck({action:String(d.get('action')),resource_kind:String(d.get('resource_kind')),...(resource?{resource_id:resource}:{})}))}}>
   <h4>Comprobar mi acceso efectivo</h4><p>Comprueba tu sesión actual, no simula la identidad del usuario mostrado.</p>
   <p><label htmlFor="access-check-action">Acción a comprobar</label><select id="access-check-action" name="action">{actions.map(a=><option key={a}>{a}</option>)}</select></p>
   <p><label>Tipo de recurso a comprobar <input name="resource_kind" maxLength={80} pattern="[A-Za-z][A-Za-z0-9_.-]*" required /></label></p>
   <p><label>Recurso a comprobar <input name="resource_id" minLength={36} maxLength={36} /></label></p>
   <button type="submit">Comprobar permiso en servidor</button>
  </form>
  {check!==null&&<p role="status">{check?'Permitido por el servidor.':'Denegado por el servidor.'}</p>}
 </section>
}
