import test from 'node:test'
import assert from 'node:assert/strict'
import {createInvitationAcceptance,invitationCapabilityDigest,type AcceptanceDependencies} from '../../lib/b2/invitation-acceptance.ts'
import {AuthError} from '../../lib/b1/service.ts'
import {Secret,TOTP} from 'otpauth'
import {verify} from 'argon2'

const token=Buffer.alloc(32,7).toString('base64url')
const deps:AcceptanceDependencies={passwordAdmission:async()=>false,dummyPasswordHash:'unavailable',transport:()=>({network:Buffer.alloc(32),device:Buffer.alloc(32)}),enrollment:{async withWriteKey(){throw Error('unexpected custody')},async withReadKey(){throw Error('unexpected custody')},async accountAlias(){throw Error('unexpected custody')}}}
test('invitation capability digest is purpose separated and rejects noncanonical values',()=>{
 assert.notDeepEqual(invitationCapabilityDigest(token,'CAPABILITY'),invitationCapabilityDigest(token,'CSRF'))
 assert.throws(()=>invitationCapabilityDigest('a'.repeat(42)+'b','CAPABILITY'),AuthError)
})
test('acceptance consumes only the invitation capability in one B1 transaction; no issuer call exists',async()=>{
 const calls:string[]=[]
 const acceptance=createInvitationAcceptance({async connect(){return {async query(sql){calls.push(sql);return {rows:[{value:true}]}},release(){}}}},deps)
 assert.deepEqual(await acceptance.accept(token,token),{state:'ACCEPTED'})
 assert.equal(calls[0],'BEGIN ISOLATION LEVEL READ COMMITTED');assert.equal(calls.at(-1),'COMMIT')
 assert.equal(calls.length,3);assert.ok(calls[1].startsWith('SELECT auth_api.consume_invitation_acceptance('))
})
test('unknown factor commits a generic denial without a B1 session and malformed input never connects',async()=>{
 let connections=0
 const acceptance=createInvitationAcceptance({async connect(){connections++;return {async query(){return {rows:[{value:null}]}},release(){}}}},deps)
 assert.ok(await acceptance.factor(token,token,'123456') instanceof AuthError)
 assert.equal(connections,1)
 assert.ok(await acceptance.prepare('foreign','invalid','password',token) instanceof AuthError)
 assert.equal(connections,1)
})

test('new invitee chooses a real Argon2 credential and proves B1-encrypted SHA256 TOTP before consume',async()=>{
 const id='11111111-1111-4111-8111-111111111111',now=Date.now(),key=Buffer.alloc(32,19)
 const scope={tenant_id:id,invitation_id:id,generation:'1',recipient:'synthetic@fixture.invalid',principal_id:null,credential_version:null,password_hash:null,user_id:id,acceptance_id:id,policy_version:'1',risk_class:'SENSITIVE',mfa_required:true,expires_at:new Date(now+3600000).toISOString()}
 let payload:Record<string,unknown>={},counter:number|null=null
 const calls:string[]=[]
 const ceremony=createInvitationAcceptance({async connect(){return {async query(sql,values=[]){
  calls.push(sql)
  if(sql.includes('invitation_link_material'))return {rows:[{value:scope}]}
  if(sql.includes('prepare_invitation_acceptance')){payload=JSON.parse(String(values[0]));return {rows:[{value:true}]}}
  if(sql.includes('invitation_factor_material')){const method=payload.method as Record<string,string>;return {rows:[{value:{tenant_id:id,user_id:id,acceptance_id:id,method_id:method.id,generation:'1',policy_version:'1',expires_at:payload.expires_at,ciphertext:method.ciphertext,key_version:method.key_version,last_counter:null}}]}}
  if(sql.includes('invitation_factor_cas')){assert.equal(values[4],null);counter=Number(values[5]);return {rows:[{value:true}]}}
  return {rows:[{value:true}]}
 },release(){}}}}, {...deps,now:()=>now,passwordAdmission:async()=>true,enrollment:{async withWriteKey(_tenant,work){return work(key,'synthetic-key')},async withReadKey(_tenant,_version,work){return work(key)},async accountAlias(){return 'synthetic-invitee'}}})
 const prepared=await ceremony.prepare(id,token,'Synthetic password chosen by invitee 123!',token)
 assert.ok(!(prepared instanceof AuthError))
 assert.equal(prepared.data.state,'MFA_REQUIRED')
 assert.ok(await verify(String(payload.replacement_hash),'Synthetic password chosen by invitee 123!'))
 assert.equal(payload.expected_hash,null)
 const uri=new URL(prepared.data.provisioning_uri!)
 const totp=new TOTP({secret:Secret.fromBase32(uri.searchParams.get('secret')!),algorithm:'SHA256',digits:6,period:30})
 assert.deepEqual(await ceremony.factor(prepared.capability.token,token,totp.generate({timestamp:now})),{state:'READY'})
 assert.equal(counter,Math.floor(now/30000))
 assert.deepEqual(await ceremony.accept(prepared.capability.token,token),{state:'ACCEPTED'})
 assert.equal(calls.filter(c=>c==='COMMIT').length,3)
 assert.ok(!calls.some(c=>/issue_session|new_preauth|begin_verified_context/.test(c)))
 key.fill(0)
})
