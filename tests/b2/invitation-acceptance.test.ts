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
 assert.deepEqual(await acceptance.accept(token,token,'synthetic-acceptance-key'),{state:'ACCEPTED'})
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

test('existing identity cannot substitute enrollment for its previous factors or change credentials',async()=>{
 const id='11111111-1111-4111-8111-111111111111',calls:string[]=[]
 const ceremony=createInvitationAcceptance({async connect(){return {async query(sql){calls.push(sql);return {rows:[{value:{tenant_id:id,invitation_id:id,generation:'1',recipient:'synthetic@fixture.invalid',principal_id:id,credential_version:'1',password_hash:'$argon2id$synthetic',user_id:id,acceptance_id:id,policy_version:'1',risk_class:'SENSITIVE',mfa_required:true,expires_at:new Date(Date.now()+600000).toISOString()}}]}},release(){}}}},deps)
 const result=await ceremony.prepare(id,token,'synthetic password',token)
 assert.ok(result instanceof AuthError&&result.status===503)
 assert.equal(calls.length,3);assert.equal(calls.at(-1),'COMMIT')
 assert.ok(!calls.some(c=>/rehash|prepare_invitation|issue_session/.test(c)))
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
 assert.deepEqual(await ceremony.accept(prepared.capability.token,token,'synthetic-acceptance-key'),{state:'ACCEPTED'})
 assert.equal(calls.filter(c=>c==='COMMIT').length,3)
 assert.ok(!calls.some(c=>/issue_session|new_preauth|begin_verified_context/.test(c)))
 key.fill(0)
})

test('ACCEPT malformed capability, CSRF or correlation never opens a transaction',async()=>{
 let connections=0
 const ceremony=createInvitationAcceptance({async connect(){connections++;throw Error('unexpected connection')}},deps)
 for(const args of [['invalid',token,'11111111-1111-4111-8111-111111111111'],[token,'invalid','11111111-1111-4111-8111-111111111111'],[token,token,'00000000-0000-0000-0000-000000000000']] as const){
  const result=await ceremony.accept(args[0],args[1],'synthetic-acceptance-key',args[2])
  assert.ok(result instanceof AuthError&&result.status===401)
 }
 assert.equal(connections,0)
})

test('SQL false is a committed generic ACCEPT denial, never a successful acceptance',async()=>{
 const calls:string[]=[],releases:boolean[]=[]
 const ceremony=createInvitationAcceptance({async connect(){return {async query(sql){calls.push(sql);return {rows:[{value:false}]}},release(discard){releases.push(Boolean(discard))}}}},deps)
 const result=await ceremony.accept(token,token,'synthetic-acceptance-key')
 assert.ok(result instanceof AuthError&&result.status===401)
 assert.equal(calls.length,3);assert.equal(calls.at(-1),'COMMIT');assert.deepEqual(releases,[false])
})

test('ACCEPT SQL or COMMIT failures roll back, discard the connection and expose only 503',async()=>{
 for(const failedAt of ['consume_invitation_acceptance','COMMIT']){
  const calls:string[]=[],releases:boolean[]=[]
  const ceremony=createInvitationAcceptance({async connect(){return {async query(sql){calls.push(sql);if(failedAt==='COMMIT'?sql==='COMMIT':sql.includes(failedAt))throw Error('private database diagnostic');return {rows:[{value:true}]}},release(discard){releases.push(Boolean(discard))}}}},deps)
  await assert.rejects(ceremony.accept(token,token,'synthetic-acceptance-key'),error=>error instanceof AuthError&&error.status===503&&!error.message.includes('private database diagnostic'))
  assert.equal(calls.at(-1),'ROLLBACK');assert.deepEqual(releases,[true])
  assert.equal(calls.filter(sql=>sql.includes('consume_invitation_acceptance')).length,1)
 }
})

test('malformed SQL ACCEPT results roll back instead of being interpreted as truthy success',async()=>{
 for(const value of ['true',null,{},1]){
  const calls:string[]=[],releases:boolean[]=[]
  const ceremony=createInvitationAcceptance({async connect(){return {async query(sql){calls.push(sql);return {rows:[{value}]}},release(discard){releases.push(Boolean(discard))}}}},deps)
  await assert.rejects(ceremony.accept(token,token,'synthetic-acceptance-key'),error=>error instanceof AuthError&&error.status===503)
  assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.includes('COMMIT'));assert.deepEqual(releases,[true])
 }
})

test('failure to release after committed ACCEPT fails closed without attempting another consume',async()=>{
 const calls:string[]=[]
 const ceremony=createInvitationAcceptance({async connect(){return {async query(sql){calls.push(sql);return {rows:[{value:true}]}},release(){throw Error('private pool diagnostic')}}}},deps)
 await assert.rejects(ceremony.accept(token,token,'synthetic-acceptance-key'),error=>error instanceof AuthError&&error.status===503&&!error.message.includes('private pool diagnostic'))
 assert.equal(calls.at(-1),'COMMIT');assert.ok(!calls.includes('ROLLBACK'))
 assert.equal(calls.filter(sql=>sql.includes('consume_invitation_acceptance')).length,1)
})

test('ACCEPT passes a domain-separated key digest on its existing transaction',async()=>{
 const keys:Buffer[]=[]
 const ceremony=createInvitationAcceptance({async connect(){return {async query(sql,values=[]){if(sql.includes('consume_invitation_acceptance')){assert.equal(values.length,4);keys.push(Buffer.from(values[2] as Buffer));}return {rows:[{value:true}]}},release(){}}}},deps)
 await ceremony.accept(token,token,'synthetic-acceptance-key')
 await ceremony.accept(token,token,'synthetic-acceptance-key')
 await ceremony.accept(token,token,'another-acceptance-key')
 assert.equal(keys[0].length,32);assert.deepEqual(keys[0],keys[1]);assert.notDeepEqual(keys[0],keys[2])
 // This verifies transport, not database replay/concurrency semantics.
})

test('ACCEPT rejects malformed keys without connecting and preserves broker conflict rollback',async()=>{
 let connections=0
 const calls:string[]=[]
 const ceremony=createInvitationAcceptance({async connect(){connections++;return {async query(sql){calls.push(sql);if(sql.includes('consume_invitation_acceptance'))throw {code:'P0001',message:'IDEMPOTENCY_MISMATCH'};return {rows:[]}},release(){}}}},deps)
 const invalid=await ceremony.accept(token,token,'short')
 assert.ok(invalid instanceof AuthError&&invalid.status===400);assert.equal(connections,0)
 await assert.rejects(ceremony.accept(token,token,'synthetic-acceptance-key'),error=>error instanceof AuthError&&error.status===409)
 assert.equal(calls.at(-1),'ROLLBACK')
})
