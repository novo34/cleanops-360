import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto'
import {AuthError,body} from '../b1/service.ts'
import {valid} from '../b1/contracts.ts'
import {parseSelectorJson} from '../b1/selector-json.ts'
import {invitationCookieNames as names,type createInvitationAcceptance} from './invitation-acceptance.ts'

type Ceremony=ReturnType<typeof createInvitationAcceptance>
const pattern=/^[A-Za-z0-9_-]{43}$/
const cookie=(name:string,value:string,age:number,httpOnly=true)=>`${name}=${value}; Path=/; Secure; SameSite=Strict; Max-Age=${age}${httpOnly?'; HttpOnly':''}`
/** Separate invitation capability; never resolves or issues a B1 binding/session. */
export function createInvitationAcceptanceHandler(ceremony:Ceremony,publicOrigin:string){
 const origin=new URL(publicOrigin).origin
 if(!origin.startsWith('https://'))throw new Error('HTTPS_REQUIRED')
 return async(request:Request):Promise<Response>=>{
  const correlation=randomUUID(),headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Cookie','Referrer-Policy':'no-referrer'})
  const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers})
  try{
   const url=new URL(request.url)
   const operation=({'/auth/invitations/prepare':'PREPARE','/auth/invitations/factor':'FACTOR','/auth/invitations/accept':'ACCEPT'} as Record<string,string>)[url.pathname]
   if(url.origin!==origin||!operation||url.search||request.method!=='POST')throw new AuthError(400,'INVALID_ROUTE')
   if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')!=='same-origin')throw new AuthError(403,'AUTH_FORBIDDEN')
   if(request.headers.has('content-encoding')||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))throw new AuthError(415,'JSON_REQUIRED')
   const parsed=parseSelectorJson(new TextDecoder('utf-8',{fatal:true}).decode(await body(request))) as Record<string,unknown>
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.hasOwn(parsed,'operation'))throw new AuthError(422,'INVALID_INPUT')
   const input:Record<string,unknown>={...parsed,operation}
   if(operation==='ACCEPT'&&!/^[A-Za-z0-9._:-]{8,128}$/.test(request.headers.get('idempotency-key')??''))throw new AuthError(400,'INVALID_REQUEST')
   const keys=Object.keys(input).sort().join(',')
   if(input.operation==='PREPARE'){
    if(keys!=='invitation_id,operation,password,token'||!valid({type:'string',format:'uuid'},input.invitation_id)||typeof input.token!=='string'||!pattern.test(input.token)||typeof input.password!=='string'||input.password.length>1024)throw new AuthError(422,'INVALID_INPUT')
    const csrf=randomBytes(32).toString('base64url')
    const result=await ceremony.prepare(String(input.invitation_id),input.token,input.password,csrf,correlation)
    if(result instanceof AuthError)throw result
    const age=Math.max(0,Math.min(600,Math.floor((result.capability.expiresAt-Date.now())/1000)))
    headers.append('Set-Cookie',cookie(names.capability,result.capability.token,age))
    headers.append('Set-Cookie',cookie(names.csrf,result.capability.csrf,age,false))
    return respond({data:result.data,correlation_id:correlation})
   }
   if(!((input.operation==='FACTOR'&&keys==='operation,proof'&&typeof input.proof==='string'&&/^[0-9]{6}$/.test(input.proof))||(input.operation==='ACCEPT'&&keys==='operation')))throw new AuthError(422,'INVALID_INPUT')
   const cookies=new Map<string,string>()
   for(const part of (request.headers.get('cookie')??'').split(';')){
    const [name,...parts]=part.trim().split('=')
    if(name===names.capability||name===names.csrf){if(cookies.has(name))throw new AuthError(403,'AUTH_FORBIDDEN');cookies.set(name,parts.join('='))}
   }
   const cap=cookies.get(names.capability)??'',csrf=cookies.get(names.csrf)??'',proof=request.headers.get('x-csrf-token')??''
   if(![cap,csrf,proof].every(v=>pattern.test(v))||!timingSafeEqual(Buffer.from(csrf),Buffer.from(proof)))throw new AuthError(403,'AUTH_FORBIDDEN')
   const result=input.operation==='FACTOR'?await ceremony.factor(cap,csrf,String(input.proof),correlation):await ceremony.accept(cap,csrf,correlation)
   if(result instanceof AuthError)throw result
   if(result.state==='ACCEPTED'){headers.append('Set-Cookie',cookie(names.capability,'',0));headers.append('Set-Cookie',cookie(names.csrf,'',0,false))}
   return respond({data:result,correlation_id:correlation})
  }catch(error){
   const status=error instanceof AuthError?error.status:503
   return respond({error:{code:status===503?'AUTH_DEPENDENCY_UNAVAILABLE':status===401?'INVITATION_INVALID':'INVALID_REQUEST',message:'No se pudo completar la invitación.',details:[]},correlation_id:correlation},status)
  }
 }
}
