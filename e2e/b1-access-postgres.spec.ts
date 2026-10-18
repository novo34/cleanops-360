import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
// @ts-expect-error Private isolated IPC test composition, not runtime.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
async function login(page:Page,server:{rpc:(body:object)=>Promise<{email:string;proof:string}>},target?:{targetEmail:string}){
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(target?.targetEmail??(await server.rpc({kind:'fixtureEmail'})).email)
 await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click()
 await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:target?'targetProof':'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
}
async function open(page:Page,user:string){await page.getByRole('button',{name:'Usuarios y permisos',exact:true}).click();await page.getByLabel('Usuario para Manage Access',{exact:true}).fill(user);await page.getByRole('button',{name:'Abrir Manage Access',exact:true}).click();await expect(page.getByRole('heading',{name:'Manage Access',exact:true})).toBeVisible()}
async function send(page:Page,body:object,key=randomUUID()){return page.evaluate(async input=>{
 const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1]
 const r=await fetch('/auth/access',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':input.key},body:JSON.stringify(input.body)})
 return {status:r.status,data:await r.json()}
},{body,key})}
async function check(page:Page,resource:string,action='view'){return (await (await page.request.get('/auth/access/effective?'+new URLSearchParams({action,resource_kind:'documents',resource_id:resource}))).json()).data.allowed}
async function finish(page:Page,server:{rpc:(body:object)=>Promise<{proof:string}>}){
 await page.getByLabel('Motivo del cambio',{exact:true}).fill('Synthetic isolated approved permission change')
 await page.getByRole('button',{name:'Guardar cambio de acceso',exact:true}).click();await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof',next:true})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click()
 await expect(page.locator('p[role="status"]').first()).toContainText('Permisos actualizados')
}
const local=(ms:number)=>new Date(ms).toISOString().slice(0,19)
test('AUTHZ real Manage Access user override DENY defeats role ALLOW in an already ACTIVE target session',async({page,browser})=>{
 const server=await startRealBrowserServer('authz'),person=await browser.newContext({ignoreHTTPSErrors:true})
 try{const f=await server.rpc({kind:'accessFixture'}),target=await person.newPage();await login(page,server);await login(target,server,f);expect(await check(target,f.resourceId)).toBe(true)
  await open(page,f.targetUser);await page.getByLabel('Identificador de regla existente',{exact:true}).fill(f.ruleId);await page.getByLabel('Tipo de recurso',{exact:true}).fill('documents');await page.getByLabel('Recurso concreto',{exact:true}).fill(f.resourceId);await page.getByLabel('Efecto',{exact:true}).selectOption('DENY');await page.getByLabel('Inicio de vigencia',{exact:true}).fill(local(Date.now()-60000));await finish(page,server)
  expect(await check(target,f.resourceId)).toBe(false);expect((await target.request.get('/auth/me')).status()).toBe(200)
  const state=await server.rpc({kind:'inspectAccess'});expect(state.rules.some((r:{id:string;effect:string})=>r.id===f.ruleId&&r.effect==='DENY')).toBe(true);expect(state.audit.some((a:{actor_recorded:boolean;outcome:string})=>a.actor_recorded&&a.outcome==='SUCCESS')).toBe(true)
 }finally{await person.close();await server.close()}
})
test('AUTHZ read-only UI cannot grant permissions through forged HTTP and cross-tenant detail is denied safely',async({page})=>{
 const server=await startRealBrowserServer('authz-readonly')
 try{const f=await server.rpc({kind:'accessFixture'});await login(page,server);await open(page,f.targetUser)
  await expect(page.getByText('Solo lectura: no tienes autorización para modificar este usuario.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Guardar cambio de acceso',exact:true})).toBeDisabled()
  const body={operation:'ROLE',role_id:randomUUID(),label:'Not an authority',expected_policy:(await server.rpc({kind:'inspectAccess'})).policy,reason:'Synthetic denied attempt'}
  expect((await send(page,body)).status).toBe(409);expect((await send(page,{...body,tenant_id:randomUUID()})).status).toBe(422)
  expect((await page.request.get('/auth/access/user?target_user_id='+f.foreignUser)).status()).toBe(403);expect((await page.request.get('/auth/me')).status()).toBe(200)
  expect(await check(page,f.foreignResource)).toBe(false);expect((await server.rpc({kind:'inspectAccess'})).audit.length).toBe(0)
 }finally{await server.close()}
})
test('AUTHZ role membership starts and expires in PostgreSQL while the target session remains ACTIVE',async({page,browser})=>{
 const server=await startRealBrowserServer('authz'),person=await browser.newContext({ignoreHTTPSErrors:true})
 try{const f=await server.rpc({kind:'accessFixture'}),target=await person.newPage();await login(page,server);await login(target,server,f);await open(page,f.targetUser)
  await page.getByLabel('Tipo de cambio',{exact:true}).selectOption('MEMBERSHIP');await page.getByLabel('Identificador del rol',{exact:true}).fill(f.roleId)
  await page.getByLabel('Inicio de vigencia',{exact:true}).fill(local(Date.now()+4000));await page.getByLabel('Fin de vigencia',{exact:true}).fill(local(Date.now()+11000));await finish(page,server)
  expect(await check(target,f.resourceId)).toBe(false);await expect.poll(()=>check(target,f.resourceId),{timeout:7000}).toBe(true);await expect.poll(()=>check(target,f.resourceId),{timeout:12000}).toBe(false)
  expect((await target.request.get('/auth/me')).status()).toBe(200)
 }finally{await person.close();await server.close()}
})
test('AUTHZ role rule edits are effective immediately and never authorize a foreign resource',async({page,browser})=>{
 const server=await startRealBrowserServer('authz'),person=await browser.newContext({ignoreHTTPSErrors:true})
 try{const f=await server.rpc({kind:'accessFixture'}),target=await person.newPage();await login(page,server);await login(target,server,f);await open(page,f.targetUser)
  await page.getByLabel('Tipo de cambio',{exact:true}).selectOption('ROLE_RULE');await page.getByLabel('Identificador del rol',{exact:true}).fill(f.roleId);await page.getByLabel('Identificador de regla existente',{exact:true}).fill(f.roleRuleId);await page.getByLabel('Tipo de recurso',{exact:true}).fill('documents');await page.getByLabel('Recurso concreto',{exact:true}).fill(f.resourceId);await page.getByLabel('Efecto',{exact:true}).selectOption('DENY');await page.getByLabel('Inicio de vigencia',{exact:true}).fill(local(Date.now()-60000));await finish(page,server)
  expect(await check(target,f.resourceId)).toBe(false);expect(await check(page,f.foreignResource)).toBe(false)
 }finally{await person.close();await server.close()}
})
test('AUTHZ role creation uses policy CAS and stale simultaneous changes never add a second role',async({page})=>{
 const server=await startRealBrowserServer('authz')
 try{const f=await server.rpc({kind:'accessFixture'});await login(page,server);await open(page,f.targetUser);const before=(await server.rpc({kind:'inspectAccess'})).policy
  await page.getByLabel('Tipo de cambio',{exact:true}).selectOption('ROLE');const role=randomUUID();await page.getByLabel('Identificador del rol',{exact:true}).fill(role);await page.getByLabel('Nombre del rol',{exact:true}).fill('Synthetic explicit role');await finish(page,server)
  expect((await server.rpc({kind:'inspectAccess'})).policy).toBe((BigInt(before)+1n).toString())
  const stale={operation:'ROLE',role_id:randomUUID(),label:'Stale request',expected_policy:before,reason:'Synthetic stale CAS'}
  expect((await send(page,stale)).status).toBe(409);expect((await server.rpc({kind:'inspectAccess'})).policy).toBe((BigInt(before)+1n).toString())
 }finally{await server.close()}
})
test('AUTHZ revoking a role denies its grants in existing sessions without revoking unrelated sessions',async({page,browser})=>{
 const server=await startRealBrowserServer('authz'),person=await browser.newContext({ignoreHTTPSErrors:true})
 try{const f=await server.rpc({kind:'accessFixture'}),target=await person.newPage();await login(page,server);await login(target,server,f);expect(await check(target,f.resourceId)).toBe(true);await open(page,f.targetUser)
  await page.getByLabel('Tipo de cambio',{exact:true}).selectOption('REVOKE');await page.getByLabel('Tipo de asignación',{exact:true}).selectOption('ROLE');await page.getByLabel('Identificador a revocar',{exact:true}).fill(f.roleId);await finish(page,server)
  expect(await check(target,f.resourceId)).toBe(false);expect((await target.request.get('/auth/me')).status()).toBe(200);expect((await page.request.get('/auth/me')).status()).toBe(200)
 }finally{await person.close();await server.close()}
})
test('AUTHZ failed COMMIT rolls back rule policy audit and owned result before concurrent one-winner retry',async({page})=>{
 const server=await startRealBrowserServer('authz')
 try{const f=await server.rpc({kind:'accessFixture'});await login(page,server);await open(page,f.targetUser);const before=(await server.rpc({kind:'inspectAccess'})).policy
  await page.getByLabel('Tipo de recurso',{exact:true}).fill('documents');await page.getByLabel('Recurso concreto',{exact:true}).fill(f.resourceId);await page.getByLabel('Identificador de regla existente',{exact:true}).fill(f.ruleId);await page.getByLabel('Efecto',{exact:true}).selectOption('DENY');await page.getByLabel('Inicio de vigencia',{exact:true}).fill(local(Date.now()-60000));await page.getByLabel('Motivo del cambio',{exact:true}).fill('Synthetic rollback change')
  await page.getByRole('button',{name:'Guardar cambio de acceso',exact:true}).click();await server.rpc({kind:'failFactorCommit'});await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof',next:true})).proof);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/access');await page.getByRole('button',{name:'Verificar',exact:true}).click();expect((await response).status()).toBe(503)
  const failed=await server.rpc({kind:'inspectAccess'});expect(failed.policy).toBe(before);expect(failed.audit.length).toBe(0)
  const body={operation:'USER_RULE',target_user_id:f.targetUser,rule_id:f.ruleId,action:'view',resource_kind:'documents',resource_id:f.resourceId,effect:'DENY',start_at:new Date(Date.now()-60000).toISOString(),expires_at:null,expected_policy:before,reason:'Synthetic retry'},key=randomUUID()
  const statuses=(await Promise.all([send(page,body,key),send(page,body,key)])).map(r=>r.status).sort();expect(statuses).toEqual([200,409]);expect((await server.rpc({kind:'inspectAccess'})).policy).toBe((BigInt(before)+1n).toString())
 }finally{await server.close()}
})
