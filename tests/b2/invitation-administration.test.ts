import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {AuthError,createAuthHandler,names,digest,type Backend,type Binding,type Transaction} from '../../lib/b1/service.ts'
import {createV4IdentityRepository} from '../../lib/b1/v4-broker.ts'
import {changeInvitation} from '../../lib/b2/invitation-administration.ts'
import {openInvitationMail,matchesInvitationVerifier} from '../../lib/b2/invitation-secrets.ts'

const id='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222',origin='https://cleanops.test',csrf='e'.repeat(43)
const bindingExpiry=Date.now()+60000
const binding:Binding={kind:'ACTIVE',id,tenantId:id,userId:id,sessionId:id,absoluteExpiresAt:bindingExpiry,expiresAt:bindingExpiry,csrfDigest:digest(csrf)}
const input={operation:'CREATE',display_name:'Synthetic invitee',email:'synthetic@example.invalid',reason:'Synthetic invitation'}
function request(body:unknown=input){return new Request(origin+'/auth/users/invitations',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json','x-csrf-token':csrf,'idempotency-key':'synthetic-invitation-request',cookie:`${names.session}=${'a'.repeat(43)}; ${names.csrf}=${csrf}`},body:JSON.stringify(body)})}

test('invitation HTTP rejects asserted identities, roles, MFA/TTL and duplicate selectors before connecting',async()=>{
 let connections=0
 const backend:Backend={async bootstrap(){},async transaction(){connections++;throw Error('must not connect')}}
 const handler=createAuthHandler(backend,origin)
 for(const extra of [{tenant_id:foreign},{principal_id:foreign},{role_id:id},{mfa_verified:true},{expires_at:'2030-01-01T00:00:00Z'},{link_seconds:86400}]){
  assert.equal((await handler.handle(request({...input,...extra}),'changeUserInvitation')).status,422)
 }
 const duplicated=new Request(request().url,{method:'POST',headers:request().headers,body:JSON.stringify(input).replace('"CREATE"','"CREATE","operation":"REVOKE"')})
 assert.equal((await handler.handle(duplicated,'changeUserInvitation')).status,400)
 assert.equal(connections,0)
})

test('invitation mutations complete one-time ownership only after success and refresh but never rotate or clear a B1 session',async()=>{
 function backend(failCommit=false,transition=false):Backend{return {async bootstrap(){},async transaction(work){
  const result=await work({renewActivity:async(binding: {expiresAt:number})=>binding.expiresAt,resolve:async()=>binding,rateLimit:async()=>null,reserve:async()=>({replay:false}),execute:async()=>({data:{accepted:true},...(transition?{clearSession:true}:{})}),complete:async(_scope:string,_hash:string,data:unknown,oneTime:boolean)=>{assert.equal(data,null);assert.equal(oneTime,true)}} as unknown as Transaction)
  if(failCommit)throw Error('private commit diagnostic');return result
 }}}
 const response=await createAuthHandler(backend(),origin).handle(request(),'changeUserInvitation')
 assert.equal(response.status,200);assert.equal(response.headers.getSetCookie().length,2);assert.ok(response.headers.getSetCookie().some(c=>c.startsWith(names.session+'='+'a'.repeat(43)+';')))
 assert.deepEqual((await response.json()).data,{accepted:true})
 for(const provider of [backend(true),backend(false,true)]){
  const failed=await createAuthHandler(provider,origin).handle(request(),'changeUserInvitation')
  assert.equal(failed.status,503);assert.equal(failed.headers.get('set-cookie'),null)
  assert.ok(!(await failed.text()).includes('private commit'))
 }
})

test('private invitation adapter binds SQL, verifies trusted material, seals only for outbox and returns no secret',async()=>{
 const key=randomBytes(32),calls:string[]=[];let sealed=false
 let material:Record<string,unknown>
 const repository=createV4IdentityRepository({async connect(){return {async query(sql,values=[]){
  calls.push(sql)
  if(sql.includes('invitation_draft_owned')){
   assert.deepEqual(JSON.parse(String(values[0])),input)
   const issuedAt=Date.now();material={tenant_id:id,invitation_id:values[1],generation:'1',recipient:input.email,outbox_id:foreign,issued_at:new Date(issuedAt).toISOString(),expires_at:new Date(issuedAt+86400000).toISOString()}
   return {rows:[{value:material}]}
  }
  if(sql.includes('publish_invitation_owned')){
   const context={tenantId:id,invitationId:String(material.invitation_id),generation:'1',recipient:input.email,outboxId:foreign}
   const decoded=openInvitationMail(values[4] as Buffer,key,'synthetic-write-key',context,Date.parse(String(material.issued_at)))
   assert.ok(matchesInvitationVerifier(decoded.token,context,values[3] as Buffer));sealed=true
   assert.equal(values[0],material.invitation_id);assert.equal(values[2],foreign)
   return {rows:[{value:true}]}
  }
  return {rows:[]}
 },release(){}}}})
 const result=await repository.transaction(broker=>changeInvitation(broker,input,binding,id,Buffer.alloc(32,1),Buffer.alloc(32,2),{normalizeEmail:value=>value,mail:{async withWriteKey(tenant,work){assert.equal(tenant,id);return work(key,'synthetic-write-key')}}}))
 assert.equal(sealed,true);assert.deepEqual(result,{data:{accepted:true}})
 assert.equal(calls.at(-1),'COMMIT');assert.equal(calls.filter(sql=>sql.startsWith('SELECT auth_api.')).length,2)
 assert.ok(calls.every(sql=>!sql.includes(input.email)));key.fill(0)
})

test('unavailable custody or foreign/malformed invitation material cannot publish or commit a secret',async()=>{
 let published=false
 const repository=createV4IdentityRepository({async connect(){return {async query(sql){if(sql.includes('publish_invitation'))published=true;return {rows:[{value:{tenant_id:foreign}}]}},release(){}}}})
 const args=[input,binding,id,Buffer.alloc(32),Buffer.alloc(32)] as const
 await assert.rejects(repository.transaction(broker=>changeInvitation(broker,...args,{normalizeEmail:value=>value})),{status:503})
 await assert.rejects(repository.transaction(broker=>changeInvitation(broker,...args,{normalizeEmail:value=>value,mail:{async withWriteKey(){throw Error('must not seal')}}})),{status:503})
 assert.equal(published,false)
})

for(const operation of ['RESEND','REVOKE'] as const){
 test(`private ${operation} sends the same canonical invitation UUID in the payload and SQL locator`,async()=>{
  const target='abcdef01-2345-4678-8abc-def012345678'
  for(const invitation of [target,target.toUpperCase(),'AbCdEf01-2345-4678-8AbC-dEf012345678']){
   const change=Object.freeze({operation,invitation_id:invitation,expected_version:'7',reason:'Synthetic UUID compatibility'})
   let published=0,custody=0;const calls:string[]=[]
   const repository=createV4IdentityRepository({async connect(){return {async query(sql,values=[]){
    calls.push(sql)
    if(sql.includes('invitation_draft_owned')){
     const payload=JSON.parse(String(values[0]))
     assert.equal(values[1],target)
     // SQL4 compares this JSON string with candidate::text before mutation.
     if(payload.invitation_id!==values[1])return {rows:[{value:{error:'INVALID_INPUT'}}]}
     assert.deepEqual(payload,{...change,invitation_id:target})
     if(operation==='REVOKE')return {rows:[{value:{accepted:true}}]}
     const issuedAt=Date.now()
     return {rows:[{value:{tenant_id:id,invitation_id:target,generation:'8',recipient:input.email,outbox_id:foreign,issued_at:new Date(issuedAt).toISOString(),expires_at:new Date(issuedAt+86400000).toISOString()}}]}
    }
    if(sql.includes('publish_invitation_owned')){published++;assert.equal(values[0],target);assert.equal(values[1],'8');return {rows:[{value:true}]}}
    return {rows:[]}
   },release(){}}}})
   const result=await repository.transaction(broker=>changeInvitation(broker,change,binding,id,Buffer.alloc(32,1),Buffer.alloc(32,2),{
    normalizeEmail(){throw Error('resend/revoke must not reinterpret recipient')},
    mail:{async withWriteKey(tenant,work){custody++;assert.equal(tenant,binding.tenantId);return work(Buffer.alloc(32,3),'synthetic-write-key')}},
   }))
   assert.deepEqual(result,{data:{accepted:true}})
   assert.equal(change.invitation_id,invitation)
   assert.equal(published,operation==='RESEND'?1:0);assert.equal(custody,published)
   assert.equal(calls.at(-1),'COMMIT')
  }
 })
}

test('canonical invitation locators preserve private denials without custody or publication',async()=>{
 for(const operation of ['RESEND','REVOKE'] as const){
  for(const [code,status] of [['NOT_FOUND',404],['POLICY_DENIED',403],['STEP_UP_REQUIRED',403],['INVITATION_CONFLICT',409]] as const){
   const target='abcdef01-2345-4678-8abc-def012345678',calls:string[]=[]
   const repository=createV4IdentityRepository({async connect(){return {async query(sql,values=[]){
    calls.push(sql)
    if(sql.includes('invitation_draft_owned')){
     assert.equal(JSON.parse(String(values[0])).invitation_id,target);assert.equal(values[1],target)
     return {rows:[{value:{error:code}}]}
    }
    if(sql.startsWith('SELECT auth_api.'))assert.fail('denied invitation must not publish')
    return {rows:[]}
   },release(){}}}})
   const result=await repository.transaction(broker=>changeInvitation(broker,{operation,invitation_id:target.toUpperCase(),expected_version:'7',reason:'Synthetic denied request'},binding,id,Buffer.alloc(32,1),Buffer.alloc(32,2),{
    normalizeEmail(){throw Error('must not normalize recipient')},mail:{async withWriteKey(){throw Error('denial must not acquire custody')}},
   }))
   assert.ok(result instanceof AuthError);assert.equal(result.code,code);assert.equal(result.status,status)
   assert.equal(calls.filter(sql=>sql.startsWith('SELECT auth_api.')).length,1)
   // Returned denials commit normally so SQL's durable denial audit survives.
   assert.equal(calls.at(-1),'COMMIT')
  }
 }
})
