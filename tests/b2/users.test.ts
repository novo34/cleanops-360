import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthHandler, names, digest, type Backend, type Binding, type Transaction } from '../../lib/b1/service.ts'
import { createV4IdentityRepository } from '../../lib/b1/v4-broker.ts'
import { readAdministrationUsers } from '../../lib/b2/users.ts'

const id='11111111-1111-4111-8111-111111111111', tenant='22222222-2222-4222-8222-222222222222'
const csrf='C'.repeat(43), cookie='S'.repeat(43), now=Date.now()
const actor:Binding={kind:'ACTIVE',id,tenantId:tenant,userId:id,sessionId:id,csrfDigest:digest(csrf),expiresAt:now+60000}
const user={id,display_name:'Synthetic user',state:'ACTIVE',risk_class:'SENSITIVE',created_at:'2026-10-20T12:00:00Z'}
const page={items:[user],next_after:null}
function backend(result:unknown=page, commitFailure=false){
 let calls=0
 const value:Backend={bootstrap:async()=>{},async transaction(work){
  const tx={resolve:async()=>actor,authorize:async()=>true,rateLimit:async()=>null,execute:async()=>{calls++;return {data:result}}} as unknown as Transaction
  const response=await work(tx);if(commitFailure)throw Error('private connection diagnostic');return response
 }}
 return {value,calls:()=>calls}
}
function request(query=''){return new Request('https://cleanops.test/auth/users'+query,{headers:{Cookie:`${names.session}=${cookie}; ${names.csrf}=${csrf}`}})}
test('B2 strict HTTP validation rejects tenant/actor claims, unknown/duplicate query and invalid bounds before the backend',async()=>{
 const b=backend(),handler=createAuthHandler(b.value,'https://cleanops.test')
 for(const query of ['?tenant_id='+tenant,'?user_id='+id,'?state=ADMIN','?search=a&search=b','?limit=51','?limit=0','?after=invalid','?search='+'x'.repeat(121)]){
  const response=await handler.handle(request(query),'listAdministrationUsers');assert.equal(response.status,400,query)
 }
 assert.equal(b.calls(),0)
})
test('B2 successful directory read has no cookies and is only returned after commit; commit failures do not leak diagnostics',async()=>{
 const b=backend(),handler=createAuthHandler(b.value,'https://cleanops.test')
 const response=await handler.handle(request('?search=Synthetic&state=ACTIVE&limit=1'),'listAdministrationUsers')
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null)
 assert.deepEqual((await response.json()).data,page)
 const failed=await createAuthHandler(backend(page,true).value,'https://cleanops.test').handle(request(),'listAdministrationUsers')
 assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private connection'))
})
test('B2 output validation rejects secret fields and session transitions do not occur in the real reader',async()=>{
 const response=await createAuthHandler(backend({items:[{...user,principal_id:id}],next_after:null}).value,'https://cleanops.test').handle(request(),'listAdministrationUsers')
 assert.equal(response.status,503)
 const calls:{sql:string;values:unknown[]}[]=[]
 const repository=createV4IdentityRepository({async connect(){return {async query(sql,values=[]){calls.push({sql,values});return {rows:[{value:page}]}},release(){}}}})
 await repository.transaction(async broker=>{
  const result=await readAdministrationUsers(broker,'listAdministrationUsers',{search:"a'); DROP TABLE app.users;--",state:'ACTIVE',limit:1},actor,id)
  assert.deepEqual(result,{data:page})
 })
 const sql=calls.find(c=>c.sql.includes('administration_users'))!
 assert.equal(sql.sql,'SELECT auth_api.administration_users($1::text,$2::text,$3::uuid,$4::integer) AS value')
 assert.deepEqual(sql.values,["a'); DROP TABLE app.users;--",'ACTIVE',null,1]);assert.equal(calls.at(-1)?.sql,'COMMIT')
})
test('B2 detail validates the organization against the trusted binding; foreign or malformed output rolls back',async()=>{
 let released:unknown
 const calls:string[]=[]
 const repository=createV4IdentityRepository({async connect(){return {async query(sql){calls.push(sql);return {rows:[{value:{user,organization:{id,name:'Foreign organization'}}}]}},release(discard){released=discard}}}})
 await assert.rejects(repository.transaction(broker=>readAdministrationUsers(broker,'getAdministrationUser',{target_user_id:id},actor,id)),{code:'INVALID_BACKEND_RESPONSE'})
 assert.equal(calls.at(-1),'ROLLBACK');assert.equal(released,true)
 await assert.rejects(repository.transaction(broker=>readAdministrationUsers(broker,'listAdministrationUsers',{}, {...actor,kind:'PREAUTH'},id)),{status:401})
})
test('B2 resume reads only the current active session without issuing a cookie or accepting a foreign identity or extended lifetime',async()=>{
 const active={state:'ACTIVE',session_id:id,tenant_id:tenant,absolute_expires_at:new Date(now+30000).toISOString()}
 const resumed=()=>new Request('https://cleanops.test/auth/users/session',{headers:request().headers})
 const response=await createAuthHandler(backend(active).value,'https://cleanops.test').handle(resumed(),'getAdministrationSession')
 assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null)
 for(const invalid of [{...active,tenant_id:id},{...active,session_id:tenant},{...active,absolute_expires_at:new Date(now+120000).toISOString()},{...active,absolute_expires_at:new Date(now-1000).toISOString()}]){
  const rejected=await createAuthHandler(backend(invalid).value,'https://cleanops.test').handle(resumed(),'getAdministrationSession')
  assert.equal(rejected.status,503);assert.equal(rejected.headers.get('set-cookie'),null)
 }
})
test('a schema-valid detail for another user in the same tenant is rejected, while UUID casing is equivalent',async()=>{
 let result={user:{...user,id:tenant},organization:{id:tenant,name:'Synthetic organization'}}
 const repository=createV4IdentityRepository({async connect(){return {async query(){return {rows:[{value:result}]}},release(){}}}})
 await assert.rejects(repository.transaction(broker=>readAdministrationUsers(broker,'getAdministrationUser',{target_user_id:id},actor,id)),{code:'INVALID_BACKEND_RESPONSE'})
 const same='abcdef01-2345-4678-8abc-def012345678'
 result={...result,user:{...user,id:same}}
 const effect=await repository.transaction(broker=>readAdministrationUsers(broker,'getAdministrationUser',{target_user_id:same.toUpperCase()},actor,id))
 assert.deepEqual(effect,{data:result})
})
