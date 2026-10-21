import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto'
import {canonical,valid} from '../b1/contracts.ts'
import {AuthError} from '../b1/service.ts'
import {privateArtifact} from '../b1/ceremony-preparation.ts'

/** Owner-approved invitation parameters. No session/OTP policy is changed. */
export const invitationPolicy=Object.freeze({
 linkDefaultSeconds:86400,linkMinimumSeconds:3600,linkMaximumSeconds:86400,
 capabilitySeconds:600,mfaFreshSeconds:300,attempts:5,attemptWindowSeconds:900,
 pauseSeconds:900,linkAttempts:10,originAttempts:30,resendMinimumSeconds:60,
 recipientHourlySends:3,recipientDailySends:10,actorHourlySends:20,tenantHourlySends:100,
})
export type InvitationContext=Readonly<{tenantId:string;invitationId:string;generation:string;recipient:string}>
export type InvitationMailContext=InvitationContext&Readonly<{outboxId:string}>
export type InvitationMailPayload=Readonly<{recipient:string;invitationId:string;token:string;issuedAt:number;expiresAt:number}>
const unavailable=()=>new AuthError(503,'AUTH_DEPENDENCY_UNAVAILABLE')
const tokenPattern=/^[A-Za-z0-9_-]{43}$/
function context(value:InvitationContext){
 if(!value||!valid({type:'string',format:'uuid'},value.tenantId)||!valid({type:'string',format:'uuid'},value.invitationId)||
  typeof value.generation!=='string'||!/^[1-9][0-9]{0,18}$/.test(value.generation)||BigInt(value.generation)>9223372036854775807n||
  !valid({type:'string',format:'email',maxLength:254},value.recipient))throw unavailable()
 return [value.tenantId.toLowerCase(),value.invitationId.toLowerCase(),value.generation,value.recipient]
}
function rawToken(value:string){
 if(typeof value!=='string'||!tokenPattern.test(value))throw unavailable()
 const bytes=Buffer.from(value,'base64url')
 if(bytes.length!==32||bytes.toString('base64url')!==value)throw unavailable()
 return bytes
}
/** Invitation verifier only: cannot be accepted as an OTP, B1 session or capability. */
export function invitationVerifier(value:string,binding:InvitationContext):Buffer{
 const bytes=rawToken(value)
 try{return createHash('sha256').update(canonical(['CLEANOPS_INVITATION_LINK_V1',...context(binding)])).update(bytes).digest()}
 finally{bytes.fill(0)}
}
export function matchesInvitationVerifier(value:string,binding:InvitationContext,expected:Buffer):boolean{
 let actual:Buffer|undefined
 try{
  if(!Buffer.isBuffer(expected)||expected.length!==32)return false
  actual=invitationVerifier(value,binding)
  return timingSafeEqual(actual,expected)
 }catch{return false}finally{actual?.fill(0)}
}
export function prepareInvitationSecret(binding:InvitationContext){
 const bytes=randomBytes(32)
 try{
  const value=bytes.toString('base64url'),verifier=invitationVerifier(value,binding)
  // Secret fields are non-enumerable and redacted from JSON/inspect, as in B1.
  return privateArtifact({}, {token:value,verifier})
 }finally{bytes.fill(0)}
}
function aad(binding:InvitationMailContext,version:string){
 if(!valid({type:'string',format:'uuid'},binding?.outboxId)||typeof version!=='string'||
  version.length<1||version.length>120||/[\p{Cc}\p{Cf}]/u.test(version))throw unavailable()
 return Buffer.from(canonical(['CLEANOPS_INVITATION_MAIL_V1',version,...context(binding),binding.outboxId.toLowerCase()]))
}
function payload(value:unknown,binding:InvitationMailContext):asserts value is InvitationMailPayload{
 if(!value||typeof value!=='object'||Array.isArray(value))throw unavailable()
 const item=value as Record<string,unknown>
 if(Object.keys(item).sort().join(',')!=='expiresAt,invitationId,issuedAt,recipient,token'||
  item.recipient!==binding.recipient||item.invitationId!==binding.invitationId||
  !Number.isSafeInteger(item.issuedAt)||!Number.isSafeInteger(item.expiresAt)||Number(item.issuedAt)<0||
  Number(item.expiresAt)<=Number(item.issuedAt)||Number(item.expiresAt)-Number(item.issuedAt)>invitationPolicy.linkMaximumSeconds*1000)throw unavailable()
 rawToken(item.token as string).fill(0)
}
/** Dedicated link payload. B1's numeric 5-minute OTP codec is never reused. */
export function sealInvitationMail(value:InvitationMailPayload,key:Buffer,version:string,binding:InvitationMailContext):Buffer{
 if(!Buffer.isBuffer(key)||key.length!==32)throw unavailable()
 payload(value,binding)
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce),plain=Buffer.from(canonical(value))
 try{cipher.setAAD(aad(binding,version));return Buffer.concat([nonce,cipher.update(plain),cipher.final(),cipher.getAuthTag()])}
 finally{plain.fill(0);nonce.fill(0)}
}
export function openInvitationMail(envelope:Buffer,key:Buffer,version:string,binding:InvitationMailContext,now:number):InvitationMailPayload{
 let plain:Buffer|undefined
 try{
  if(!Buffer.isBuffer(key)||key.length!==32||!Buffer.isBuffer(envelope)||envelope.length<29||envelope.length>2048||!Number.isSafeInteger(now)||now<0)throw unavailable()
  const decipher=createDecipheriv('aes-256-gcm',key,envelope.subarray(0,12))
  decipher.setAAD(aad(binding,version));decipher.setAuthTag(envelope.subarray(-16))
  plain=Buffer.concat([decipher.update(envelope.subarray(12,-16)),decipher.final()])
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain))
  payload(value,binding)
  if(now<value.issuedAt||now>=value.expiresAt)throw unavailable()
  return privateArtifact({},value)
 }catch{throw unavailable()}finally{plain?.fill(0)}
}
