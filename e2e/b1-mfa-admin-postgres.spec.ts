import {test,expect,type Page} from '@playwright/test'
// @ts-expect-error Private isolated composition only.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
async function login(page:Page,email:string){await page.goto('https://127.0.0.1:3000/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect(page.getByLabel('Código',{exact:true})).toBeVisible()}
async function verify(page:Page,proof:string){await page.getByLabel('Código',{exact:true}).fill(proof);await page.getByRole('button',{name:'Verificar',exact:true}).click();await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()}
async function send(page:Page,body:object,key=crypto.randomUUID()){return page.evaluate(async input=>{const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1];const r=await fetch('/auth/mfa/reset',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':input.key},body:JSON.stringify(input.body)});return{status:r.status,body:await r.json()}},{body,key})}
async function prepare(page:Page,proof:{targetUser:string;ticket:string}){
 await page.getByText('Restablecer MFA de otro usuario',{exact:true}).click();await page.getByLabel('Usuario para restablecer MFA',{exact:true}).fill(proof.targetUser);await page.getByLabel('Comprobante verificado de reset MFA',{exact:true}).fill(proof.ticket);await page.getByLabel('Motivo del reset MFA',{exact:true}).fill('Synthetic verified MFA reset');await page.getByRole('button',{name:'Verificar y restablecer MFA',exact:true}).click();await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
}
test('ADMIN MFA real UI step-up resets only the attested target and persists actor target reason and outcome',async({page,browser})=>{
 const server=await startRealBrowserServer('reset-admin'),other=await browser.newContext({ignoreHTTPSErrors:true,baseURL:'https://127.0.0.1:3000'})
 try{
  const p=await server.rpc({kind:'mfaResetProof'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await verify(page,(await server.rpc({kind:'proof'})).proof)
  const target=await other.newPage();await login(target,p.targetEmail);await verify(target,(await server.rpc({kind:'targetProof'})).proof)
  await prepare(page,p);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/reset');await verify(page,(await server.rpc({kind:'proof',next:true})).proof);expect((await response).status()).toBe(200)
  await expect(page.getByRole('status')).toContainText('MFA restablecido')
  const state=await server.rpc({kind:'inspectMfaReset'});expect(state.methods).toBe(0);expect(state.sessions).toBe(0);expect(state.consumed).toBe(true);expect(state.audit).toEqual({total:1,correct:true});expect(state.evidence).toEqual({total:1,correct:true})
  expect((await target.request.get('/auth/me')).status()).toBe(401);expect((await page.request.get('/auth/me')).status()).toBe(200)
  expect((await send(page,{target_user_id:p.targetUser,ticket:p.ticket,reason:'Synthetic verified MFA reset'})).status).toBe(403);expect((await server.rpc({kind:'inspectMfaReset'})).audit.total).toBe(1)
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0)
 }finally{await other.close();await server.close()}
})
test('ADMIN MFA password PREAUTH cannot reset or expose privileged target state',async({page})=>{
 const server=await startRealBrowserServer('reset-admin')
 try{const p=await server.rpc({kind:'mfaResetProof'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);expect((await send(page,{target_user_id:p.targetUser,ticket:p.ticket,reason:'Synthetic verified MFA reset'})).status).toBe(401);const state=await server.rpc({kind:'inspectMfaReset'});expect(state.methods).toBe(1);expect(state.consumed).toBe(false);expect(state.audit.total).toBe(0)}finally{await server.close()}
})
test('ADMIN MFA real expired attestation and forged authority fail closed without revoking factors',async({page})=>{
 const server=await startRealBrowserServer('reset-admin')
 try{
  const p=await server.rpc({kind:'mfaResetProof'});await server.rpc({kind:'expireMfaResetProof'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await verify(page,(await server.rpc({kind:'proof'})).proof)
  // Acquire legitimate fresh step-up through the UI; the expired receipt must still deny.
  await prepare(page,p);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/reset');await verify(page,(await server.rpc({kind:'proof',next:true})).proof);expect((await response).status()).toBe(403)
  const body={target_user_id:p.targetUser,ticket:p.ticket,reason:'Synthetic verified MFA reset'}
  expect((await send(page,{...body,tenant_id:crypto.randomUUID()})).status).toBe(422)
  expect((await send(page,{...body,target_user_id:p.foreignUser})).status).toBe(403)
  const state=await server.rpc({kind:'inspectMfaReset'});expect(state.methods).toBe(1);expect(state.audit.total).toBe(0);expect(state.consumed).toBe(false);expect((await page.request.get('/auth/me')).status()).toBe(200)
 }finally{await server.close()}
})
test('ADMIN MFA actual failed COMMIT restores factors receipt and audit before a safe retry',async({page})=>{
 const server=await startRealBrowserServer('reset-admin')
 try{
  const p=await server.rpc({kind:'mfaResetProof'});await login(page,(await server.rpc({kind:'fixtureEmail'})).email);await verify(page,(await server.rpc({kind:'proof'})).proof);await prepare(page,p);await server.rpc({kind:'failFactorCommit'})
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/reset');await verify(page,(await server.rpc({kind:'proof',next:true})).proof);expect((await response).status()).toBe(503)
  const before=await server.rpc({kind:'inspectMfaReset'});expect(before.methods).toBe(1);expect(before.consumed).toBe(false);expect(before.audit.total).toBe(0)
  const retry=await send(page,{target_user_id:p.targetUser,ticket:p.ticket,reason:'Synthetic verified MFA reset'});expect(retry.status).toBe(200);expect(retry.body.data).toEqual({reset:true});expect((await server.rpc({kind:'inspectMfaReset'})).audit.total).toBe(1)
 }finally{await server.close()}
})
