import {randomUUID} from 'node:crypto'
import {contract,valid} from '../b1/contracts.ts'
import {AuthError,type Input,type Binding,type Effect} from '../b1/service.ts'
import type {V4Broker} from '../b1/v4-broker.ts'
import {prepareInvitationSecret,sealInvitationMail,invitationPolicy} from './invitation-secrets.ts'

export type InvitationMailCustody=Readonly<{withWriteKey<T>(tenant:string,work:(key:Buffer,version:string)=>T):Promise<T>}>
const unavailable=()=>new AuthError(503,'AUTH_DEPENDENCY_UNAVAILABLE')
const object=(value:unknown):value is Input=>!!value&&typeof value==='object'&&!Array.isArray(value)
function active(binding:Binding){if(binding.kind!=='ACTIVE'||!binding.tenantId||!binding.userId)throw new AuthError(401,'AUTH_INVALID')}

/** Same B1 broker, transaction and owned journal. No table access or permission engine. */
export async function changeInvitation(broker:V4Broker,input:Input,binding:Binding,correlation:string,key:Buffer,request:Buffer,
 deps:{mail?:InvitationMailCustody;normalizeEmail:(value:string)=>string}):Promise<Effect|AuthError>{
 active(binding)
 if(!valid(contract.components.schemas.B2InvitationChangeInput,input))throw new AuthError(422,'INVALID_INPUT')
 if(!Buffer.isBuffer(key)||key.length!==32||!Buffer.isBuffer(request)||request.length!==32)throw unavailable()
 if(input.operation!=='REVOKE'&&!deps.mail)throw unavailable()
 const payload={...input,...(input.operation==='CREATE'?{email:deps.normalizeEmail(String(input.email))}:{})}
 if(!valid(contract.components.schemas.B2InvitationChangeInput,payload))throw new AuthError(422,'INVALID_INPUT')
 const candidate=input.operation==='CREATE'?randomUUID():String(input.invitation_id).toLowerCase()
 const material=await broker.call('invitationDraftOwned',[JSON.stringify(payload),candidate,key,request,correlation])
 if(!object(material))throw unavailable()
 if(Object.keys(material).length===1&&typeof material.error==='string'){
  const codes:Record<string,number>={INVALID_INPUT:422,POLICY_DENIED:403,STEP_UP_REQUIRED:403,NOT_FOUND:404,INVITATION_CONFLICT:409,RATE_LIMITED:429,AUTH_DEPENDENCY_UNAVAILABLE:503}
  if(!codes[material.error])throw unavailable()
  return new AuthError(codes[material.error],material.error,material.error==='RATE_LIMITED'?60:undefined)
 }
 if(Object.keys(material).length===1&&material.accepted===true)return {data:{accepted:true}}
 if(input.operation==='REVOKE'||Object.keys(material).sort().join(',')!=='expires_at,generation,invitation_id,issued_at,outbox_id,recipient,tenant_id'||
  String(material.tenant_id).toLowerCase()!==binding.tenantId!.toLowerCase()||String(material.invitation_id).toLowerCase()!==candidate)throw unavailable()
 const issuedAt=Date.parse(String(material.issued_at)),expiresAt=Date.parse(String(material.expires_at))
 if(!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(expiresAt)||issuedAt<0||expiresAt<=issuedAt||expiresAt-issuedAt>invitationPolicy.linkMaximumSeconds*1000)throw unavailable()
 const context={tenantId:binding.tenantId!,invitationId:candidate,generation:String(material.generation),recipient:String(material.recipient),outboxId:String(material.outbox_id)}
 if(input.operation==='CREATE'&&context.recipient!==payload.email)throw unavailable()
 const secret=prepareInvitationSecret(context)
 let ciphertext:Buffer|undefined
 try{
  const sealed=await deps.mail!.withWriteKey(context.tenantId,(writeKey,version)=>({ciphertext:sealInvitationMail({recipient:context.recipient,invitationId:candidate,token:secret.token,issuedAt,expiresAt},writeKey,version,context),version}))
  ciphertext=sealed.ciphertext
  if(!await broker.call('invitationPublishOwned',[candidate,context.generation,context.outboxId,secret.verifier,ciphertext,sealed.version,key,request,correlation]))throw unavailable()
  return {data:{accepted:true}}
 }finally{secret.verifier.fill(0);ciphertext?.fill(0)}
}

export async function readInvitations(broker:V4Broker,input:Input,binding:Binding,correlation:string):Promise<Effect>{
 active(binding)
 const data=await broker.call('administrationInvitations',[input.after===undefined?null:String(input.after)])
 if(!valid(contract.components.schemas.B2InvitationPageResponse,{data,meta:{correlation_id:correlation}}))throw unavailable()
 return {data}
}
