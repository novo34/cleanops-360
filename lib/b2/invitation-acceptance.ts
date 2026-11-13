import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {canonical,valid} from '../b1/contracts.ts'
import {AuthError} from '../b1/service.ts'
import {prepareReplacementHash,verifyPasswordFactor} from '../b1/password.ts'
import {verifyTotpFactor,type TotpRecord} from '../b1/totp.ts'
import {prepareTotpEnrollment,openEnrollmentSecret,privateArtifact} from '../b1/ceremony-preparation.ts'
import {approvedTotpEnrollmentPolicy} from '../b1/enrollment-policy.ts'
import {createV4IdentityRepository,type V4Broker} from '../b1/v4-broker.ts'
import type {IdentityPool} from '../b1/pg-identity-driver.ts'
import {invitationPolicy} from './invitation-secrets.ts'

const unavailable=()=>new AuthError(503,'AUTH_DEPENDENCY_UNAVAILABLE')
const invalid=()=>new AuthError(401,'INVITATION_INVALID')
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const uuid=(value:unknown):value is string=>valid({type:'string',format:'uuid'},value)
const generation=(value:unknown):value is string=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=BigInt('9223372036854775807')
const token=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value,'base64url').toString('base64url')===value
const secret=()=>randomBytes(32).toString('base64url')
/** Purpose-separated digests are never compatible with B1 session bindings. */
export function invitationCapabilityDigest(raw:string,kind:'CAPABILITY'|'CSRF'):Buffer{
 if(!token(raw))throw invalid()
 return createHash('sha256').update(canonical(['CLEANOPS_INVITATION_ACCEPTANCE_V1',kind,raw])).digest()
}
export const invitationCookieNames=Object.freeze({capability:'__Host-cleanops_invitation',csrf:'__Host-cleanops_invitation_csrf'})
export type AcceptanceDependencies=Readonly<{
 now?:()=>number;passwordAdmission:(password:string)=>Promise<boolean>;dummyPasswordHash:string
 transport():Readonly<{network:Buffer;device:Buffer}>
 enrollment:{
  withWriteKey<T>(tenant:string,work:(key:Buffer,version:string)=>T):Promise<T>
  withReadKey<T>(tenant:string,version:string,work:(key:Buffer)=>T):Promise<T>
  accountAlias(tenant:string,user:string):Promise<string>
 }
}>
type Material={tenant_id:string;invitation_id:string;generation:string;recipient:string;principal_id:string|null;credential_version:string|null;password_hash:string|null;user_id:string;acceptance_id:string;policy_version:string;risk_class:'SENSITIVE'|'OPERATIONAL';mfa_required:boolean;expires_at:string}
type FactorMaterial={tenant_id:string;user_id:string;acceptance_id:string;method_id:string;generation:string;policy_version:string;expires_at:string;ciphertext:string;key_version:string;last_counter:number|null}
export type Preparation={data:{state:'MFA_REQUIRED'|'READY';expires_at:string;provisioning_uri?:string};capability:{token:string;csrf:string;expiresAt:number}}

function material(value:unknown):Material|null{
 if(value===null)return null
 if(!object(value)||Object.keys(value).sort().join(',')!=='acceptance_id,credential_version,expires_at,generation,invitation_id,mfa_required,password_hash,policy_version,principal_id,recipient,risk_class,tenant_id,user_id')throw unavailable()
 for(const field of ['tenant_id','invitation_id','user_id','acceptance_id'])if(!uuid(value[field]))throw unavailable()
 if(!generation(value.generation)||!generation(value.policy_version)||!['SENSITIVE','OPERATIONAL'].includes(String(value.risk_class))||typeof value.mfa_required!=='boolean'||
  (value.risk_class==='SENSITIVE'&&!value.mfa_required)||!valid({type:'string',format:'email',maxLength:254},value.recipient)||!valid({type:'string',format:'date-time'},value.expires_at))throw unavailable()
 if(value.principal_id===null){if(value.credential_version!==null||value.password_hash!==null)throw unavailable()}
 else if(!uuid(value.principal_id)||!generation(value.credential_version)||typeof value.password_hash!=='string'||!value.password_hash.startsWith('$argon2id$'))throw unavailable()
 return privateArtifact({}, value as Material)
}
function factorMaterial(value:unknown):FactorMaterial|null{
 if(value===null)return null
 if(!object(value)||Object.keys(value).sort().join(',')!=='acceptance_id,ciphertext,expires_at,generation,key_version,last_counter,method_id,policy_version,tenant_id,user_id')throw unavailable()
 for(const field of ['tenant_id','user_id','acceptance_id','method_id'])if(!uuid(value[field]))throw unavailable()
 if(!generation(value.generation)||!generation(value.policy_version)||!valid({type:'string',format:'date-time'},value.expires_at)||
  typeof value.ciphertext!=='string'||!/^(?:[a-f0-9]{2}){29,512}$/.test(value.ciphertext)||typeof value.key_version!=='string'||!value.key_version.length||
  (value.last_counter!==null&&(!Number.isSafeInteger(value.last_counter)||Number(value.last_counter)<0)))throw unavailable()
 return privateArtifact({}, value as FactorMaterial)
}

/** Invitation-scoped acceptance only. Reuses B1 transaction and factor primitives;
 * no B1 Binding, preauth constructor, session issuer or business authorization is exposed.
 * SQL5 is a separate review artifact and MUST be approved before native execution. */
