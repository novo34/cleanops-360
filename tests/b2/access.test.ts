import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createV4IdentityRepository} from '../../lib/b1/v4-broker.ts'
import {readUserAccess} from '../../lib/b2/access.ts'
import {createAuthHandler,names,digest,type Backend,type Transaction,type Binding} from '../../lib/b1/service.ts'

const target='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222'
const binding:Binding={kind:'ACTIVE',id:actor,sessionId:actor,userId:actor,tenantId:actor,csrfDigest:digest('e'.repeat(43)),expiresAt:Date.now()+60000}
test('target-permission reads use a fixed SQL function with separate actor context and bound locators',async()=>{
 const calls:{sql:string;args:unknown[]}[]=[]
 const repository=createV4IdentityRepository({async connect(){return {async query(sql,args=[]){calls.push({sql,args});return {rows:[{value:true}]}},release(){}}}})
 const effect=await repository.transaction(broker=>readUserAccess(broker,'checkUserEffectiveAccess',{target_user_id:target,action:'view',resource_kind:'documents',resource_id:target},binding,actor))
 assert.deepEqual(effect,{data:{target_user_id:target,action:'view',resource_kind:'documents',resource_id:target,allowed:true}})
 assert.equal(calls[1].sql,'SELECT auth_api.user_effective_access($1::uuid,$2::text,$3::text,$4::uuid) AS value')
 assert.deepEqual(calls[1].args,[target,'view','documents',target]);assert.equal(calls.at(-1)?.sql,'COMMIT')
 assert.ok(!calls.some(call=>/SET ROLE|set_config|INSERT|UPDATE|DELETE/.test(call.sql)))
})
test('B2 access queries reject caller-supplied tenant, actor, role and duplicate target claims before dependencies',async()=>{
 let calls=0
 const backend:Backend={async bootstrap(){},async transaction(){calls++;throw Error('must not connect')}}
 const handler=createAuthHandler(backend,'https://cleanops.test')
 for(const suffix of ['&tenant_id='+actor,'&actor_id='+actor,'&role=SuperAdmin','&target_user_id='+actor,'&action=delete']){
  const response=await handler.handle(new Request('https://cleanops.test/auth/users/permissions/effective?target_user_id='+target+'&action=view&resource_kind=documents'+suffix),'checkUserEffectiveAccess')
  assert.equal(response.status,400)
 }
 assert.equal(calls,0)
})
test('a malformed access adapter cannot rotate or clear the current session on a read',async()=>{
 const backend:Backend={async bootstrap(){},async transaction(work){return work({resolve:async()=>binding,rateLimit:async()=>null,execute:async()=>({data:{target_user_id:target,action:'view',resource_kind:'documents',resource_id:null,allowed:true},clearSession:true})} as unknown as Transaction)}}
 const response=await createAuthHandler(backend,'https://cleanops.test').handle(new Request('https://cleanops.test/auth/users/permissions/effective?target_user_id='+target+'&action=view&resource_kind=documents',{headers:{cookie:`${names.session}=${'c'.repeat(43)}; ${names.csrf}=${'e'.repeat(43)}`}}),'checkUserEffectiveAccess')
 assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null)
})
test('review-only candidate factors the exact existing evaluator instead of introducing independent policy logic',()=>{
 const base=readFileSync('docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql','utf8')
 const candidate=readFileSync('docs/proposals/b2-access/002-effective-access.review.sql','utf8')
 const start=base.indexOf('CREATE FUNCTION auth_api.effective_access(action_name text,kind text,resource uuid) RETURNS boolean')
 const original=base.slice(start,base.indexOf('END $fn$;',start)+'END $fn$;'.length)
 const expected=original.replace('CREATE FUNCTION auth_api.effective_access(action_name text,kind text,resource uuid)','CREATE FUNCTION identity_private.evaluate_user_access(subject uuid,action_name text,kind text,resource uuid)').replaceAll('effective_access.kind','evaluate_user_access.kind').replaceAll('c.user_id','subject').replace(' c:=identity_private.context();'," c:=identity_private.context();\n IF NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND id=subject AND state='ACTIVE') THEN RETURN false;END IF;")
 assert.ok(candidate.includes(expected))
 assert.ok(candidate.includes('RETURN identity_private.evaluate_user_access(c.user_id,action_name,kind,resource);'))
 assert.ok(candidate.includes('RETURN identity_private.evaluate_user_access(target,action_name,kind,resource);'))
 assert.ok(candidate.includes('REVOKE ALL ON FUNCTION identity_private.evaluate_user_access(uuid,text,text,uuid) FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;'))
})
