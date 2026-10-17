import test from 'node:test'
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { randomBytes } from 'node:crypto'
import { sealMailPayload, openMailPayload, type MailContext } from '../../lib/b1/mail-envelope.ts'
const id = (n: number) => '00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const context: MailContext = { tenantId:id(1),userId:id(2),methodId:id(3),methodVersion:'1',recipientVersion:'2',outboxId:id(4),challengeId:id(5) }
const value = { recipient:'verified@example.invalid',code:'012345',issuedAt:1000,expiresAt:301000 }
test('mail AEAD authenticates immutable context and retains old version until key retirement', () => {
 const key = randomBytes(32), other = randomBytes(32)
 const sealed = sealMailPayload(value,key,'mail-v1',context)
 const opened = openMailPayload(sealed,key,'mail-v1',context,2000)
 assert.equal(opened.recipient,value.recipient); assert.equal(opened.code,value.code)
 assert.notDeepEqual(sealMailPayload(value,key,'mail-v1',context),sealed)
 for (const field of ['tenantId','userId','methodId','outboxId','challengeId'] as const)
  assert.throws(() => openMailPayload(sealed,key,'mail-v1',{ ...context,[field]:id(9) },2000))
 for (const field of ['methodVersion','recipientVersion'] as const)
  assert.throws(() => openMailPayload(sealed,key,'mail-v1',{ ...context,[field]:'3' },2000))
 assert.throws(() => openMailPayload(sealed,key,'mail-v2',context,2000))
 assert.throws(() => openMailPayload(sealed,other,'mail-v1',context,2000))
 const corrupt = Buffer.from(sealed); corrupt[29]^=1
 assert.throws(() => openMailPayload(corrupt,key,'mail-v1',context,2000))
 assert.equal(openMailPayload(sealed,key,'mail-v1',context,2000).code,value.code)
 key.fill(0); other.fill(0)
})
test('expired/future/malformed mail rejects; secret artifact is not serializable in ordinary sinks', () => {
 const key = randomBytes(32), sealed = sealMailPayload(value,key,'mail-v1',context)
 assert.throws(() => openMailPayload(sealed,key,'mail-v1',context,999))
 assert.throws(() => openMailPayload(sealed,key,'mail-v1',context,value.expiresAt))
 assert.throws(() => sealMailPayload({ ...value,expiresAt:value.expiresAt+1 },key,'mail-v1',context))
 assert.throws(() => sealMailPayload({ ...value,recipient:'invalid' },key,'mail-v1',context))
 assert.throws(() => sealMailPayload({ ...value,code:'invalid' },key,'mail-v1',context))
 const secret = openMailPayload(sealed,key,'mail-v1',context,2000)
 for (const output of [JSON.stringify(secret),inspect(secret),JSON.stringify({ ...secret })]) {
  assert.equal(output.includes(value.recipient),false); assert.equal(output.includes(value.code),false)
 }
 key.fill(0)
})
