import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contract, valid, operations, type Schema } from '../../lib/b1/contracts.ts'
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
 const caseId='abcdefab-cdef-4abc-8abc-abcdefabcdef'
 const detail={id:caseId,...company,version:'1',contacts:[],contacts_next_after:null,can_edit:false}
 assert.deepEqual(await crmRecord(broker(detail),'getCrmCompany',{company_id:caseId.toUpperCase()},binding,id),{data:detail})
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

test('maximum contract-valid contacts remain readable one at a time inside B1 envelope and PostgreSQL spacing budget',async()=>{
 const schema=contract.components.schemas
 const text=(n:number)=>'😀'.repeat(n)
 const maximal={...contact,name:text(160),email:text(250)+'@a.b',data_source:text(200),source_url:'https://'+text(2040),communication_basis:text(500),privacy_request_status:text(120),roles:['BAULEITER','PROJEKTLEITER','FACILITY_MANAGER','OBJEKTLEITER','EINKAUF','BAUMANAGEMENT','ADMINISTRATION','MANAGEMENT'],first_seen_at:'2026-10-28T12:34:56.123456789Z',last_verified_at:'2026-10-28T12:34:56.123456789Z',retention_review_at:'2026-10-28T12:34:56.123456789Z'}
 assert.equal(valid(schema.CRMContactFields,maximal),true)
 const values=Array.from({length:100},(_,i)=>({...maximal,id:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,do_not_contact_at:'2026-10-28T12:34:56.123456+00:00',can_suppress:false}))
 assert.ok(Buffer.byteLength(JSON.stringify(values))>16384)
 for(let i=0;i<values.length;i++){
  const data={id,name:text(160),city:text(120),sector:text(120),relation:'PROSPECT',version:'9999999999999999',can_edit:true,contacts:[values[i]],contacts_next_after:i===99?null:values[i].id}
  const envelope={data,meta:{correlation_id:id}}
  assert.equal(valid(schema.CRMDetailResponse,envelope),true)
  // PostgreSQL jsonb adds spaces after separators; reserve 512 bytes beyond wire JSON.
  assert.ok(Buffer.byteLength(JSON.stringify(envelope))+512<=16384)
  const log:unknown[]=[]
  await crmRecord(broker(data,log),'getCrmCompany',{company_id:id,...(i?{contacts_after:values[i-1].id}:{})},binding,id)
  assert.deepEqual(log,[['crmCompany',[id,i?values[i-1].id:null]]])
 }
 for(const fill of ['"','\\','😀'])assert.equal(valid(schema.CRMContactFields,{...maximal,name:fill.repeat(160)}),true)
 for(const bad of [{...maximal,name:'\u0000'}, {...maximal,name:'\ud800'}, {...maximal,first_seen_at:'2026-10-28T12:34:56.'+'1'.repeat(100)+'Z'}])assert.equal(valid(schema.CRMContactFields,bad),false)
 const summary={id,name:text(160),city:text(120),sector:text(120),relation:'PROSPECT',contact_name:text(160),contact_count:100}
 const list={data:{items:Array.from({length:5},()=>summary),next_after:id},meta:{correlation_id:id}}
 assert.equal(valid(schema.CRMPageResponse,list),true)
 assert.ok(Buffer.byteLength(JSON.stringify(list))+512<=16384)
})
test('SQL candidate validates before writes, audits semantic denials and uses canonical specialized capability without edit implication',()=>{
 const sql=readFileSync(new URL('../../docs/proposals/crm-01/schema.review.sql',import.meta.url),'utf8')
 const baseline=readFileSync(new URL('../../docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql',import.meta.url),'utf8')
 assert.ok(sql.indexOf('identity_private.crm_contact_fields_valid(payload')<sql.indexOf('INSERT INTO app.access_resources'))
 assert.match(sql,/payload-required_keys<>'\{\}'::jsonb/)
 assert.match(sql,/count\(DISTINCT value\)/)
 assert.match(sql,/EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow/)
 assert.match(sql,/binding_authorization\(NULL,'contacts.suppress',contact_id\)/)
 assert.match(sql,/RETURN identity_private.crm_denied\(op,'POLICY_DENIED',corr\)/)
 assert.match(sql,/'before',before_safe,'after',after_safe/)
 assert.match(sql,/'roles',before_contact.fields->'roles'/)
 assert.match(sql,/'changed_fields'/)
 assert.doesNotMatch(sql,/jsonb_build_object\('contact',before_contact.fields\)/)
 assert.doesNotMatch(sql,/INSERT INTO app\.(access_rules|self_service_rules)/)
 assert.match(baseline,/rule_key NOT IN\('B1-SELF-01'/)
 assert.doesNotMatch(baseline,/contacts.suppress/)
})


test('all response schema upper bounds include UTF-8, JSON escaping, JSONB separators, cursor and meta without lifting B1 limit',()=>{
 function bound(s:Schema):number {
  if(s.$ref)return bound(contract.components.schemas[s.$ref.split('/').at(-1)!])
  if(s.oneOf)return Math.max(...s.oneOf.map(bound))
  if(s.enum)return Math.max(...s.enum.map(v=>Buffer.byteLength(JSON.stringify(v))))
  if(s.type==='object')return 2+Object.entries(s.properties??{}).reduce((n,[k,v])=>n+Buffer.byteLength(JSON.stringify(k))+4+bound(v),0)
  if(s.type==='array')return 2+(s.maxItems??0)*(bound(s.items!)+2)
  if(s.type==='boolean')return 5
  if(s.type==='null')return 4
  if(s.type==='integer')return String(s.maximum).length
  if(s.format==='uuid')return 38
  if(s.format==='date-time')return 2+s.maxLength!
  if(s.pattern==='^[1-9][0-9]{0,15}$')return 2+s.maxLength!
  assert.ok(s.pattern?.includes('ud800'),'all free text must exclude unpaired surrogates and control escapes')
  return 2+4*s.maxLength!
 }
 for(const schema of ['CRMDetailResponse','CRMPageResponse'])assert.ok(bound(contract.components.schemas[schema])<=16384,schema)
})
