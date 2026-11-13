import test from 'node:test'
import assert from 'node:assert/strict'
import {createInvitationAcceptanceHandler} from '../../lib/b2/invitation-acceptance-http.ts'
import {AuthError} from '../../lib/b1/service.ts'

const origin='https://cleanops.test',token='a'.repeat(43),id='11111111-1111-4111-8111-111111111111'
function request(input:Record<string,unknown>,extra:Record<string,string>={}){const {operation,...body}=input;return new Request(origin+'/auth/invitations/'+(({PREPARE:'prepare',FACTOR:'factor',ACCEPT:'accept'} as Record<string,string>)[String(operation)]??'invalid'),{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':'synthetic-acceptance-key',...extra},body:JSON.stringify(body)})}
test('limited acceptance rejects asserted authority, cross-origin and missing CSRF before private calls',async()=>{
 let calls=0
 const ceremony={async prepare(){calls++;throw Error('unexpected')},async factor(){calls++;throw Error('unexpected')},async accept(){calls++;throw Error('unexpected')}}
 const handle=createInvitationAcceptanceHandler(ceremony,origin)
 assert.equal((await handle(request({operation:'PREPARE',invitation_id:id,token,password:'synthetic',tenant_id:id}))).status,422)
 assert.equal((await handle(request({operation:'ACCEPT'}))).status,403)
 assert.equal((await handle(request({operation:'ACCEPT'},{origin:'https://foreign.invalid'}))).status,403)
 assert.equal(calls,0)
})
test('only invitation cookies follow successful committed preparation; no B1 session or preauth',async()=>{
 const handle=createInvitationAcceptanceHandler({async prepare(){return {data:{state:'READY' as const,expires_at:new Date(Date.now()+600000).toISOString()},capability:{token,csrf:token,expiresAt:Date.now()+600000}}},async factor(){return {state:'READY' as const}},async accept(){return {state:'ACCEPTED' as const}}},origin)
 const prepared=await handle(request({operation:'PREPARE',invitation_id:id,token,password:'synthetic'}))
 assert.equal(prepared.status,200)
 const cookies=prepared.headers.get('set-cookie')??''
 assert.ok(cookies.includes('__Host-cleanops_invitation='));assert.ok(!cookies.includes('__Host-cleanops_session'));assert.ok(!cookies.includes('__Host-cleanops_preauth'))
 assert.ok(!(await prepared.text()).includes(token))
 const accepted=await handle(request({operation:'ACCEPT'},{cookie:`__Host-cleanops_invitation=${token}; __Host-cleanops_invitation_csrf=${token}`,'x-csrf-token':token}))
 assert.equal(accepted.status,200);assert.ok(accepted.headers.get('set-cookie')?.includes('Max-Age=0'))
})
test('failed preparation or commit emits no cookies and redacts private diagnostics',async()=>{
 for(const result of [new AuthError(401,'INVITATION_INVALID'),new Error('private database details')]){
  const handle=createInvitationAcceptanceHandler({async prepare(){if(result instanceof AuthError)return result;throw result},async factor(){throw result},async accept(){throw result}},origin)
  const response=await handle(request({operation:'PREPARE',invitation_id:id,token,password:'synthetic'}))
  assert.equal(response.status,result instanceof AuthError?401:503);assert.equal(response.headers.get('set-cookie'),null);assert.ok(!(await response.text()).includes('private database'))
 }
})

test('ACCEPT rejects missing or malformed keys before invoking the ceremony',async()=>{
 let calls=0
 const handle=createInvitationAcceptanceHandler({async prepare(){throw Error('unexpected')},async factor(){throw Error('unexpected')},async accept(){calls++;return {state:'ACCEPTED' as const}}},origin)
 for(const key of ['', 'short', 'contains space', 'x'.repeat(129)]){
  const response=await handle(request({operation:'ACCEPT'},{'idempotency-key':key,cookie:`__Host-cleanops_invitation=${token}; __Host-cleanops_invitation_csrf=${token}`,'x-csrf-token':token}))
  assert.equal(response.status,400);assert.equal(response.headers.get('set-cookie'),null)
 }
 assert.equal(calls,0)
})

test('ACCEPT rejects tenant selectors, duplicate cookies and mismatched CSRF before private calls',async()=>{
 let calls=0
 const handle=createInvitationAcceptanceHandler({async prepare(){throw Error('unexpected')},async factor(){throw Error('unexpected')},async accept(){calls++;return {state:'ACCEPTED' as const}}},origin)
 const headers={cookie:`__Host-cleanops_invitation=${token}; __Host-cleanops_invitation_csrf=${token}`,'x-csrf-token':token}
 assert.equal((await handle(request({operation:'ACCEPT',tenant_id:id},headers))).status,422)
 assert.equal((await handle(request({operation:'ACCEPT'},{...headers,cookie:headers.cookie+`; __Host-cleanops_invitation=${token}`}))).status,403)
 assert.equal((await handle(request({operation:'ACCEPT'},{...headers,'x-csrf-token':'b'.repeat(43)}))).status,403)
 assert.equal(calls,0)
})

test('ACCEPT denial and uncertain commit emit no cookies or private diagnostics',async()=>{
 for(const failure of [new AuthError(401,'INVITATION_INVALID'),new Error('private commit diagnostic')]){
  const handle=createInvitationAcceptanceHandler({async prepare(){throw Error('unexpected')},async factor(){throw Error('unexpected')},async accept(){if(failure instanceof AuthError)return failure;throw failure}},origin)
  const response=await handle(request({operation:'ACCEPT'},{cookie:`__Host-cleanops_invitation=${token}; __Host-cleanops_invitation_csrf=${token}`,'x-csrf-token':token}))
  assert.equal(response.status,failure instanceof AuthError?401:503)
  assert.equal(response.headers.get('set-cookie'),null)
  assert.ok(!(await response.text()).includes('private commit diagnostic'))
 }
})

test('ACCEPT preserves current 8..128 key boundaries and punctuation without changing its policy',async()=>{
 let calls=0
 const handle=createInvitationAcceptanceHandler({async prepare(){throw Error('unexpected')},async factor(){throw Error('unexpected')},async accept(){calls++;return {state:'ACCEPTED' as const}}},origin)
 const headers={cookie:`__Host-cleanops_invitation=${token}; __Host-cleanops_invitation_csrf=${token}`,'x-csrf-token':token}
 for(const key of ['a'.repeat(8),'a'.repeat(128),'a._:-b12'])assert.equal((await handle(request({operation:'ACCEPT'},{...headers,'idempotency-key':key}))).status,200)
 for(const key of ['a'.repeat(7),'a'.repeat(129),'abc defg','abcdefg\u00e9'])assert.equal((await handle(request({operation:'ACCEPT'},{...headers,'idempotency-key':key}))).status,400)
 assert.equal(calls,3)
 // This characterizes today's validator; it does not approve its normative scope.
})

test('ACCEPT maps a ceremony conflict to a generic 409 without clearing cookies or leaking diagnostics',async()=>{
 const handle=createInvitationAcceptanceHandler({async prepare(){throw Error('unexpected')},async factor(){throw Error('unexpected')},async accept(){throw new AuthError(409,'IDEMPOTENCY_MISMATCH')}},origin)
 const response=await handle(request({operation:'ACCEPT'},{cookie:`__Host-cleanops_invitation=${token}; __Host-cleanops_invitation_csrf=${token}`,'x-csrf-token':token}))
 assert.equal(response.status,409);assert.equal(response.headers.get('set-cookie'),null)
 const result=await response.json()
 assert.equal(result.error.code,'INVALID_REQUEST');assert.deepEqual(result.error.details,[])
 assert.ok(!JSON.stringify(result).includes('IDEMPOTENCY_MISMATCH'))
})

test('production ACCEPT route stays closed with 503 and never emits invitation or B1 cookies',async()=>{
 const {POST}=await import('../../app/auth/invitations/accept/route.ts')
 const response=await POST()
 assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null)
 assert.equal(response.headers.get('cache-control'),'no-store')
 assert.equal((await response.json()).error.code,'AUTH_DEPENDENCY_UNAVAILABLE')
})


test('ACCEPT forwards the exact permitted key and server correlation to the existing ceremony',async()=>{
 const received:string[][]=[]
 const handle=createInvitationAcceptanceHandler({async prepare(){throw Error('unexpected')},async factor(){throw Error('unexpected')},async accept(capability:string,csrf:string,key:string,correlation=id){received.push([capability,csrf,key,correlation]);return {state:'ACCEPTED' as const}}},origin)
 for(const key of ['a'.repeat(8),'a._:-b12']){
  const response=await handle(request({operation:'ACCEPT'},{'idempotency-key':key,cookie:`__Host-cleanops_invitation=${token}; __Host-cleanops_invitation_csrf=${token}`,'x-csrf-token':token}))
  assert.equal(response.status,200);assert.deepEqual(received.at(-1)?.slice(0,3),[token,token,key])
  assert.equal(received.at(-1)?.[3],(await response.json()).correlation_id)
 }
 assert.equal(received.length,2)
})
