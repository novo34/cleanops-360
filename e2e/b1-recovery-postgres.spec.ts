import { test, expect, type Page } from '@playwright/test'
// @ts-expect-error Isolated test IPC bridge, never an app dependency.
import { startRealBrowserServer } from '../scripts/b1-real-browser-server.mjs'

const phase=(description:string)=>test.info().annotations.push({type:'phase',description})
async function login(page:Page,email:string){
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email)
  await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
  await page.getByRole('button',{name:'Continuar',exact:true}).click()
  await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click()
}
async function recover(page:Page,code:string){
  await page.getByLabel('Código de recuperación',{exact:true}).fill(code)
  await page.getByRole('button',{name:'Recuperar y configurar MFA',exact:true}).click()
}
test('real recovery code rotates restricted PREAUTH and requires new first factor before session',async({page})=>{
  phase('SETUP');const server=await startRealBrowserServer('recovery')
  try{
    await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
    const code=(await server.rpc({kind:'recoveryProof'})).code
    const before=await server.rpc({kind:'inspectRecovery'})
    phase('INVALID');await recover(page,(code[0]==='A'?'B':'A')+code.slice(1))
    await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
    expect((await server.rpc({kind:'inspectRecovery'})).codes.consumed).toBe(0)
    const old=(await page.context().cookies()).find(c=>c.name==='__Host-cleanops_preauth')!.value
    phase('RECOVER');await recover(page,code)
    await expect(page.getByRole('button',{name:'Configurar autenticador',exact:true})).toBeVisible()
    const next=(await page.context().cookies()).find(c=>c.name==='__Host-cleanops_preauth')!.value
    expect(old!==next).toBe(true)
    const restricted=await server.rpc({kind:'inspectRecovery'})
    expect(restricted.active===0 && restricted.codes.consumed===1 && restricted.methods.every((m:{state:string})=>m.state==='REVOKED') && restricted.proofFingerprintProtected).toBe(true)
    const pending=restricted.preauth.find((p:{state:string})=>p.state==='ENROLLMENT_REQUIRED')
    expect(pending.expires_at===before.preauth.find((p:{state:string})=>p.state==='PENDING_MFA').expires_at).toBe(true)
    phase('REENROLL')
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/mfa/totp/enroll')
    await page.getByRole('button',{name:'Configurar autenticador',exact:true}).click()
    const material=(await (await response).json()).data
    const { URI,TOTP }=await import('otpauth'),authenticator=URI.parse(material.provisioning_uri)
    if(!(authenticator instanceof TOTP))throw Error('INVALID_AUTHENTICATOR_TYPE')
    await page.getByLabel('Primer código',{exact:true}).fill(authenticator.generate())
    phase('FIRST_FACTOR');await page.getByRole('button',{name:'Confirmar',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Códigos de recuperación',exact:true})).toBeVisible()
    const committed=await server.rpc({kind:'inspectRecovery'})
    expect(committed.active===1 && committed.codes.unused===10 && committed.codes.hmac_only).toBe(true)
    expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0)
  }finally{await server.close()}
})

test('real recovery COMMIT failure rolls back code and revocations before a safe retry',async({page})=>{
  phase('SETUP');const server=await startRealBrowserServer('recovery')
  try{
    await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
    const code=(await server.rpc({kind:'recoveryProof'})).code
    await server.rpc({kind:'failFactorCommit'})
    phase('COMMIT_FAILURE');await recover(page,code)
    await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
    const failed=await server.rpc({kind:'inspectRecovery'})
    expect(failed.codes.consumed===0 && failed.active===0 && failed.methods.some((m:{state:string})=>m.state==='ACTIVE')).toBe(true)
    phase('RETRY');await recover(page,code)
    await expect(page.getByRole('button',{name:'Configurar autenticador',exact:true})).toBeVisible()
    expect((await server.rpc({kind:'inspectRecovery'})).codes.consumed).toBe(1)
  }finally{await server.close()}
})

test('real expired password proof cannot consume a recovery code',async({page})=>{
  phase('SETUP');const server=await startRealBrowserServer('recovery')
  try{
    await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
    const code=(await server.rpc({kind:'recoveryProof'})).code
    await server.rpc({kind:'expireRecovery'})
    phase('EXPIRED');await recover(page,code)
    await expect(page.getByLabel('Contraseña')).toBeVisible()
    const state=await server.rpc({kind:'inspectRecovery'})
    expect(state.codes.consumed===0 && state.active===0).toBe(true)
  }finally{await server.close()}
})

test('real concurrent recovery requests have one winner and never create ACTIVE',async({page})=>{
  phase('SETUP');const server=await startRealBrowserServer('recovery')
  try{
    await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
    const code=(await server.rpc({kind:'recoveryProof'})).code
    phase('CONCURRENT')
    const statuses=await page.evaluate(async code=>{
      const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1]
      const request=async()=> (await fetch('/auth/recovery/consume',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({recovery_code:code})})).status
      return Promise.all([request(),request()])
    },code)
    phase('RESULT_'+statuses.join('_'))
    expect(statuses.filter(s=>s===200).length).toBe(1)
    const state=await server.rpc({kind:'inspectRecovery'})
    expect(state.active===0 && state.codes.consumed===1 && state.preauth.filter((p:{state:string})=>p.state==='ENROLLMENT_REQUIRED').length===1).toBe(true)
  }finally{await server.close()}
})
