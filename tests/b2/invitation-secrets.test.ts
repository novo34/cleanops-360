import {test} from 'node:test'
import assert from 'node:assert/strict'
import {inspect} from 'node:util'
import {randomBytes} from 'node:crypto'
import {prepareInvitationSecret,invitationVerifier,matchesInvitationVerifier,sealInvitationMail,openInvitationMail,invitationPolicy} from '../../lib/b2/invitation-secrets.ts'

const binding={tenantId:'00000000-0000-4000-8000-000000000001',invitationId:'00000000-0000-4000-8000-000000000002',generation:'1',recipient:'synthetic@example.invalid'}
const mail={...binding,outboxId:'00000000-0000-4000-8000-000000000003'}

test('invitation secrets have 256-bit entropy, protected projection and context-bound verifiers',()=>{
 const first=prepareInvitationSecret(binding),second=prepareInvitationSecret(binding)
 assert.equal(Buffer.from(first.token,'base64url').length,32);assert.notEqual(first.token,second.token)
 assert.equal(first.verifier.length,32);assert.equal(JSON.parse(JSON.stringify(first)),'[REDACTED_PRIVATE_CEREMONY]')
 assert.ok(!inspect(first).includes(first.token));assert.ok(matchesInvitationVerifier(first.token,binding,first.verifier))
 for(const changed of [{...binding,generation:'2'},{...binding,recipient:'other@example.invalid'},{...binding,tenantId:mail.outboxId},{...binding,invitationId:mail.outboxId}]){
  assert.equal(matchesInvitationVerifier(first.token,changed,first.verifier),false)
 }
 assert.equal(matchesInvitationVerifier(second.token,binding,first.verifier),false)
 assert.equal(matchesInvitationVerifier(first.token,binding,Buffer.alloc(31)),false)
 assert.equal(matchesInvitationVerifier('a'.repeat(42)+'b',binding,first.verifier),false)
 assert.throws(()=>invitationVerifier(first.token,{...binding,generation:'0'}))
})

test('dedicated invitation mail accepts the approved 24-hour link, binds all AAD and redacts plaintext',()=>{
 const key=randomBytes(32),secret=prepareInvitationSecret(binding),issuedAt=1000000
 const input={recipient:binding.recipient,invitationId:binding.invitationId,token:secret.token,issuedAt,expiresAt:issuedAt+86400000}
 const ciphertext=sealInvitationMail(input,key,'synthetic-key-v1',mail)
 const result=openInvitationMail(ciphertext,key,'synthetic-key-v1',mail,issuedAt+1)
 assert.equal(result.token,secret.token);assert.equal(result.expiresAt,input.expiresAt)
 assert.equal(JSON.parse(JSON.stringify(result)),'[REDACTED_PRIVATE_CEREMONY]');assert.ok(!inspect(result).includes(secret.token))
 assert.equal(ciphertext.includes(Buffer.from(secret.token)),false)
 for(const changed of [{...mail,generation:'2'},{...mail,outboxId:binding.invitationId},{...mail,recipient:'foreign@example.invalid'},{...mail,tenantId:binding.invitationId}]){
  assert.throws(()=>openInvitationMail(ciphertext,key,'synthetic-key-v1',changed,issuedAt+1))
 }
 assert.throws(()=>openInvitationMail(ciphertext,key,'synthetic-key-v2',mail,issuedAt+1))
 assert.throws(()=>openInvitationMail(ciphertext,randomBytes(32),'synthetic-key-v1',mail,issuedAt+1))
 assert.throws(()=>openInvitationMail(ciphertext,key,'synthetic-key-v1',mail,input.expiresAt))
 assert.throws(()=>openInvitationMail(ciphertext,key,'synthetic-key-v1',mail,issuedAt-1))
 const tampered=Buffer.from(ciphertext);tampered[20]^=1
 assert.throws(()=>openInvitationMail(tampered,key,'synthetic-key-v1',mail,issuedAt+1))
 assert.throws(()=>sealInvitationMail({...input,expiresAt:input.expiresAt+1},key,'synthetic-key-v1',mail))
 assert.throws(()=>sealInvitationMail({...input,token:'123456'},key,'synthetic-key-v1',mail))
 key.fill(0)
})

test('approved invitation limits remain separate from B1 session and OTP lifetimes',()=>{
 assert.equal(invitationPolicy.linkDefaultSeconds,86400)
 assert.equal(invitationPolicy.capabilitySeconds,600)
 assert.equal(invitationPolicy.mfaFreshSeconds,300)
 assert.equal(invitationPolicy.attempts,5)
 assert.ok(Object.isFrozen(invitationPolicy))
})
