import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
// @ts-expect-error Private isolated IPC test composition, not runtime.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
const phase=(description:string)=>test.info().annotations.push({type:'phase',description})
async function login(page:Page,server:{rpc:(body:object)=>Promise<{email:string;proof:string}>},target?:{targetEmail:string}){
 page.on('response',response=>{const path=new URL(response.url()).pathname;if(['/auth/login','/auth/mfa/verify','/auth/access/user','/auth/access','/auth/step-up'].includes(path))phase('HTTP_'+path.split('/').at(-1)!.toUpperCase()+'_'+response.status())});
 phase(target?'TARGET_LOGIN':'ACTOR_LOGIN');await page.goto('https://127.0.0.1:3000/login');await page.getByLabel('Email',{exact:true}).fill(target?.targetEmail??(await server.rpc({kind:'fixtureEmail'})).email)
 await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click()
 await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:target?'targetProof':'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
}
async function open(page:Page,user:string){await page.getByRole('button',{name:'Usuarios y permisos',exact:true}).click();await page.getByLabel('Usuario para Manage Access',{exact:true}).fill(user);await page.getByRole('button',{name:'Abrir Manage Access',exact:true}).click();await expect(page.getByRole('heading',{name:'Manage Access',exact:true})).toBeVisible();phase('ACCESS_FORM_VISIBLE')}
async function send(page:Page,body:object,key=randomUUID()){return page.evaluate(async input=>{
 const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1]
 const r=await fetch('/auth/access',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':input.key},body:JSON.stringify(input.body)})
 return {status:r.status,data:await r.json()}
},{body,key})}
async function check(page:Page,resource:string,action='view'){return (await (await page.request.get('https://127.0.0.1:3000/auth/access/effective?'+new URLSearchParams({action,resource_kind:'documents',resource_id:resource}))).json()).data.allowed}
async function finish(page:Page,server:{rpc:(body:object)=>Promise<{proof:string}>}){
 await page.getByLabel('Motivo del cambio',{exact:true}).fill('Synthetic isolated approved permission change')
 phase('ACCESS_FORM_FILLED');await page.getByRole('button',{name:'Guardar cambio de acceso',exact:true}).click();phase('ACCESS_SUBMITTED');await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof',next:true})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click()
 await expect(page.locator('p[role="status"]').first()).toContainText('Permisos actualizados')
}
const local=(ms:number)=>new Date(ms).toISOString().slice(0,19)
test('AUTHZ real Manage Access user override DENY defeats role ALLOW in an already ACTIVE target session',async({page,browser})=>{
 const server=await startRealBrowserServer('authz'),person=await browser.newContext({ignoreHTTPSErrors:true})
 try{const f=await server.rpc({kind:'accessFixture'}),target=await person.newPage();await login(page,server);await login(target,server,f);expect(await check(target,f.resourceId)).toBe(true)
  await open(page,f.targetUser);await page.getByLabel('Identificador de regla existente',{exact:true}).fill(f.ruleId);await page.getByLabel('Tipo de recurso',{exact:true}).fill('documents');await page.getByLabel('Recurso concreto',{exact:true}).fill(f.resourceId);await page.getByLabel('Efecto',{exact:true}).selectOption('DENY');await page.getByLabel('Inicio de vigencia',{exact:true}).fill(local(Date.now()-60000));await finish(page,server)
  expect(await check(target,f.resourceId)).toBe(false);expect((await target.request.get('https://127.0.0.1:3000/auth/me')).status()).toBe(200)
  const state=await server.rpc({kind:'inspectAccess'});expect(state.rules.some((r:{id:string;effect:string})=>r.id===f.ruleId&&r.effect==='DENY')).toBe(true);expect(state.audit.some((a:{actor_recorded:boolean;outcome:string})=>a.actor_recorded&&a.outcome==='SUCCESS')).toBe(true)
 }finally{await person.close();await server.close()}
})
test('AUTHZ read-only UI cannot grant permissions through forged HTTP and cross-tenant detail is denied safely',async({page})=>{
 const server=await startRealBrowserServer('authz-readonly')
 try{const f=await server.rpc({kind:'accessFixture'});await login(page,server);await open(page,f.targetUser)
  await expect(page.getByText('Solo lectura: no tienes autorización para modificar este usuario.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Guardar cambio de acceso',exact:true})).toBeDisabled()
  const body={operation:'ROLE',role_id:randomUUID(),label:'Not an authority',expected_policy:(await server.rpc({kind:'inspectAccess'})).policy,reason:'Synthetic denied attempt'}
  expect((await send(page,body)).status).toBe(503);expect((await send(page,{...body,tenant_id:randomUUID()})).status).toBe(422)
  expect((await page.request.get('/auth/access/user?target_user_id='+f.foreignUser)).status()).toBe(403);expect((await page.request.get('/auth/me')).status()).toBe(200)
  expect(await check(page,f.foreignResource)).toBe(false);expect((await server.rpc({kind:'inspectAccess'})).audit.length).toBe(0)
 }finally{await server.close()}
})
test('AUTHZ role membership starts and expires in PostgreSQL while the target session remains ACTIVE',async({page,browser})=>{
 const server=await startRealBrowserServer('authz'),person=await browser.newContext({ignoreHTTPSErrors:true})
 try{const f=await server.rpc({kind:'accessFixture'}),target=await person.newPage();await login(page,server);await login(target,server,f);await open(page,f.targetUser)
  await page.getByLabel('Tipo de cambio',{exact:true}).selectOption('MEMBERSHIP');await page.getByLabel('Identificador del rol',{exact:true}).fill(f.roleId)
  await page.getByLabel('Inicio de vigencia',{exact:true}).fill(local(Date.now()+12000));await page.getByLabel('Fin de vigencia',{exact:true}).fill(local(Date.now()+20000));await finish(page,server)
  expect(await check(target,f.resourceId)).toBe(false);await expect.poll(()=>check(target,f.resourceId),{timeout:15000}).toBe(true);await expect.poll(()=>check(target,f.resourceId),{timeout:25000}).toBe(false)
  expect((await target.request.get('https://127.0.0.1:3000/auth/me')).status()).toBe(200)
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
  expect((await server.rpc({kind:'inspectAccess'})).policy).toBe((BigInt(before)+BigInt(1)).toString())
  const stale={operation:'ROLE',role_id:randomUUID(),label:'Stale request',expected_policy:before,reason:'Synthetic stale CAS'}
  expect((await send(page,stale)).status).toBe(409);expect((await server.rpc({kind:'inspectAccess'})).policy).toBe((BigInt(before)+BigInt(1)).toString())
 }finally{await server.close()}
})
test('AUTHZ revoking a role denies its grants in existing sessions without revoking unrelated sessions',async({page,browser})=>{
 const server=await startRealBrowserServer('authz'),person=await browser.newContext({ignoreHTTPSErrors:true})
 try{const f=await server.rpc({kind:'accessFixture'}),target=await person.newPage();await login(page,server);await login(target,server,f);expect(await check(target,f.resourceId)).toBe(true);await open(page,f.targetUser)
  await page.getByLabel('Tipo de cambio',{exact:true}).selectOption('REVOKE');await page.getByLabel('Tipo de asignación',{exact:true}).selectOption('ROLE');await page.getByLabel('Identificador a revocar',{exact:true}).fill(f.roleId);await finish(page,server)
  expect(await check(target,f.resourceId)).toBe(false);expect((await target.request.get('https://127.0.0.1:3000/auth/me')).status()).toBe(200);expect((await page.request.get('/auth/me')).status()).toBe(200)
 }finally{await person.close();await server.close()}
})
test('AUTHZ failed COMMIT rolls back rule policy audit and owned result before concurrent one-winner retry',async({page})=>{
 const server=await startRealBrowserServer('authz')
 try{const f=await server.rpc({kind:'accessFixture'});await login(page,server);await open(page,f.targetUser);const before=(await server.rpc({kind:'inspectAccess'})).policy
  await page.getByLabel('Tipo de recurso',{exact:true}).fill('documents');await page.getByLabel('Recurso concreto',{exact:true}).fill(f.resourceId);await page.getByLabel('Identificador de regla existente',{exact:true}).fill(f.ruleId);await page.getByLabel('Efecto',{exact:true}).selectOption('DENY');await page.getByLabel('Inicio de vigencia',{exact:true}).fill(local(Date.now()-60000));await page.getByLabel('Motivo del cambio',{exact:true}).fill('Synthetic rollback change')
  await page.getByRole('button',{name:'Guardar cambio de acceso',exact:true}).click();await server.rpc({kind:'failFactorCommit'});await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof',next:true})).proof);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/access');await page.getByRole('button',{name:'Verificar',exact:true}).click();expect((await response).status()).toBe(503)
  const failed=await server.rpc({kind:'inspectAccess'});expect(failed.policy).toBe(before);expect(failed.audit.length).toBe(0)
  const body={operation:'USER_RULE',target_user_id:f.targetUser,rule_id:f.ruleId,action:'view',resource_kind:'documents',resource_id:f.resourceId,effect:'DENY',start_at:new Date(Date.now()-60000).toISOString(),expires_at:null,expected_policy:before,reason:'Synthetic retry'},key=randomUUID()
  const statuses=(await Promise.all([send(page,body,key),send(page,body,key)])).map(r=>r.status).sort();expect(statuses).toEqual([200,409]);expect((await server.rpc({kind:'inspectAccess'})).policy).toBe((BigInt(before)+BigInt(1)).toString())
 }finally{await server.close()}
})

