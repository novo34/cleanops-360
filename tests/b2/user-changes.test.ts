import test from 'node:test'
import assert from 'node:assert/strict'
import {createAuthHandler,names,digest,type Backend,type Binding,type Transaction,type Effect} from '../../lib/b1/service.ts'
import {createV4IdentityRepository} from '../../lib/b1/v4-broker.ts'
import {changeUser} from '../../lib/b2/user-changes.ts'

const actor='11111111-1111-4111-8111-111111111111',peer='22222222-2222-4222-8222-222222222222',origin='https://cleanops.test',csrf='e'.repeat(43)
const binding:Binding={kind:'ACTIVE',id:actor,userId:actor,sessionId:actor,tenantId:actor,csrfDigest:digest(csrf),expiresAt:Date.now()+120000}
const version='a'.repeat(64), nextVersion='b'.repeat(64)
const input={operation:'STATE',target_user_id:actor,expected_version:version,reason:'Synthetic state change',state:'DISABLED'}
const data={changed:true,user:{id:actor,display_name:'Synthetic user',state:'DISABLED',risk_class:'SENSITIVE',created_at:'2026-10-20T12:00:00Z'},resource_version:nextVersion,session_ended:true}
function request(body:unknown=input){return new Request(origin+'/auth/users/change',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json','x-csrf-token':csrf,'idempotency-key':'synthetic-user-change',cookie:`${names.session}=${'c'.repeat(43)}; ${names.csrf}=${csrf}`},body:JSON.stringify(body)})}
test('user changes reject tenant/role/risk assertions and duplicate JSON selectors before any dependency',async()=>{
 let calls=0
 const backend:Backend={async bootstrap(){},async transaction(){calls++;throw Error('must not connect')}}
 const handler=createAuthHandler(backend,origin)
 for(const extra of [{tenant_id:peer},{actor_id:peer},{risk_class:'OPERATIONAL'},{can_edit:true},{operation:'CREATE'}])assert.equal((await handler.handle(request({...input,...extra}),'changeAdministrationUser')).status,422)
 const duplicated=new Request(request().url,{method:'POST',headers:request().headers,body:JSON.stringify(input).replace('"STATE"','"STATE","operation":"EDIT"')})
 assert.equal((await handler.handle(duplicated,'changeAdministrationUser')).status,400);assert.equal(calls,0)
})
test('self-disable clears cookies only after committed success and completes an owned one-time marker without response plaintext',async()=>{
 const calls:string[]=[]
 function backend(commitFailure=false):Backend{return {async bootstrap(){},async transaction(work){
  const value=await work({resolve:async()=>binding,rateLimit:async()=>null,reserve:async()=>({replay:false}),execute:async()=>({data,clearSession:true}),complete:async(_scope:string,_hash:string,payload:unknown,oneTime:boolean)=>{assert.equal(payload,null);assert.equal(oneTime,true);calls.push('complete')}} as unknown as Transaction)
  if(commitFailure)throw Error('private commit diagnostic');calls.push('commit');return value
 }}}
 const response=await createAuthHandler(backend(),origin).handle(request(),'changeAdministrationUser')
 assert.equal(response.status,200);assert.deepEqual(calls,['complete','commit']);assert.ok(response.headers.getSetCookie().every(cookie=>cookie.includes('Max-Age=0')));assert.ok(response.headers.getSetCookie().length>0)
 const uncertain=await createAuthHandler(backend(true),origin).handle(request(),'changeAdministrationUser')
 assert.equal(uncertain.status,503);assert.equal(uncertain.headers.get('set-cookie'),null);assert.ok(!(await uncertain.text()).includes('private commit'))
})
test('a user change response cannot clear another user session or emit a new token',async()=>{
 const backend:Backend={async bootstrap(){},async transaction(work){return work({resolve:async()=>binding,rateLimit:async()=>null,reserve:async()=>({replay:false}),execute:async()=>({data:{...data,user:{...data.user,id:peer}},clearSession:true})} as unknown as Transaction)}}
 const response=await createAuthHandler(backend,origin).handle(request({...input,target_user_id:peer}),'changeAdministrationUser')
 assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null)
})
test('the private adapter uses a fixed owned function, preserves the bound name and never chooses a target tenant',async()=>{
 const malicious="Name'); UPDATE app.users SET state='ACTIVE';--",calls:{sql:string;args:unknown[]}[]=[]
 const result={...data,user:{...data.user,id:peer,display_name:malicious,state:'ACTIVE'},session_ended:false}
 const repository=createV4IdentityRepository({async connect(){return {async query(sql,args=[]){calls.push({sql,args});return {rows:[{value:result}]}},release(){}}}})
 const edit={operation:'EDIT',target_user_id:peer,expected_version:version,reason:'Synthetic edit',display_name:malicious}
 const effect=await repository.transaction(broker=>changeUser(broker,edit,binding,actor,Buffer.alloc(32,1),Buffer.alloc(32,2)))
 assert.deepEqual(effect,{data:result} satisfies Effect)
 assert.equal(calls[1].sql,'SELECT auth_api.change_user_owned($1::jsonb,$2::bytea,$3::bytea,$4::uuid) AS value')
 assert.deepEqual(JSON.parse(String(calls[1].args[0])),edit);assert.equal(calls.at(-1)?.sql,'COMMIT')
})
test('a principal NOWAIT collision rolls back the whole unit and only the exact B2 message maps to a safe conflict',async()=>{
 for(const [message,status] of [['USER_CHANGE_BUSY',409],['unrelated lock detail',503]] as const){
  const calls:string[]=[];let discarded=false
  const repository=createV4IdentityRepository({async connect(){return {async query(sql){calls.push(sql);if(sql.includes('change_user_owned'))throw Object.assign(new Error(message),{code:'55P03'});return {rows:[]}},release(discard){discarded=Boolean(discard)}}}})
  await assert.rejects(repository.transaction(broker=>broker.call('changeUserOwned',['{}',Buffer.alloc(32),Buffer.alloc(32),actor])),{status})
  assert.equal(calls.at(-1),'ROLLBACK');assert.equal(discarded,true)
 }
})
