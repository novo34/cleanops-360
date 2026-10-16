import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { valid, type Schema } from '../../lib/b1/contracts.ts'
const read=(path:string)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8')
const root='docs/proposals/b1-totp-selection/'
const patch=JSON.parse(read(root+'review-only.openapi-patch.json')) as {op:string;path:string;value:unknown}[]
const schema=(name:string)=>patch.find(p=>p.path==='/components/schemas/'+name)!.value as Schema
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002'
test('candidate selector accepts only opaque locator/grant/resource, never client authority',()=>{
 const input=schema('TotpMethodSelectionInput')
 assert.ok(valid(input,{totp_method_id:A}))
 assert.ok(valid(input,{totp_method_id:A,grant_id:'B1-SELF-08',resource_id:B}))
 for(const bad of [
  {},{totp_method_id:'bad'},{totp_method_id:[A,B]},{totp_method_id:A,grant_id:'B1-SELF-08'},
  {totp_method_id:A,resource_id:B},
  ...['tenantId','userId','methodVersion','riskClass','state','methods'].map(k=>({totp_method_id:A,[k]:'client-authority'})),
 ])assert.equal(valid(input,bad),false)
})
test('candidate selection response projects only own opaque IDs/kind/expiry; duplicates/secrets reject',()=>{
 const output=schema('TotpSelectionRequired')
 const base={state:'TOTP_SELECTION_REQUIRED',methods:[{method_id:A,kind:'TOTP'},{method_id:B,kind:'TOTP'}],expires_at:'2030-01-01T00:00:00.000Z'}
 assert.ok(valid(output,base))
 assert.equal(valid(output,{...base,methods:[base.methods[0],base.methods[0]]}),false)
 for(const key of ['recipient','secret_ciphertext','key_version','riskClass','methodVersion','provisioningUri'])
  assert.equal(valid(output,{...base,[key]:'secret-canary'}),false)
})
test('approved patch is scoped: 14 operations and no widening of AuthResult',()=>{
 assert.equal(patch.length,5)
 assert.deepEqual(patch.map(p=>p.path),[
  '/components/schemas/TotpMethodSelectionInput','/components/schemas/TotpSelectionRequired',
  '/components/schemas/loginResponse/properties/data','/components/schemas/startStepUpResponse/properties/data',
  '/paths/~1auth~1mfa~1totp~1select',
 ])
 const current=JSON.parse(read('lib/b1/openapi.json'))
 assert.equal(Object.values(current.paths).flatMap(v=>Object.values(v as object)).length,14)
 assert.deepEqual(current.components.schemas.TotpSelectionRequired,schema('TotpSelectionRequired'))
 assert.equal(current.paths['/auth/mfa/totp/select'].post.operationId,'selectTotpMethod')
 assert.deepEqual(current.components.schemas.AuthResult.oneOf.map((r:{$ref:string})=>r.$ref),['Active','PendingMfa','EnrollmentRequired','TenantSelection'].map(n=>'#/components/schemas/'+n))
 for(const path of ['lib/b1/runtime.ts','lib/b1/service.ts','lib/b1/approved-backend.ts'])
  assert.ok(!read(path).includes('review-only.openapi-patch'),path)
 assert.match(read('lib/b1/runtime.ts'),/closedBackend/)
 assert.match(read(root+'REVIEW.md'),/PROPOSED_REQUIRES_OWNER_APPROVAL/)
})
test('effective OpenAPI is exactly the approved delta; original canonical HTTP remains unchanged',()=>{
 const originals={
  'docs/canonical/auth-review/v4/HTTP_CONTRACT.md':'259c7b839eeec9a466b506693422c9e448d976ee',
 }
 const current=JSON.parse(read('lib/b1/openapi.json'))
 const baseline=structuredClone(current)
 delete baseline.paths['/auth/mfa/totp/select']
 delete baseline.components.schemas.TotpMethodSelectionInput
 delete baseline.components.schemas.TotpSelectionRequired
 baseline.components.schemas.loginResponse.properties.data={$ref:'#/components/schemas/AuthResult'}
 baseline.components.schemas.startStepUpResponse.properties.data={$ref:'#/components/schemas/StepUpResult'}
 const text=JSON.stringify(baseline,null,2)+'\n'
 assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex'),'9860177ab7fb665a237a16f8ff9e2c07b7417616')
 assert.equal(read('docs/canonical/auth-review/v4/h1-h3-totp-selection.openapi-patch.json'),read(root+'review-only.openapi-patch.json'))
 assert.match(read('docs/canonical/auth-review/v4/H1_H3_APPROVAL.md'),/limited owner approval/)
 for(const [path,expected] of Object.entries(originals)){
  const text=read(path)
  assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex'),expected)
 }
})
