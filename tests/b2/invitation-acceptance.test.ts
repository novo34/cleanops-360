import test from 'node:test'
import assert from 'node:assert/strict'
import {createInvitationAcceptance,invitationCapabilityDigest,type AcceptanceDependencies} from '../../lib/b2/invitation-acceptance.ts'
import {AuthError} from '../../lib/b1/service.ts'

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
