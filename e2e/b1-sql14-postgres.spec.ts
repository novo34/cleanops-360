import {test,expect,type Page} from '@playwright/test'
// @ts-expect-error Private owned test composition; fixture RPC never exposed over HTTP.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
type Server={rpc:(value:object)=>Promise<{email:string;proof:string}>}
async function password(page:Page,s:Server){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill((await s.rpc({kind:'fixtureEmail'})).email);await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect(page.getByLabel('Código',{exact:true})).toBeVisible()}
async function confirm(page:Page,s:Server){await page.getByLabel('Código',{exact:true}).fill((await s.rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()}
for(const roles of [['OPERATIONAL','SENSITIVE'],['SENSITIVE','OPERATIONAL'],['OPERATIONAL','OPERATIONAL']])test('SQL14 UI01 actual mixed-role password MFA session '+roles.join('-'),async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await server.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles});await password(page,server);expect((await server.rpc({kind:'inspectAbuse'})).active).toBe(0);await confirm(page,server)
  const sessions=(await server.rpc({kind:'inspectPolicySession'})).sessions;expect(sessions.length).toBe(1);const sensitive=roles.includes('SENSITIVE');expect(sessions[0].absolute_seconds).toBe(sensitive?43200:86400);expect(sessions[0].idle_seconds).toBe(sensitive?1800:28800)
  const injected=await page.evaluate(async()=>{const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1];const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email:'unknown@fixture.invalid',password:'not authority',riskClass:'OPERATIONAL',userId:crypto.randomUUID(),tenantId:crypto.randomUUID()})});return r.status});expect(injected).toBe(422)
 }finally{await server.close()}
})
test('SQL14 UI01 unknown active role fails closed without a session or internal HTTP details',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await server.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles:['SENSITIVE','UNKNOWN']})
  await page.goto('/login')
  await page.getByLabel('Email',{exact:true}).fill((await server.rpc({kind:'fixtureEmail'})).email)
  await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!')
  const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/login')
  await page.getByRole('button',{name:'Continuar',exact:true}).click()
  const denied=await result
  test.info().annotations.push({type:'phase',description:'DENIED_HTTP_'+denied.status()})
  expect(denied.status()).toBe(401)
  const safe=await denied.json()
  if(/^[A-Z_]{1,35}$/.test(safe.error?.code))test.info().annotations.push({type:'phase',description:'PUBLIC_'+safe.error.code})
  expect(safe.error.code).toBe('AUTH_INVALID')
  expect(safe.error.details).toEqual([])
  test.info().annotations.push({type:'phase',description:'SAFE_DETAILS'})
  const state=await server.rpc({kind:'inspectAbuse'})
  test.info().annotations.push({type:'phase',description:'ACTIVE_COUNT_'+Number(state.active)})
  expect(state.active).toBe(0)
  await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
 }finally{await server.close()}
})
test('SQL14 UI02 actual authorization row wait revalidates reactivated sensitive role and invalidates24h session',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await server.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles:['OPERATIONAL']});await password(page,server);await confirm(page,server);await server.rpc({kind:'sql14HoldReactivation'});const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/me');await page.getByRole('button',{name:'Mi identidad',exact:true}).click();expect((await server.rpc({kind:'sql14WaitBlocked'})).blocked).toBe(true);await server.rpc({kind:'sql14ReleaseReactivation'});expect((await pending).status()).toBe(401);expect((await page.request.get('/auth/me')).status()).toBe(401)
 }finally{await server.close()}
})
for(const mode of ['START','EXPIRE'])test('SQL14 UI04 actual membership '+mode+' boundary while authorization waits',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await server.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles:mode==='START'?['OPERATIONAL']:['SENSITIVE','OPERATIONAL']});await password(page,server);await confirm(page,server);const before=(await server.rpc({kind:'inspectPolicySession'})).sessions[0].absolute_expires_at;await server.rpc({kind:'sql14HoldTimedRole',mode});const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/me');await page.getByRole('button',{name:'Mi identidad',exact:true}).click();expect((await server.rpc({kind:'sql14WaitBlocked'})).blocked).toBe(true);await server.rpc({kind:'sql14ReleaseTimed'});expect((await pending).status()).toBe(mode==='START'?401:200);expect((await server.rpc({kind:'inspectPolicySession'})).sessions[0].absolute_expires_at).toBe(before)
 }finally{await server.close()}
})
test('SQL14 UI03 real concurrent MFA counter CAS has one session winner with mixed roles',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await server.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles:['OPERATIONAL','SENSITIVE']});const login=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/login');await password(page,server);const q=(await (await login).json()).data
  const statuses=await page.evaluate(async input=>{const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1];const send=async()=>{const r=await fetch('/auth/mfa/verify',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(input)});return r.status};return Promise.all([send(),send()])},{challenge_id:q.challenge_id,method:'TOTP',proof:(await server.rpc({kind:'proof'})).proof})
  expect(statuses.filter(s=>s===200).length).toBe(1);expect(statuses.filter(s=>[401,409].includes(s)).length).toBe(1);const saved=await server.rpc({kind:'inspectAbuse'});expect(saved.active).toBe(1);expect(saved.consumedMethods).toBe(1)
 }finally{await server.close()}
})
test('SQL14 UI03 revoked current method generation cannot consume a valid old proof or create session',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await server.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles:['SENSITIVE']});await password(page,server);await server.rpc({kind:'sql14RevokeMethod'});const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/verify');await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();expect((await result).status()).toBe(401);const saved=await server.rpc({kind:'inspectAbuse'});expect(saved.active).toBe(0);expect(saved.consumedMethods).toBe(0)
 }finally{await server.close()}
})
test('SQL14 UI06 actual successful COMMIT with lost acknowledgement emits no cookie or false rollback',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await server.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles:['SENSITIVE','OPERATIONAL']});await password(page,server);await server.rpc({kind:'loseResetCommitAck'});const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/verify');await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();const failed=await result;expect(failed.status()).toBe(503);expect(failed.headers()['set-cookie']).toBeUndefined();await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0);expect((await page.request.get('/auth/me')).status()).toBe(401);const state=await server.rpc({kind:'inspectAbuse'});expect(state.active).toBe(1);expect(state.events.some((e:{code:string})=>e.code==='DEPENDENCY_FAILURE')).toBe(true)
 }finally{await server.close()}
})
