import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
// @ts-expect-error Private isolated bridge only.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
const preauth='__Host-cleanops_preauth',csrf='__Host-cleanops_csrf'
async function cookies(page:Page){const all=await page.context().cookies();return{token:all.find(c=>c.name===preauth)?.value,csrf:all.find(c=>c.name===csrf)?.value}}
async function login(page:Page,email:string){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click()}
async function choose(page:Page,tenant:string,key=randomUUID(),extra:Record<string,string>={}){const c=await cookies(page);return page.request.post('/auth/tenant-switch',{headers:{Origin:'https://127.0.0.1:3000','Sec-Fetch-Site':'same-origin','X-CSRF-Token':c.csrf!,'Idempotency-Key':key,...extra},data:{target_tenant_id:tenant,reason:'Synthetic company selection'}})}
async function active(page:Page,rpc:(x:object)=>Promise<{email:string;proof:string}>){await login(page,(await rpc({kind:'fixtureEmail'})).email);await expect(page.getByLabel('Código',{exact:true})).toBeVisible();await page.getByLabel('Código',{exact:true}).fill((await rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()}

test('SQL13 ROT01 ROT14 real multi-company login rotates PREAUTH and CSRF then requires destination MFA',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const target=await server.rpc({kind:'addSwitchMembership'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await expect(page.getByRole('button',{name:'Seleccionar empresa',exact:true})).toBeVisible()
  const before=await cookies(page),state=await server.rpc({kind:'inspectSql13'});expect(state.preauth.at(-1).state).toBe('SELECTION')
  await page.getByRole('button',{name:'Seleccionar empresa',exact:true}).click();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/tenant-switch');await page.getByRole('button',{name:'Synthetic B',exact:true}).click();const selected=await response;expect(selected.status()).toBe(200);expect((await selected.json()).data.state).toBe('PENDING_MFA')
  const after=await cookies(page);expect(after.token!==before.token).toBe(true);expect(after.csrf!==before.csrf).toBe(true)
  expect((await server.rpc({kind:'inspectSql13'})).preauth.at(-1).expires_at).toBe(state.preauth.at(-1).expires_at)
  expect((await server.rpc({kind:'inspectSwitch'})).activeDestination).toBe(0)
  const old=await page.request.get('/auth/tenants',{headers:{Cookie:preauth+'='+before.token+'; '+csrf+'='+before.csrf}});expect(old.status()).toBe(401)
  await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'switchProof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
  const me=await page.request.get('/auth/me');expect(me.status()).toBe(200);expect((await me.json()).data.tenant_id).toBe(target.tenant);const committed=await server.rpc({kind:'inspectSwitch'});expect(committed.activeDestination).toBe(1);expect(committed.destinationConsumed).toBe(true)
 }finally{await server.close()}
})
for(const variant of ['csrf','origin','foreign','revoked'] as const)test('SQL13 ROT02 ROT03 real selection denial '+variant,async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const target=await server.rpc({kind:'addSwitchMembership'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await expect(page.getByRole('button',{name:'Seleccionar empresa',exact:true})).toBeVisible();const before=await cookies(page)
  if(variant==='revoked')await server.rpc({kind:'revokeSwitchMembership'})
  const response=await choose(page,variant==='foreign'?randomUUID():target.tenant,randomUUID(),variant==='csrf'?{'X-CSRF-Token':'x'.repeat(43)}:variant==='origin'?{Origin:'https://foreign.invalid'}:{})
  expect(variant==='csrf'||variant==='origin'?[403]:[401,403]).toContain(response.status());expect((await response.json()).error.details).toEqual([]);expect(await cookies(page)).toEqual(before)
  const state=await server.rpc({kind:'inspectSql13'});expect(state.preauth.at(-1).state).toBe('SELECTION');expect((await server.rpc({kind:'inspectSwitch'})).activeDestination).toBe(0)
 }finally{await server.close()}
})
for(const loss of [false,true])test('SQL13 ROT12 ROT13 real rotation '+(loss?'committed acknowledgement loss never emits cookie':'COMMIT termination rolls back and allows bounded retry'),async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const target=await server.rpc({kind:'addSwitchMembership'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await expect(page.getByRole('button',{name:'Seleccionar empresa',exact:true})).toBeVisible();const before=await cookies(page),key=randomUUID()
  await server.rpc({kind:loss?'loseResetCommitAck':'failFactorCommit'});const failed=await choose(page,target.tenant,key);expect(failed.status()).toBe(503);expect(failed.headers()['set-cookie']).toBeUndefined();expect(await cookies(page)).toEqual(before)
  const state=await server.rpc({kind:'inspectSql13'});expect(state.preauth.at(-1).state).toBe(loss?'PENDING_MFA':'SELECTION');expect((await server.rpc({kind:'inspectSwitch'})).activeDestination).toBe(0)
  const retried=await choose(page,target.tenant,key);expect(retried.status()).toBe(loss?401:200)
  const audit=await server.rpc({kind:'inspectAbuse'});expect(audit.events.some((e:{code:string;total:number})=>e.code==='DEPENDENCY_FAILURE'&&e.total>=1)).toBe(true)
 }finally{await server.close()}
})
test('SQL13 AUD01 AUD02 real guard denials commit journal and preserve ACTIVE',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await active(page,server.rpc);const c=await cookies(page),headers={Origin:'https://127.0.0.1:3000','Sec-Fetch-Site':'same-origin','X-CSRF-Token':c.csrf!,'Idempotency-Key':randomUUID()}
  await server.rpc({kind:'setSelfRule',rule:'B1-SELF-01',effect:'DENY'});const denied=await page.request.get('/auth/me');expect(denied.status()).toBe(403)
  await server.rpc({kind:'setSelfRule',rule:'B1-SELF-01',effect:'ALLOW'});expect((await page.request.get('/auth/me')).status()).toBe(200)
  const step=await page.request.post('/me/sessions/revoke-other-own',{headers,data:{reason:'Synthetic no-step denial'}});expect(step.status()).toBe(403);expect((await step.json()).error.code).toBe('STEP_UP_REQUIRED')
  const audit=await server.rpc({kind:'inspectAbuse'});expect(audit.active).toBe(1);for(const code of ['POLICY_DENIED','STEP_UP_REQUIRED']){const e=audit.events.find((e:{code:string})=>e.code===code);expect(e?.total).toBeGreaterThan(0);expect(e.subject_hashed).toBe(true);expect(e.network_hashed).toBe(true);expect(e.device_hashed).toBe(true)}
 }finally{await server.close()}
})

