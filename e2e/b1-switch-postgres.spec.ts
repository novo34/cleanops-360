import {test,expect,type Page} from '@playwright/test'
// @ts-expect-error Private isolated bridge only.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
async function login(page:Page,email:string){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect(page.getByLabel('Código',{exact:true})).toBeVisible()}
for(const revoked of [false,true])test('SWITCH real ACTIVE source step-up and destination MFA '+(revoked?'deny revoked origin without consuming destination factor':'commit destination and revoke source atomically'),async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
  const target=await server.rpc({kind:'addSwitchMembership'});await page.getByRole('button',{name:'Seleccionar empresa',exact:true}).click();await page.getByRole('button',{name:'Synthetic B',exact:true}).click();await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
  const pendingResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/tenant-switch');await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof',next:true})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();const pending=await pendingResponse;expect(pending.status()).toBe(200);expect((await pending.json()).data.state).toBe('PENDING_MFA')
  await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0);expect((await server.rpc({kind:'inspectSwitch'})).activeDestination).toBe(0)
  if(revoked)await server.rpc({kind:'revokeSwitchSource'})
  const confirmed=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/verify');await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'switchProof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();const result=await confirmed
  if(revoked){expect(result.status()).toBe(401);const state=await server.rpc({kind:'inspectSwitch'});expect(state.activeDestination).toBe(0);expect(state.destinationConsumed).toBe(false)}
  else{expect(result.status()).toBe(200);await expect(page.getByText('Seguridad de la cuenta')).toBeVisible();const me=await page.request.get('/auth/me');expect(me.status()).toBe(200);expect((await me.json()).data.tenant_id).toBe(target.tenant);const state=await server.rpc({kind:'inspectSwitch'});expect(state.source).toEqual(['REVOKED']);expect(state.activeDestination).toBe(1);expect(state.destinationConsumed).toBe(true)}
 }finally{await server.close()}
})
