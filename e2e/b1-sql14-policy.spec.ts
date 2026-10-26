import {test,expect,type Page} from '@playwright/test'
// @ts-expect-error Private owned fixture composition only.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
type Server={rpc:(value:object)=>Promise<{email:string;proof:string}>}
async function active(page:Page,s:Server){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill((await s.rpc({kind:'fixtureEmail'})).email);await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByLabel('Código',{exact:true}).fill((await s.rpc({kind:'proof'})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()}
for(const offset of [-1,0,1])test('SQL14 UI05 mixed-role exact absolute boundary '+offset,async({page})=>{
 const s=await startRealBrowserServer('abuse');try{await s.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles:['OPERATIONAL','SENSITIVE']});await active(page,s);await s.rpc({kind:'policyExactBoundary',offset});expect((await page.request.get('/auth/me')).status()).toBe(offset<0?200:401)}finally{await s.close()}
})
for(const expiry of ['Idle','Absolute'])test('SQL14 UI05 mixed-role real database '+expiry+' expiration',async({page})=>{
 const s=await startRealBrowserServer('abuse');try{await s.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles:['OPERATIONAL','SENSITIVE']});await active(page,s);await s.rpc({kind:'expireSession'+expiry});expect((await page.request.get('/auth/me')).status()).toBe(401)}finally{await s.close()}
})
test('SQL14 UI05 mixed-role activity step-up and trust cannot extend absolute ceiling',async({page})=>{
 const s=await startRealBrowserServer('abuse');try{await s.rpc({kind:'enablePolicyTrusted'});await s.rpc({kind:'sql14Roles',baseline:'OPERATIONAL',roles:['OPERATIONAL','SENSITIVE']});await active(page,s);const before=(await s.rpc({kind:'inspectPolicySession'})).sessions[0].absolute_expires_at;expect((await page.request.get('/auth/me')).status()).toBe(200);await page.getByRole('button',{name:'Recordar este dispositivo',exact:true}).click();await page.getByLabel('Código',{exact:true}).fill((await s.rpc({kind:'proof',next:true})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.locator('p[role="status"]').first()).toContainText('Cambio de confianza confirmado');await page.getByRole('button',{name:'Comprobar este dispositivo',exact:true}).click();await expect(page.getByText('Este dispositivo tiene confianza vigente.',{exact:true})).toBeVisible();expect((await s.rpc({kind:'inspectPolicySession'})).sessions[0].absolute_expires_at).toBe(before)}finally{await s.close()}
})
