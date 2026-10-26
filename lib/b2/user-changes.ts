import {contract,valid} from '../b1/contracts.ts'
import {AuthError,type Input,type Binding,type Effect} from '../b1/service.ts'
import type {V4Broker} from '../b1/v4-broker.ts'

/** Reuses the B1 transaction/owned journal and SQL guard; no table writes, session
 * issuer or permission decisions exist in this application adapter. */
export async function changeUser(broker:V4Broker,input:Input,binding:Binding,correlation:string,key:Buffer,request:Buffer):Promise<Effect|AuthError>{
 if(binding.kind!=='ACTIVE'||!binding.tenantId||!binding.userId)throw new AuthError(401,'AUTH_INVALID')
 if(!valid(contract.components.schemas.B2UserChangeInput,input))throw new AuthError(422,'INVALID_INPUT')
 if(!Buffer.isBuffer(key)||key.length!==32||!Buffer.isBuffer(request)||request.length!==32)throw new AuthError(503,'AUTH_DEPENDENCY_UNAVAILABLE')
 const result=await broker.call('changeUserOwned',[JSON.stringify(input),key,request,correlation])
 if(!result||typeof result!=='object'||Array.isArray(result))throw new AuthError(503,'INVALID_BACKEND_RESPONSE')
 const data=result as Input
 if(data.changed===false){
  const errors:Record<string,number>={NOT_FOUND:404,POLICY_DENIED:403,STEP_UP_REQUIRED:403,USER_CHANGE_CONFLICT:409,INVALID_INPUT:422}
  if(Object.keys(data).sort().join(',')!=='changed,error'||typeof data.error!=='string'||!errors[data.error])throw new AuthError(503,'INVALID_BACKEND_RESPONSE')
  return new AuthError(errors[data.error],data.error)
 }
 if(!valid(contract.components.schemas.B2UserChangeResponse,{data,meta:{correlation_id:correlation}}))throw new AuthError(503,'INVALID_BACKEND_RESPONSE')
 const target=String(input.target_user_id).toLowerCase()
 const ended=input.operation==='STATE'&&input.state==='DISABLED'&&target===binding.userId.toLowerCase()
 if(String((data.user as Input).id).toLowerCase()!==target||data.session_ended!==ended)throw new AuthError(503,'INVALID_BACKEND_RESPONSE')
 if((input.operation==='STATE'&&(data.user as Input).state!==input.state)||(input.operation==='EDIT'&&(data.user as Input).display_name!==String(input.display_name).replace(/^ +| +$/g,'')))throw new AuthError(503,'INVALID_BACKEND_RESPONSE')
 return {data,...(ended?{clearSession:true}:{})}
}
