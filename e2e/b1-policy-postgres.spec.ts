import {test,expect,type Page} from '@playwright/test'
import {numeric} from '../lib/b1/config'
// @ts-expect-error Private owned test fixture only.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
async function login(page:Page,email:string){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect(page.getByLabel('Código',{exact:true})).toBeVisible()}
for(const risk of ['SENSITIVE','OPERATIONAL'] as const)for(const expiry of ['Idle','Absolute'] as const)test('POLICY real '+risk+' requires MFA and enforces independent '+expiry+' expiry',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await server.rpc({kind:'setAbuseRisk',risk});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);expect((await server.rpc({kind:'inspectAbuse'})).active).toBe(0)
  await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
  const state=await server.rpc({kind:'inspectPolicySession'}),session=state.sessions[0];expect(state.sessions.length).toBe(1)
  const idle=numeric(risk==='OPERATIONAL'?'idle_operational':'idle_sensitive'),absolute=numeric(risk==='OPERATIONAL'?'absolute_operational':'absolute_sensitive')
  expect(session.idle_seconds).toBe(idle);expect(Math.abs(session.absolute_seconds-absolute)).toBeLessThan(1);expect(Math.abs(session.idle_remaining-idle)).toBeLessThan(1)
  expect((await page.request.get('/auth/me')).status()).toBe(200);expect((await server.rpc({kind:'inspectPolicySession'})).sessions[0].absolute_expires_at).toBe(session.absolute_expires_at)
  await server.rpc({kind:'expireSession'+expiry});const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/me');await page.getByRole('button',{name:'Mi identidad',exact:true}).click();expect((await response).status()).toBe(401);await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
  expect((await page.request.get('/auth/me')).status()).toBe(401)
 }finally{await server.close()}
})
test('CIPHER real PostgreSQL tampering rejects GCM authentication without leaking secret or issuing session',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await server.rpc({kind:'tamperAbuseCiphertext'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/verify');await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();const r=await response
  expect(r.status()).toBe(503);const body=await r.json();expect(body.error.details).toEqual([]);expect(Object.keys(body).sort()).toEqual(['correlation_id','error'])
  expect((await server.rpc({kind:'inspectAbuse'})).active).toBe(0)
 }finally{await server.close()}
})

for(const offset of [-1,0,1])test('POLICY real absolute boundary offset milliseconds '+offset,async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
  await server.rpc({kind:'policyExactBoundary',offset});expect((await page.request.get('/auth/me')).status()).toBe(offset<0?200:401)
 }finally{await server.close()}
})
