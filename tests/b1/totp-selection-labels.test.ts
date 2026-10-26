import test from 'node:test'
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { selectTotpMethod, prepareSessionLabels } from '../../lib/b1/ceremony-preparation.ts'
import { AuthError } from '../../lib/b1/service.ts'
const A='abcdef01-0000-4000-8000-000000000001', B='abcdef02-0000-4000-8000-000000000002', E='abcdef03-0000-4000-8000-000000000003'
const methods=[{id:A,kind:'TOTP' as const,version:'3'},{id:B,kind:'TOTP' as const,version:'4'}]
const status=(n:number)=>(error:unknown)=>error instanceof AuthError&&error.status===n
test('explicit selector is a UUID locator, never a client version/risk/identity object',()=>{
 assert.deepEqual(selectTotpMethod(methods,A),methods[0])
 assert.deepEqual(selectTotpMethod(methods,B.toUpperCase()),methods[1])
 for(const selector of ['bad',null,{method_id:A,methodVersion:'999',riskClass:'OPERATIONAL'},[A],A+','+B]){
  assert.throws(()=>selectTotpMethod(methods,selector),status(400))
 }
})
test('ambiguous selection uses safe 409; no implicit preference or EMAIL fallback',()=>{
 assert.throws(()=>selectTotpMethod(methods),(e:unknown)=>e instanceof AuthError&&e.status===409&&e.code==='TOTP_SELECTION_REQUIRED')
 assert.deepEqual(selectTotpMethod([methods[0],{id:E,kind:'EMAIL_OTP',version:'1'}]),methods[0])
 assert.throws(()=>selectTotpMethod([{id:E,kind:'EMAIL_OTP',version:'1'}]),status(401))
 assert.throws(()=>selectTotpMethod(methods,E),status(401))
})
test('revoked, foreign and stale locators are indistinguishable; malformed/duplicate trusted sets reject',()=>{
 for(const current of [[],[methods[1]]])assert.throws(()=>selectTotpMethod(current,A),status(401))
 for(const duplicate of [
  [methods[0],methods[0]],
  [methods[0],{...methods[0],id:A.toUpperCase()}],
  [methods[0],{...methods[0],kind:'EMAIL_OTP' as const}],
 ])assert.throws(()=>selectTotpMethod(duplicate,A),status(503))
 for(const version of ['0','01','9223372036854775808'])assert.throws(()=>selectTotpMethod([{...methods[0],version}],A),status(503))
})
test('selection is immutable and always reads generation from the current trusted set',()=>{
 const server=[{...methods[0]}]
 const first=selectTotpMethod(server,A)
 server[0].version='4'
 assert.equal(first.version,'3');assert.ok(Object.isFrozen(first))
 assert.equal(selectTotpMethod(server,A).version,'4')
})
test('private labels normalize NFC/space separators and count PostgreSQL characters without truncation',()=>{
 const input={device:'  Ordinateur\u00a0 portable  ',browser:' Cafe\u0301 '},labels=prepareSessionLabels(input)
 assert.equal(labels.device,'Ordinateur portable');assert.equal(labels.browser,'Café')
 assert.deepEqual(input,{device:'  Ordinateur\u00a0 portable  ',browser:' Cafe\u0301 '})
 const boundary=prepareSessionLabels({device:'😀'.repeat(120),browser:'Browser'})
 assert.equal([...boundary.device].length,120)
 assert.throws(()=>prepareSessionLabels({device:'x'.repeat(121),browser:'Browser'}),status(503))
 assert.ok(Object.isFrozen(labels))
 assert.equal(prepareSessionLabels(labels).device,labels.device)
})
test('missing, malformed, control/bidi and raw-header objects fail closed without reflecting values',()=>{
 for(const input of [undefined,null,{},[],{device:'Device'},{device:'',browser:'Browser'},{device:'Device',browser:7},
  {device:'Device',browser:'Browser',userAgent:'raw-ua-canary'},
  ...['\r','\n','\t','\0','\u202e','\u200b'].map(c=>({device:'private-canary'+c,browser:'Browser'}))]){
  assert.throws(()=>prepareSessionLabels(input),(e:unknown)=>status(503)(e)&&!(e as Error).message.includes('private-canary'))
 }
})
test('private labels redact default JSON/inspection/spread while explicit persistence remains available',()=>{
 const labels=prepareSessionLabels({device:'Private device',browser:'Private browser'})
 assert.equal(JSON.stringify(labels),'"[REDACTED_PRIVATE_CEREMONY]"')
 assert.equal(inspect(labels),'[REDACTED_PRIVATE_CEREMONY]')
 assert.deepEqual({...labels},{})
 assert.equal(labels.device,'Private device');assert.equal(labels.browser,'Private browser')
})
