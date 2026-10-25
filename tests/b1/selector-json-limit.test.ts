import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSelectorJson } from '../../lib/b1/selector-json.ts'
import { validateTotpMethodLimit, eligibleTotpMethods } from '../../lib/b1/ceremony-preparation.ts'
import { AuthError } from '../../lib/b1/service.ts'
const id='11111111-1111-4111-8111-111111111111'
test('native JSON grammar plus scan rejects duplicate decoded keys at every object scope',()=>{
 for(const text of [
  '{"totp_method_id":"a","totp_method_id":"b"}',
  '{"totp_method_id":"a","totp_method_\\u0069d":"b"}',
  '{"nested":{"x":1,"x":2}}','{"list":[{"x":1,"x":2}]}',
  '{"a":1,"a":1}','{"x":1,}','{"unterminated":"x}',
 ]){
  assert.throws(()=>parseSelectorJson(text),(e:unknown)=>e instanceof AuthError&&e.status===400&&e.code==='INVALID_JSON')
 }
 for(const value of [
  {totp_method_id:id,grant_id:'B1-SELF-05'},
  {text:'":,{[escaped]}\\',nested:{text:'different'},list:[{x:1},{x:2}]},
  {empty:{},array:[],number:-1.5e30,boolean:true,nothing:null},
 ])assert.deepEqual(parseSelectorJson(JSON.stringify(value)),value)
 assert.deepEqual(parseSelectorJson('{"x":1,"nested":{"x":2}}'),{x:1,nested:{x:2}})
})
test('eligible-method limit is explicit integer configuration with a derived resource ceiling',()=>{
 for(const value of [undefined,null,0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,'4']){
  assert.throws(()=>validateTotpMethodLimit(value),(e:unknown)=>e instanceof AuthError&&e.status===503)
 }
 assert.equal(validateTotpMethodLimit(1),1);assert.equal(validateTotpMethodLimit(4),4)
 const methods=[{id,kind:'TOTP' as const,version:'3'},{id:'22222222-2222-4222-8222-222222222222',kind:'TOTP' as const,version:'4'}]
 assert.equal(eligibleTotpMethods(methods,2).length,2)
 assert.throws(()=>eligibleTotpMethods(methods,1))
 assert.throws(()=>eligibleTotpMethods(methods,undefined))
})
