import {operations,valid} from '../b1/contracts.ts'

export class AccessFormError extends Error {}
/** UI serialization only. B1 remains responsible for every authorization,
 * step-up, policy version, audit and persistence decision. */
export function accessChangeFromForm(operation:string,target:string,policy:string,fields:FormData,newId:()=>string=()=>crypto.randomUUID()):Record<string,unknown>{
 const text=(key:string)=>String(fields.get(key)??'').trim()
 const locator=(key:string)=>text(key).toLowerCase()
 const common={operation,expected_policy:policy,reason:text('reason')}
 function period(){
  const start=Date.parse(text('start_at')),end=text('expires_at')?Date.parse(text('expires_at')):null
  if(!Number.isFinite(start)||(end!==null&&(!Number.isFinite(end)||end<=start)))throw new AccessFormError('El fin de vigencia debe ser posterior al inicio. Revisa las fechas y horas.')
  return {start_at:new Date(start).toISOString(),expires_at:end===null?null:new Date(end).toISOString()}
 }
 let body:Record<string,unknown>
 if(operation==='ROLE')body={...common,role_id:locator('role_id')||newId(),label:text('label')}
 else if(operation==='MEMBERSHIP')body={...common,role_id:locator('role_id'),target_user_id:target,...period()}
 else if(operation==='REVOKE')body={...common,assignment_kind:text('assignment_kind'),target_id:locator('target_id'),subject_id:text('assignment_kind')==='ROLE'||fields.has('global_rule')?null:target}
 else if(operation==='USER_RULE'||operation==='ROLE_RULE')body={...common,...(operation==='USER_RULE'?{target_user_id:target}:{role_id:locator('role_id')}),rule_id:locator('rule_id')||newId(),action:text('action'),resource_kind:text('resource_kind'),resource_id:locator('resource_id')||null,effect:text('effect'),...period()}
 else throw new AccessFormError('Selecciona un tipo de cambio válido.')
 const schema=operations.find(op=>op.operationId==='changeAccess')!.requestBody!.content['application/json'].schema
 if(!valid(schema,body))throw new AccessFormError('Revisa los identificadores, el motivo y los campos del cambio de acceso.')
 return body
}
