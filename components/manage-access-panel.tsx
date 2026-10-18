'use client'
import {useState} from 'react'
export type AccessDetail={policy_version:string;can_manage:boolean;can_manage_global:boolean;roles:{id:string;label:string;start_at:string;expires_at:string|null}[];rules:{id:string;role_id:string|null;action:string;resource_kind:string;resource_id:string|null;effect:string;start_at:string;expires_at:string|null}[]}
const actions=['view','create','edit','approve','delete','export','manage_permissions'] as const
type Props={target:string;detail:AccessDetail;onReload:()=>Promise<void>;onChange:(body:object)=>Promise<void>;onCheck:(query:Record<string,string>)=>Promise<boolean|null>}
export function ManageAccessPanel({target,detail,onReload,onChange,onCheck}:Props){
 const [operation,setOperation]=useState('USER_RULE'),[check,setCheck]=useState<boolean|null>(null),[error,setError]=useState('')
 async function submit(form:HTMLFormElement){
  setError('');const f=new FormData(form),text=(key:string)=>String(f.get(key)??'')
  const common={operation,expected_policy:detail.policy_version,reason:text('reason')}
  try{
   const role=text('role_id')||crypto.randomUUID(),rule=text('rule_id')||crypto.randomUUID()
   const period=()=>({start_at:new Date(text('start_at')).toISOString(),expires_at:text('expires_at')?new Date(text('expires_at')).toISOString():null})
   let body:object
   if(operation==='ROLE')body={...common,role_id:role,label:text('label')}
   else if(operation==='MEMBERSHIP')body={...common,role_id:role,target_user_id:target,...period()}
   else if(operation==='REVOKE')body={...common,assignment_kind:text('assignment_kind'),target_id:text('target_id'),subject_id:text('assignment_kind')==='ROLE'||f.has('global_rule')?null:target}
   else body={...common,...(operation==='USER_RULE'?{target_user_id:target}:{role_id:role}),rule_id:rule,action:text('action'),resource_kind:text('resource_kind'),resource_id:text('resource_id')||null,effect:text('effect'),...period()}
   await onChange(body)
  }catch{setError('Revisa los identificadores y fechas antes de continuar.')}
 }
 return <section aria-labelledby="access-title">
  <nav aria-label="Ubicación de permisos"><p>Administración → Usuarios → Detalle de usuario → Manage Access</p></nav>
  <h3 id="access-title">Manage Access</h3><p>Usuario: {target}</p>
  <p>La API comprueba los permisos en cada operación. Una regla mostrada puede estar programada o caducada; no implica acceso efectivo.</p>
  <button type="button" onClick={()=>void onReload()}>Actualizar permisos</button>
  {!detail.can_manage&&<p>Solo lectura: no tienes autorización para modificar este usuario.</p>}
  <h4>Roles asignados</h4><ul>{detail.roles.map(role=><li key={role.id}><strong>{role.label}</strong><p>{role.id}</p><p>Desde <time dateTime={role.start_at}>{role.start_at}</time>{role.expires_at&&<> hasta <time dateTime={role.expires_at}>{role.expires_at}</time></>}</p></li>)}</ul>
  <h4>Reglas y overrides individuales</h4><ul>{detail.rules.map(rule=><li key={rule.id}><strong>{rule.effect} · {rule.action} · {rule.resource_kind}</strong><p>Regla: {rule.id}{rule.role_id?' · Rol: '+rule.role_id:' · Individual'}</p><p>Recurso: {rule.resource_id??'Ámbito del tipo en esta empresa'}</p><p>Desde <time dateTime={rule.start_at}>{rule.start_at}</time>{rule.expires_at&&<> hasta <time dateTime={rule.expires_at}>{rule.expires_at}</time></>}</p></li>)}</ul>
  <fieldset disabled={!detail.can_manage}><legend>Modificar asignaciones</legend>
   <label>Tipo de cambio <select value={operation} onChange={e=>{setOperation(e.target.value);setError('')}}>
    <option value="USER_RULE">Override individual</option><option value="MEMBERSHIP">Asignar rol</option>
    {detail.can_manage_global&&<><option value="ROLE">Crear o editar rol</option><option value="ROLE_RULE">Regla de rol</option></>}
    <option value="REVOKE">Revocar asignación</option>
   </select></label>
   <form key={operation} onSubmit={event=>{event.preventDefault();void submit(event.currentTarget)}}>
    {['ROLE','ROLE_RULE','MEMBERSHIP'].includes(operation)&&<p><label>Identificador del rol <input name="role_id" minLength={36} maxLength={36} required={operation!=='ROLE'} /></label></p>}
    {operation==='ROLE'&&<p><label>Nombre del rol <input name="label" maxLength={120} required /></label></p>}
    {['USER_RULE','ROLE_RULE'].includes(operation)&&<>
     <p><label>Identificador de regla existente <input name="rule_id" minLength={36} maxLength={36} /></label></p><p>Déjalo vacío para una regla nueva.</p>
     <p><label>Acción de la regla <select name="action">{actions.map(a=><option key={a}>{a}</option>)}</select></label></p>
     <p><label>Tipo de recurso <input name="resource_kind" maxLength={80} pattern="[A-Za-z][A-Za-z0-9_.-]*" required /></label></p>
     <p><label>Recurso concreto <input name="resource_id" minLength={36} maxLength={36} /></label></p>
     <p><label>Efecto <select name="effect"><option>ALLOW</option><option>DENY</option></select></label></p>
    </>}
    {['USER_RULE','ROLE_RULE','MEMBERSHIP'].includes(operation)&&<>
     <p><label>Inicio de vigencia <input type="datetime-local" step="1" name="start_at" required /></label></p>
     <p><label>Fin de vigencia <input type="datetime-local" step="1" name="expires_at" /></label></p>
    </>}
    {operation==='REVOKE'&&<>
     <p><label>Tipo de asignación <select name="assignment_kind"><option value="RULE">Regla</option>{detail.can_manage_global&&<option value="ROLE">Rol completo</option>}<option value="MEMBERSHIP">Pertenencia a rol</option></select></label></p>
     <p><label>Identificador a revocar <input name="target_id" minLength={36} maxLength={36} required /></label></p>
     {detail.can_manage_global&&<p><label><input type="checkbox" name="global_rule" /> Regla de rol global, sin usuario individual</label></p>}
    </>}
    <p><label>Motivo del cambio <input name="reason" maxLength={500} required /></label></p>
    <button type="submit">Guardar cambio de acceso</button>
   </form>
  </fieldset>
  {error&&<p role="alert">{error}</p>}
  <form onSubmit={async e=>{e.preventDefault();const d=new FormData(e.currentTarget),resource=String(d.get('resource_id')??'');setCheck(await onCheck({action:String(d.get('action')),resource_kind:String(d.get('resource_kind')),...(resource?{resource_id:resource}:{})}))}}>
   <h4>Comprobar mi acceso efectivo</h4><p>Comprueba tu sesión actual, no simula la identidad del usuario mostrado.</p>
   <p><label>Acción a comprobar <select name="action">{actions.map(a=><option key={a}>{a}</option>)}</select></label></p>
   <p><label>Tipo de recurso a comprobar <input name="resource_kind" maxLength={80} pattern="[A-Za-z][A-Za-z0-9_.-]*" required /></label></p>
   <p><label>Recurso a comprobar <input name="resource_id" minLength={36} maxLength={36} /></label></p>
   <button type="submit">Comprobar permiso en servidor</button>
  </form>
  {check!==null&&<p role="status">{check?'Permitido por el servidor.':'Denegado por el servidor.'}</p>}
 </section>
}