export function createInvitationAcceptance(pool:IdentityPool,deps:AcceptanceDependencies){
 const repository=createV4IdentityRepository(pool),now=deps.now??Date.now
 function transport(){const value=deps.transport();if(!value||![value.network,value.device].every(v=>Buffer.isBuffer(v)&&v.length===32))throw unavailable();return value}
 async function failed(broker:V4Broker,invitation:string,correlation:string){
  await broker.call('invitationCredentialDenied',[invitation,correlation]);return invalid()
 }
 return Object.freeze({
  async prepare(invitation:string,link:string,password:string,csrf:string,correlation=randomUUID()):Promise<Preparation|AuthError>{
   if(!uuid(invitation)||!token(link)||!token(csrf)||typeof password!=='string'||!uuid(correlation))return invalid()
   return repository.transaction(async broker=>{
    const scope=transport()
    const found=material(await broker.call('invitationLinkMaterial',[invitation,link,scope.network,scope.device,correlation]))
    if(!found){await verifyPasswordFactor(password,deps.dummyPasswordHash,async()=>true);return invalid()}
    if(found.invitation_id.toLowerCase()!==invitation.toLowerCase())throw unavailable()
    // Existing factors must be proved first; enrolling a new target-tenant factor
    // cannot replace them. Keep this path closed until its B1 proof adapter exists.
    if(found.principal_id!==null)return unavailable()
    const expires=Math.min(Date.parse(found.expires_at),now()+invitationPolicy.capabilitySeconds*1000)
    if(!Number.isSafeInteger(expires)||expires<=now())return invalid()
    const replacement=await prepareReplacementHash(password,deps.passwordAdmission)
    if(replacement instanceof AuthError)return failed(broker,invitation,correlation)
    const expected=null
    const capability=secret(),cookieDigest=invitationCapabilityDigest(capability,'CAPABILITY'),csrfDigest=invitationCapabilityDigest(csrf,'CSRF')
    let pending:ReturnType<typeof prepareTotpEnrollment>|undefined
    try{
     if(found.mfa_required){
      const label=await deps.enrollment.accountAlias(found.tenant_id,found.user_id)
      pending=await deps.enrollment.withWriteKey(found.tenant_id,(key,version)=>prepareTotpEnrollment({tenantId:found.tenant_id,userId:found.user_id,bindingId:found.acceptance_id},{...approvedTotpEnrollmentPolicy,label},key,version))
     }
     const internal={invitation_id:found.invitation_id,generation:found.generation,principal_id:found.principal_id,credential_version:found.credential_version,expected_hash:expected,replacement_hash:replacement,user_id:found.user_id,acceptance_id:found.acceptance_id,policy_version:found.policy_version,expires_at:new Date(expires).toISOString(),method:pending?{id:pending.methodId,ciphertext:pending.ciphertext.toString('hex'),key_version:pending.keyVersion,algorithm:pending.algorithm}:null}
     if(!await broker.call('prepareInvitationAcceptance',[JSON.stringify(internal),cookieDigest,csrfDigest,correlation]))return invalid()
     return privateArtifact({}, {data:{state:found.mfa_required?'MFA_REQUIRED' as const:'READY' as const,expires_at:new Date(expires).toISOString(),...(pending?{provisioning_uri:pending.provisioningUri}:{})},capability:{token:capability,csrf,expiresAt:expires}})
    }finally{cookieDigest.fill(0);csrfDigest.fill(0);pending?.ciphertext.fill(0)}
   })
  },
  async factor(capability:string,csrf:string,proof:string,correlation=randomUUID()):Promise<{state:'READY'}|AuthError>{
   if(!token(capability)||!token(csrf)||!uuid(correlation))return invalid()
   return repository.transaction(async broker=>{
    const found=factorMaterial(await broker.call('invitationFactorMaterial',[capability,csrf,correlation]))
    if(!found)return invalid()
    const binding={tenantId:found.tenant_id,userId:found.user_id,methodId:found.method_id,purpose:'INVITATION',ceremonyId:found.acceptance_id}
    const record:TotpRecord={binding,version:'1',lastCounter:found.last_counter,expiresAt:Date.parse(found.expires_at),algorithm:approvedTotpEnrollmentPolicy.algorithm}
    const verified=await verifyTotpFactor(proof,binding,{
     async readAuthorized(){return record},
     async decryptSecret(){return deps.enrollment.withReadKey(found.tenant_id,found.key_version,key=>openEnrollmentSecret(Buffer.from(found.ciphertext,'hex'),key,found.key_version,{tenantId:found.tenant_id,userId:found.user_id,methodId:found.method_id,initialMethodVersion:'1',algorithm:approvedTotpEnrollmentPolicy.algorithm}))},
     async consume(change){return broker.call('invitationFactorCas',[capability,csrf,found.generation,found.policy_version,change.expectedCounter,change.nextCounter,correlation])},
    },now)
    if(verified instanceof AuthError){await broker.call('invitationFactorDenied',[capability,csrf,correlation]);return invalid()}
    return {state:'READY' as const}
   })
  },
  async accept(capability:string,csrf:string,key:string,correlation=randomUUID()):Promise<{state:'ACCEPTED'}|AuthError>{
   if(!token(capability)||!token(csrf)||!uuid(correlation))return invalid()
   if(typeof key!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/.test(key))return new AuthError(400,'INVALID_REQUEST')
   const keyDigest=createHash('sha256').update(canonical(['CLEANOPS_INVITATION_ACCEPT_V1',key])).digest()
   try{return await repository.transaction(async broker=>await broker.call('consumeInvitationAcceptance',[capability,csrf,keyDigest,correlation])?{state:'ACCEPTED' as const}:invalid())}
   finally{keyDigest.fill(0)}
  },
 })
}
