import test from 'node:test'
import assert from 'node:assert/strict'
import {accessChangeFromForm,AccessFormError} from '../../lib/b2/access-form.ts'
const target='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',rule='cccccccc-cccc-4ccc-8ccc-cccccccccccc',policy='42'
function fields(values:Record<string,string>){const form=new FormData();for(const [key,value] of Object.entries(values))form.set(key,value);return form}
const common={reason:' Synthetic controlled change ',start_at:'2026-10-21T10:00:00+02:00',expires_at:'2026-10-21T11:00:00+02:00'}
test('temporary DENY serializes an unambiguous interval and ignores forged form tenant/actor/policy selectors',()=>{
 const body=accessChangeFromForm('USER_RULE',target,policy,fields({...common,action:'view',effect:'DENY',resource_kind:'documents',resource_id:role.toUpperCase(),tenant_id:role,target_user_id:role,expected_policy:'e'.repeat(64)}),()=>rule)
 assert.deepEqual(body,{operation:'USER_RULE',expected_policy:policy,reason:'Synthetic controlled change',target_user_id:target,rule_id:rule,action:'view',effect:'DENY',resource_kind:'documents',resource_id:role,start_at:'2026-10-21T08:00:00.000Z',expires_at:'2026-10-21T09:00:00.000Z'})
})
test('invalid, reversed and zero-duration periods are rejected before submitting a mutation',()=>{
 for(const values of [{start_at:'invalid'},{expires_at:'invalid'},{expires_at:common.start_at},{expires_at:'2026-10-21T09:00:00+02:00'}])assert.throws(()=>accessChangeFromForm('MEMBERSHIP',target,policy,fields({...common,...values,role_id:role})),AccessFormError)
})
test('a missing existing role is never silently replaced by a random role; malformed locators/actions/reasons fail closed',()=>{
 for(const values of [{role_id:''},{role_id:'bad'},{reason:'   '}])assert.throws(()=>accessChangeFromForm('MEMBERSHIP',target,policy,fields({...common,role_id:role,...values})),AccessFormError)
 assert.throws(()=>accessChangeFromForm('USER_RULE',target,policy,fields({...common,action:'administrator',effect:'ALLOW',resource_kind:'documents'}),()=>rule),AccessFormError)
 const body=accessChangeFromForm('REVOKE',target,policy,fields({reason:'Synthetic revoke',assignment_kind:'MEMBERSHIP',target_id:role}))
 assert.equal(body.subject_id,target);assert.equal(body.target_id,role)
})
