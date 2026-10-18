import {test,expect,type Page} from '@playwright/test'
// @ts-expect-error Private isolated IPC composition, never runtime.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
type Server={rpc:(value:object)=>Promise<{email:string;proof:string}>}
const phase=(description:string)=>test.info().annotations.push({type:'phase',description})
async function login(page:Page,server:Server){
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill((await server.rpc({kind:'fixtureEmail'})).email)
 await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click()
 await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click()
 await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
}
async function remember(page:Page,server:Server){
 await page.getByRole('button',{name:'Recordar este dispositivo',exact:true}).click()
 await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
 await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof',next:true})).proof)
 await page.getByRole('button',{name:'Verificar',exact:true}).click()
 await expect(page.locator('p[role="status"]').first()).toContainText('Cambio de confianza confirmado')
}
async function post(page:Page,path:string,body?:object,key?:string){return page.evaluate(async input=>{
 const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))?.split('=')[1]??''
 const response=await fetch(input.path,{method:'POST',headers:{'X-CSRF-Token':csrf,'Idempotency-Key':input.key??crypto.randomUUID(),...(input.body?{'Content-Type':'application/json'}:{})},body:input.body?JSON.stringify(input.body):undefined})
 return {status:response.status,body:await response.json()}
},{path,body,key})}
test('trusted UI registers digest-only 30-day metadata with post-COMMIT HttpOnly cookie and cannot bypass MFA',async({page,browser})=>{
 const server=await startRealBrowserServer('trusted');const thief=await browser.newContext({ignoreHTTPSErrors:true})
 try{
  phase('LOGIN');await login(page,server);await remember(page,server)
  const cookie=(await page.context().cookies()).find(c=>c.name==='__Host-cleanops_trusted')!
  expect(cookie.httpOnly&&cookie.secure&&cookie.path==='/'&&cookie.sameSite==='Lax').toBe(true)
  expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(await page.evaluate(()=>document.cookie.includes('__Host-cleanops_trusted')||localStorage.length>0||sessionStorage.length>0)).toBe(false)
  await page.getByRole('button',{name:'Comprobar este dispositivo',exact:true}).click();await expect(page.getByText('Este dispositivo tiene confianza vigente.',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Ver dispositivos de confianza',exact:true}).click();await expect(page.getByRole('button',{name:'Revocar dispositivo 1',exact:true})).toBeVisible()
  const state=await server.rpc({kind:'inspectTrusted'});expect(state.devices.length).toBe(1);expect(state.devices[0].digest_only).toBe(true)
  expect(Date.parse(state.devices[0].expires_at)-Date.parse(state.devices[0].created_at)).toBe(2592000000)
  expect(state.audit.some((a:{action:string})=>a.action==='auth.device.register')).toBe(true)
  phase('STOLEN_TOKEN_NO_AUTHORITY');await thief.addCookies([{...cookie}]) // Only stolen trust metadata; no auth/session injection.
  expect((await thief.request.get('https://127.0.0.1:3000/me/trusted-devices/status')).status()).toBe(401)
  const next=await thief.newPage();await next.goto('https://127.0.0.1:3000/login')
  await next.getByLabel('Email',{exact:true}).fill((await server.rpc({kind:'fixtureEmail'})).email);await next.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await next.getByRole('button',{name:'Continuar',exact:true}).click()
  await expect(next.getByLabel('Código',{exact:true})).toBeVisible();expect((await next.request.get('https://127.0.0.1:3000/me/trusted-devices/status')).status()).toBe(401)
 }finally{await thief.close();await server.close()}
})
test('trusted expiration and enterprise disable deny metadata without destroying ACTIVE or extending session',async({page})=>{
 const server=await startRealBrowserServer('trusted')
 try{await login(page,server);await remember(page,server);const before=await page.request.get('/auth/me');expect(before.status()).toBe(200)
  await server.rpc({kind:'expireTrusted'});await page.getByRole('button',{name:'Comprobar este dispositivo',exact:true}).click();await expect(page.getByText('Este dispositivo no tiene confianza vigente.',{exact:true})).toBeVisible()
  expect((await page.request.get('/auth/me')).status()).toBe(200)
  await server.rpc({kind:'disableTrusted'});const response=await post(page,'/me/trusted-devices');expect(response.status).toBe(403)
  expect((await page.request.get('/auth/me')).status()).toBe(200)
 }finally{await server.close()}
})
test('trusted same-key concurrent registration is one-time and foreign device cannot be revoked or listed',async({page})=>{
 const server=await startRealBrowserServer('trusted')
 try{await login(page,server);await remember(page,server)
  const foreign=await server.rpc({kind:'foreignTrusted'}),key=crypto.randomUUID()
  const result=await Promise.all([post(page,'/me/trusted-devices',undefined,key),post(page,'/me/trusted-devices',undefined,key)])
  expect(result.map(r=>r.status).sort()).toEqual([200,409]);expect(JSON.stringify(result)).not.toMatch(/token_digest|token|principal|ciphertext/)
  expect((await server.rpc({kind:'inspectTrusted'})).devices.length).toBe(2)
  expect((await post(page,'/me/trusted-devices/revoke',{device_id:foreign.deviceId})).body.data.revoked_count).toBe(0)
  expect((await post(page,'/auth/trusted-devices/revoke-user',{target_user_id:foreign.targetUser})).status).toBe(403)
  const listing=await (await page.request.get('/me/trusted-devices')).json();expect(listing.data.items.some((d:{id:string})=>d.id===foreign.deviceId)).toBe(false)
  const csrf=await page.evaluate(async()=> (await fetch('/me/trusted-devices',{method:'POST',headers:{'X-CSRF-Token':'x'.repeat(43),'Idempotency-Key':crypto.randomUUID()}})).status);expect(csrf).toBe(403)
 }finally{await server.close()}
})
test('trusted UI revokes individual and every remaining device atomically with audit',async({page})=>{
 const server=await startRealBrowserServer('trusted')
 try{await login(page,server);await remember(page,server);expect((await post(page,'/me/trusted-devices')).status).toBe(200)
  await page.getByRole('button',{name:'Ver dispositivos de confianza',exact:true}).click();await expect(page.getByRole('button',{name:'Revocar dispositivo 1',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Revocar dispositivo 1',exact:true}).click();await expect(page.locator('p[role="status"]').first()).toContainText('Cambio de confianza confirmado')
  expect((await server.rpc({kind:'inspectTrusted'})).devices.filter((d:{revoked_at:string|null})=>!d.revoked_at).length).toBe(1)
  await page.getByRole('button',{name:'Revocar todos mis dispositivos',exact:true}).click();await expect(page.locator('p[role="status"]').first()).toContainText('Cambio de confianza confirmado')
  const state=await server.rpc({kind:'inspectTrusted'});expect(state.devices.every((d:{revoked_at:string|null})=>!!d.revoked_at)).toBe(true);expect(state.audit.some((a:{action:string})=>a.action==='auth.device.revoke')).toBe(true)
  expect((await page.context().cookies()).some(c=>c.name==='__Host-cleanops_trusted')).toBe(false)
 }finally{await server.close()}
})
test('trusted failed COMMIT releases no cookie and rolls back device and audit before safe retry',async({page})=>{
 const server=await startRealBrowserServer('trusted')
 try{await login(page,server);await remember(page,server);const before=await server.rpc({kind:'inspectTrusted'})
  await server.rpc({kind:'failFactorCommit'});expect((await post(page,'/me/trusted-devices')).status).toBe(503)
  expect((await server.rpc({kind:'inspectTrusted'})).devices.length).toBe(before.devices.length)
  expect((await post(page,'/me/trusted-devices')).status).toBe(200)
  expect((await server.rpc({kind:'inspectTrusted'})).devices.length).toBe(before.devices.length+1)
 }finally{await server.close()}
})
test('trusted operator UI revokes another user only with current effective edit users and fresh MFA',async({page})=>{
 const server=await startRealBrowserServer('trusted-admin')
 try{await login(page,server);const target=await server.rpc({kind:'targetTrusted'})
  await page.getByText('Revocación administrativa de confianza',{exact:true}).click();await page.getByLabel('Usuario para revocar confianza',{exact:true}).fill(target.targetUser)
  await page.getByRole('button',{name:'Verificar y revocar confianza del usuario',exact:true}).click();await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof',next:true})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click()
  await expect(page.locator('p[role="status"]').first()).toContainText('Cambio de confianza confirmado');expect((await server.rpc({kind:'targetTrustedState'})).active).toBe(0)
  await server.rpc({kind:'targetTrusted'});await server.rpc({kind:'denyResetAuthorization'})
  expect((await post(page,'/auth/trusted-devices/revoke-user',{target_user_id:target.targetUser})).status).toBe(403)
  expect((await server.rpc({kind:'targetTrustedState'})).active).toBe(1);expect((await page.request.get('/auth/me')).status()).toBe(200)
 }finally{await server.close()}
})
