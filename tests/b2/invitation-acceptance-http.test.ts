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
