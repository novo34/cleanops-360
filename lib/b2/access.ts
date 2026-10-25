import {contract,valid} from '../b1/contracts.ts'
import {AuthError,type Binding,type Input,type Effect} from '../b1/service.ts'
import type {V4Broker,AccessAction} from '../b1/v4-broker.ts'

/** A target UUID is a locator. Both queries authorize the caller in the trusted
 * tenant, then use the one shared SQL evaluator; never impersonate the target. */
export async function readUserAccess(broker:V4Broker,operation:string,input:Input,binding:Binding,correlation:string):Promise<Effect>{
 if(binding.kind!=='ACTIVE'||!binding.tenantId||!binding.userId)throw new AuthError(401,'AUTH_INVALID')
 const target=String(input.target_user_id)
 let data:unknown,schema:string
 if(operation==='checkUserEffectiveAccess'){
  const action=input.action as AccessAction,kind=String(input.resource_kind),resource=input.resource_id===undefined?null:String(input.resource_id)
  data={target_user_id:target,action,resource_kind:kind,resource_id:resource,allowed:await broker.call('userEffectiveAccess',[target,action,kind,resource])}
  schema='B2TargetPermissionResponse'
 }else if(operation==='listAssignableRoles'){
  data=await broker.call('assignableRoleCatalogue',[target,input.after===undefined?null:String(input.after)])
  schema='B2RoleCatalogueResponse'
 }else throw new AuthError(404,'NOT_FOUND')
 if(!valid(contract.components.schemas[schema],{data,meta:{correlation_id:correlation}}))throw new AuthError(503,'INVALID_BACKEND_RESPONSE')
 return {data}
}
