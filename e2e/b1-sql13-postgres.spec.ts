import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
// @ts-expect-error Private isolated bridge only.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
const preauth='__Host-cleanops_preauth',csrf='__Host-cleanops_csrf'
async function cookies(page:Page){const all=await page.context().cookies();return{token:all.find(c=>c.name===preauth)?.value,csrf:all.find(c=>c.name===csrf)?.value}}
async function login(page:Page,email:string){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click()}
async function choose(page:Page,tenant:string,key=randomUUID(),extra:Record<string,string>={}){const c=await cookies(page);return page.request.post('/auth/tenant-switch',{headers:{Origin:'https://127.0.0.1:3000','X-CSRF-Token':c.csrf!,'Idempotency-Key':key,...extra},data:{target_tenant_id:tenant,reason:'Synthetic company selection'}})}
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
  const response=await choose(page,variant==='foreign'?randomUUID():target.tenant,randomUUID(),variant==='csrf'?{'X-CSRF-Token':'invalid'}:variant==='origin'?{Origin:'https://foreign.invalid'}:{})
  expect(response.status()).toBe(403);expect((await response.json()).error.details).toEqual([]);expect(await cookies(page)).toEqual(before)
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
  await active(page,server.rpc);const c=await cookies(page),headers={Origin:'https://127.0.0.1:3000','X-CSRF-Token':c.csrf!,'Idempotency-Key':randomUUID()}
  await server.rpc({kind:'setSelfRule',rule:'B1-SELF-01',effect:'DENY'});const denied=await page.request.get('/auth/me');expect(denied.status()).toBe(403)
  await server.rpc({kind:'setSelfRule',rule:'B1-SELF-01',effect:'ALLOW'});expect((await page.request.get('/auth/me')).status()).toBe(200)
  const step=await page.request.post('/me/sessions/revoke-other-own',{headers,data:{reason:'Synthetic no-step denial'}});expect(step.status()).toBe(403);expect((await step.json()).error.code).toBe('STEP_UP_REQUIRED')
  const audit=await server.rpc({kind:'inspectAbuse'});expect(audit.active).toBe(1);for(const code of ['POLICY_DENIED','STEP_UP_REQUIRED']){const e=audit.events.find((e:{code:string})=>e.code===code);expect(e?.total).toBeGreaterThan(0);expect(e.subject_hashed).toBe(true);expect(e.network_hashed).toBe(true);expect(e.device_hashed).toBe(true)}
 }finally{await server.close()}
})