test('AUTHZ current administrator can read and check scoped access but unavailable audited writes fail closed',async({page})=>{
 const server=await startRealBrowserServer('authz')
 try{const f=await server.rpc({kind:'accessFixture'});await login(page,server);await open(page,f.targetUser)
  await expect(page.getByText('Synthetic scoped viewer',{exact:true})).toBeVisible()
  await page.getByLabel('Tipo de recurso a comprobar',{exact:true}).fill('documents');await page.getByLabel('Recurso a comprobar',{exact:true}).fill(f.resourceId);await page.getByRole('button',{name:'Comprobar permiso en servidor',exact:true}).click();await expect(page.getByText('Permitido por el servidor.',{exact:true})).toBeVisible()
  expect(await check(page,f.foreignResource)).toBe(false)
  const before=await server.rpc({kind:'inspectAccess'});expect((await send(page,{operation:'ROLE',role_id:randomUUID(),label:'Audited write unavailable',expected_policy:before.policy,reason:'Synthetic fail-closed proof'})).status).toBe(503)
  const after=await server.rpc({kind:'inspectAccess'});expect(after.policy).toBe(before.policy);expect(after.audit.length).toBe(before.audit.length);expect((await page.request.get('/auth/me')).status()).toBe(200)
 }finally{const d=await server.rpc({kind:'diagnostics'});for(const f of d.failures)phase('SQLSTATE_'+f.sqlstate);await server.close()}
})
test('AUTHZ password PREAUTH with operator roles never exposes access details or permits changes',async({page})=>{
 const server=await startRealBrowserServer('authz')
 try{const f=await server.rpc({kind:'accessFixture'});await page.goto('https://127.0.0.1:3000/login');await page.getByLabel('Email',{exact:true}).fill((await server.rpc({kind:'fixtureEmail'})).email);await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
  expect((await page.request.get('/auth/access/user?target_user_id='+f.targetUser)).status()).toBe(401);expect((await send(page,{operation:'ROLE',role_id:randomUUID(),label:'No authority',expected_policy:(await server.rpc({kind:'inspectAccess'})).policy,reason:'Synthetic no-MFA proof'})).status).toBe(401)
 }finally{await server.close()}
})