test('SQL13 ROT11 real late MFA preparation failure rolls back rotation and owned reservations before retry',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const target=await server.rpc({kind:'addSwitchMembership'});await server.rpc({kind:'excessSwitchMethods'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await expect(page.getByRole('button',{name:'Seleccionar empresa',exact:true})).toBeVisible();const before=await cookies(page),key=randomUUID()
  const failed=await choose(page,target.tenant,key);expect(failed.status()).toBe(503);expect(await cookies(page)).toEqual(before);expect((await server.rpc({kind:'inspectSql13'})).preauth.at(-1).state).toBe('SELECTION');expect((await server.rpc({kind:'inspectSwitch'})).activeDestination).toBe(0)
  await server.rpc({kind:'clearExcessSwitchMethods'});expect((await choose(page,target.tenant,key)).status()).toBe(200)
  expect((await server.rpc({kind:'inspectAbuse'})).events.some((e:{code:string})=>e.code==='DEPENDENCY_FAILURE')).toBe(true)
 }finally{await server.close()}
})
test('SQL13 AUD04 real terminated denial journal transaction rolls back then persists trusted denial separately',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await active(page,server.rpc);await server.rpc({kind:'setSelfRule',rule:'B1-SELF-01',effect:'DENY'});await server.rpc({kind:'failNextJournal'})
  const failed=await page.request.get('/auth/me');expect(failed.status()).toBe(503);expect((await failed.json()).error.details).toEqual([]);const audit=await server.rpc({kind:'inspectAbuse'});expect(audit.active).toBe(1);expect(audit.events.find((e:{code:string})=>e.code==='POLICY_DENIED')?.total).toBe(1)
  await server.rpc({kind:'setSelfRule',rule:'B1-SELF-01',effect:'ALLOW'});expect((await page.request.get('/auth/me')).status()).toBe(200)
 }finally{await server.close()}
})
test('SQL13 AUD05 real concurrent protected challenge mutation and policy denial have independent durable outcomes',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await active(page,server.rpc);await server.rpc({kind:'setSelfRule',rule:'B1-SELF-01',effect:'DENY'});const c=await cookies(page)
  const [denied,allowed]=await Promise.all([page.request.get('/auth/me'),page.request.post('/auth/step-up',{headers:{Origin:'https://127.0.0.1:3000','Sec-Fetch-Site':'same-origin','X-CSRF-Token':c.csrf!,'Idempotency-Key':randomUUID()},data:{grant_id:'B1-SELF-05'}})])
  expect(denied.status()).toBe(403);expect(allowed.status()).toBe(200);const audit=await server.rpc({kind:'inspectAbuse'});expect(audit.active).toBe(1);expect(audit.events.find((e:{code:string})=>e.code==='POLICY_DENIED')?.total).toBe(1);expect(audit.challenges.filter((c:{state:string})=>c.state==='ISSUED').length).toBe(1)
 }finally{await server.close()}
})
test('SQL13 AUD03 AUD06 real client-supplied event authority and invalid ingress cannot create a journal actor',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const target=await server.rpc({kind:'addSwitchMembership'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await expect(page.getByRole('button',{name:'Seleccionar empresa',exact:true})).toBeVisible();const before=await server.rpc({kind:'inspectAbuse'}),c=await cookies(page)
  const injected=await page.request.post('/auth/tenant-switch',{headers:{Origin:'https://127.0.0.1:3000','Sec-Fetch-Site':'same-origin','X-CSRF-Token':c.csrf!,'Idempotency-Key':randomUUID()},data:{target_tenant_id:target.tenant,reason:'Synthetic denied injection',event_code:'POLICY_DENIED',actor_user_id:randomUUID()}});expect(injected.status()).toBe(422)
  expect((await choose(page,target.tenant,randomUUID(),{Origin:'https://foreign.invalid'})).status()).toBe(403)
  const after=await server.rpc({kind:'inspectAbuse'});expect(after.events).toEqual(before.events);expect(after.active).toBe(0);expect((await server.rpc({kind:'inspectSql13'})).preauth.at(-1).state).toBe('SELECTION')
 }finally{await server.close()}
})
