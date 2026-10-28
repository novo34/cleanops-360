import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contract, valid, operations } from '../../lib/b1/contracts.ts'
import { createAuthHandler, names, digest, type Backend, type Binding, type Transaction } from '../../lib/b1/service.ts'
import { crmRecord } from '../../lib/crm/records.ts'
import type { V4Broker } from '../../lib/b1/v4-broker.ts'
import { handleAuth } from '../../lib/b1/runtime.ts'
const id='11111111-1111-4111-8111-111111111111',tenant='22222222-2222-4222-8222-222222222222'
const csrf='C'.repeat(43),session='S'.repeat(43)
const binding:Binding={kind:'ACTIVE',id,userId:id,tenantId:tenant,csrfDigest:digest(csrf),expiresAt:Date.now()+60000,absoluteExpiresAt:Date.now()+60000}
const company={name:'Empresa sintética',city:'Genève',sector:'Oficinas',relation:'PROSPECT'}
const contact={name:'Contacto sintético',email:'contact@example.invalid',roles:['FACILITY_MANAGER'],data_source:'Introducción manual',source_url:null,first_seen_at:'2026-10-28T12:00:00Z',last_verified_at:null,communication_basis:null,do_not_contact:true,privacy_request_status:null,retention_review_at:null}
const change={operation:'CREATE_CONTACT',company_id:id,expected_version:'1',reason:'Alta sintética',contact}
const owned={key:Buffer.alloc(32),request:Buffer.alloc(32)}
const broker=(value:unknown,log:unknown[]=[])=>({call:async(...args:unknown[])=>{log.push(args);return value}} as unknown as V4Broker)
test('strict company/contact contract rejects authority, unsupported roles, incomplete compliance and stale token shapes',()=>{
 assert.equal(valid(contract.components.schemas.CRMChangeInput,change),true)
 assert.equal(valid(contract.components.schemas.CRMChangeInput,{operation:'CREATE_COMPANY',company}),true)
 for(const bad of [{...change,tenant_id:tenant},{...change,actor:id},{...change,expected_version:'0'},{...change,contact:{...contact,roles:['Owner']}},{...change,contact:{...contact,roles:[]}},{...change,contact:{...contact,email:'invalid'}},{...change,contact:{...contact,data_source:' '}},{...change,contact:{...contact,source_url:'javascript:alert(1)'}},{...change,contact:{...contact,first_seen_at:undefined}}])assert.equal(valid(contract.components.schemas.CRMChangeInput,bad),false)
})
test('adapter refuses PREAUTH and invalid input before broker effects',async()=>{
 const log:unknown[]=[]
 await assert.rejects(crmRecord(broker(null,log),'changeCrmRecord',change,{...binding,kind:'PREAUTH'},id,owned),{code:'AUTH_INVALID'})
 await assert.rejects(crmRecord(broker(null,log),'changeCrmRecord',{...change,role:'admin'},binding,id,owned),{code:'INVALID_INPUT'})
 await assert.rejects(crmRecord(broker(null,log),'changeCrmRecord',change,binding,id),{code:'AUTH_DEPENDENCY_UNAVAILABLE'})
 assert.deepEqual(log,[])
})
test('shared directory is one tenant-resolved call, clients is a filter and no caller authority is forwarded',async()=>{
 const log:unknown[]=[]
 await crmRecord(broker({items:[],next_after:null},log),'listCrmCompanies',{search:'contact',clients_only:'true'},binding,id)
 assert.deepEqual(log,[['crmCompanies',['contact',true,null]]])
})
test('safe conflict is returned without a false success; malformed/foreign backend responses fail closed',async()=>{
 const detail={id,...company,version:'1',contacts:[],can_edit:false}
 assert.deepEqual(await crmRecord(broker(detail),'getCrmCompany',{company_id:id.toUpperCase()},binding,id),{data:detail})
 const result=await crmRecord(broker({error:'CRM_CONFLICT'}),'changeCrmRecord',change,binding,id,owned)
 assert.equal('code' in result&&result.code,'CRM_CONFLICT')
 await assert.rejects(crmRecord(broker({id:tenant,version:'2'}),'changeCrmRecord',change,binding,id,owned),{code:'INVALID_BACKEND_RESPONSE'})
 await assert.rejects(crmRecord(broker({error:'SQL secret'}),'changeCrmRecord',change,binding,id,owned),{code:'INVALID_BACKEND_RESPONSE'})
})
function backend(commitFailure=false){let effects=0;const b:Backend={bootstrap:async()=>{},transaction:async work=>{
 const tx={resolve:async()=>binding,renewActivity:async()=>binding.expiresAt,rateLimit:async()=>null,reserve:async()=>({replay:false}),discard:async()=>{},complete:async()=>{},execute:async()=>{effects++;return {data:{id,version:'1'}}}} as unknown as Transaction
 const result=await work(tx);if(commitFailure)throw Error('PRIVATE_COMMIT_DIAGNOSTIC');return result
 }};return {b,effects:()=>effects}}
function mutation(payload:unknown,token=csrf){return new Request('https://cleanops.test/auth/crm/change',{method:'POST',headers:{origin:'https://cleanops.test','sec-fetch-site':'same-origin','content-type':'application/json','x-csrf-token':token,'idempotency-key':id,cookie:`${names.session}=${session}; ${names.csrf}=${csrf}`},body:JSON.stringify(payload)})}
test('real HTTP ingress rejects client authority and invalid contact without executing mutations',async()=>{
 const {b,effects}=backend();const handler=createAuthHandler(b,'https://cleanops.test')
 for(const bad of [{...change,tenant_id:tenant},{...change,contact:{...contact,roles:[]}}])assert.equal((await handler.handle(mutation(bad),'changeCrmRecord')).status,422)
 assert.equal(effects(),0)
})
test('HTTP does not acknowledge a failed transaction and does not disclose diagnostics',async()=>{
 const {b,effects}=backend(true);const result=await createAuthHandler(b,'https://cleanops.test').handle(mutation({operation:'CREATE_COMPANY',company}),'changeCrmRecord')
 assert.equal(effects(),1);assert.equal(result.status,503);assert.equal((await result.text()).includes('PRIVATE_COMMIT_DIAGNOSTIC'),false)
})
test('runtime remains closed for every CRM operation',async()=>{
 for(const op of operations.filter(o=>o.operationId.includes('Crm'))){const result=await handleAuth(new Request('https://cleanops.test'+op.path),op.operationId);assert.equal(result.status,503);assert.equal(result.headers.get('set-cookie'),null)}
})
test('candidate is outside migration allowlist; module boundary denies and does not invent ALLOW grants',()=>{
 const sql=readFileSync(new URL('../../docs/proposals/crm-01/schema.review.sql',import.meta.url),'utf8')
 assert.match(sql,/crm_module_guard\(\)[\s\S]*RAISE EXCEPTION 'ACCESS_DENIED'/)
 assert.doesNotMatch(sql,/INSERT INTO app.access_rules/)
 assert.doesNotMatch(readFileSync(new URL('../../scripts/trusted-migrations.mjs',import.meta.url),'utf8'),/crm/)
})
