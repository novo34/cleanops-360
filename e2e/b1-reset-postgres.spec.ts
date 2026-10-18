import {test,expect,type Page} from '@playwright/test'
// @ts-expect-error Private isolated IPC test bridge, never application code.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
const phase=(description:string)=>test.info().annotations.push({type:'phase',description})
const replacement='New isolated credential 360!'
async function form(page:Page){await page.goto('/login');await page.getByRole('button',{name:'Restablecer contraseña',exact:true}).click()}
async function submit(page:Page,ticket:string,code:string,password=replacement){
 await page.getByLabel('Ticket de restablecimiento',{exact:true}).fill(ticket)
 await page.getByLabel('Código de recuperación',{exact:true}).fill(code)
 await page.getByLabel('Nueva contraseña',{exact:true}).fill(password)
 await page.getByRole('button',{name:'Confirmar restablecimiento',exact:true}).click()
}
test('real reset UI commits credential CAS and requires password plus MFA again',async({page,browser})=>{
 phase('SETUP');const server=await startRealBrowserServer('reset')
 const old=await browser.newContext({ignoreHTTPSErrors:true})
 try{
  const email=(await server.rpc({kind:'fixtureEmail'})).email
  const prior=await old.newPage();await prior.goto('https://127.0.0.1:3000/login')
  await prior.getByLabel('Email',{exact:true}).fill(email);await prior.getByLabel('Contraseña').fill('PG05 synthetic passphrase!');await prior.getByRole('button',{name:'Continuar',exact:true}).click()
  await prior.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof'})).proof);await prior.getByRole('button',{name:'Verificar',exact:true}).click()
  await expect(prior.getByText('Seguridad de la cuenta')).toBeVisible()
  expect((await server.rpc({kind:'inspectReset'})).active).toBe(1)
  const proof=await server.rpc({kind:'resetProof'});await form(page)
  phase('WRONG_PROOF');await submit(page,proof.ticket,(proof.code[0]==='A'?'B':'A')+proof.code.slice(1))
  await expect(page.locator('p[role="status"]')).toContainText('No se pudo confirmar')
  expect((await server.rpc({kind:'inspectReset'})).version).toBe('1')
  phase('WEAK_PASSWORD');await submit(page,proof.ticket,proof.code,'short')
  await expect(page.locator('p[role="status"]')).toContainText('No se pudo confirmar')
  phase('RESET');await submit(page,proof.ticket,proof.code)
  await expect(page.getByRole('link',{name:'Volver al acceso',exact:true})).toBeVisible()
  const state=await server.rpc({kind:'inspectReset'})
  expect(state.version==='2' && state.tickets===1 && state.codes===1 && state.active===0).toBe(true)
  expect((await prior.request.get('https://127.0.0.1:3000/auth/me')).status()).toBe(401)
  expect((await page.context().cookies()).some(c=>c.name.startsWith('__Host-cleanops'))).toBe(false)
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0)
  phase('NEW_LOGIN');await page.getByRole('link',{name:'Volver al acceso',exact:true}).click()
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!');await page.getByRole('button',{name:'Continuar',exact:true}).click()
  await expect(page.locator('p[role="status"]')).toContainText('ha caducado')
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña').fill(replacement);await page.getByRole('button',{name:'Continuar',exact:true}).click()
  await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
  expect((await server.rpc({kind:'inspectReset'})).active).toBe(0)
  await page.getByLabel('Código',{exact:true}).fill((await server.rpc({kind:'proof',next:true})).proof);await page.getByRole('button',{name:'Verificar',exact:true}).click()
  await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
 }finally{await old.close();await server.close()}
})
test('real reset lost COMMIT rolls back password ticket proof and owned marker before retry',async({page})=>{
 phase('SETUP');const server=await startRealBrowserServer('reset')
 try{
  const proof=await server.rpc({kind:'resetProof'});await form(page);await server.rpc({kind:'failFactorCommit'})
  phase('COMMIT_FAILURE');const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/password/reset');await submit(page,proof.ticket,proof.code)
  expect((await result).status()).toBe(503)
  await expect(page.locator('p[role="status"]')).toContainText('No se pudo confirmar')
  const failed=await server.rpc({kind:'inspectReset'});expect(failed.version==='1' && failed.tickets===0 && failed.codes===0 && failed.active===0).toBe(true)
  phase('RETRY');await submit(page,proof.ticket,proof.code)
  await expect(page.getByRole('link',{name:'Volver al acceso',exact:true})).toBeVisible()
  expect((await server.rpc({kind:'inspectReset'})).version).toBe('2')
 }finally{await server.close()}
})
test('real reset expired ticket never changes credentials',async({page})=>{
 phase('SETUP');const server=await startRealBrowserServer('reset')
 try{
  const proof=await server.rpc({kind:'resetProof'});await server.rpc({kind:'expireReset'});await form(page)
  phase('EXPIRED');const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/password/reset');await submit(page,proof.ticket,proof.code)
  expect((await result).status()).toBe(401)
  expect((await server.rpc({kind:'inspectReset'})).version).toBe('1')
 }finally{await server.close()}
})
test('real reset API rejects CSRF and forged authority then consumes one ticket under concurrency',async({page})=>{
 phase('SETUP');const server=await startRealBrowserServer('reset')
 try{
  const proof=await server.rpc({kind:'resetProof'});await form(page)
  const statuses=await page.evaluate(async input=>{
   const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1]
   const send=async(body:object,csrfToken:string,key=crypto.randomUUID())=>(await fetch('/auth/password/reset',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken,'Idempotency-Key':key},body:JSON.stringify(body)})).status
   const body={ticket:input.ticket,recovery_code:input.code,new_password:input.password}
   const csrfStatus=await send(body,'x'.repeat(43));const forged=await send({...body,tenantId:'11111111-1111-4111-8111-111111111111'},csrf)
   const key=crypto.randomUUID();return [csrfStatus,forged,...await Promise.all([send(body,csrf,key),send(body,csrf,key)])]
  },{...proof,password:replacement})
  phase('STATUS_'+statuses.join('_'))
  expect(statuses.slice(0,2)).toEqual([403,422]);expect(statuses.slice(2).filter(s=>s===200).length).toBe(1)
  expect(statuses.slice(2).filter(s=>s===409).length).toBe(1)
  const state=await server.rpc({kind:'inspectReset'});expect(state.version==='2' && state.tickets===1 && state.codes===1 && state.active===0).toBe(true)
 }finally{await server.close()}
})
