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
    expect(restricted.active===0 && restricted.recoveryBindings===1 && restricted.codes.consumed===1 && restricted.methods.every((m:{state:string})=>m.state==='REVOKED') && restricted.proofFingerprintProtected).toBe(true)
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
    expect(committed.active===1 && committed.recoveryBindings===0 && committed.codes.unused===10 && committed.codes.hmac_only).toBe(true)
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
    expect(failed.codes.consumed===0 && failed.recoveryBindings===0 && failed.active===0 && failed.methods.some((m:{state:string})=>m.state==='ACTIVE')).toBe(true)
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

test('a separate password-only session must not take over an in-progress recovery enrollment',async({page,browser})=>{
  phase('SETUP');const server=await startRealBrowserServer('recovery')
  const outsider=await browser.newContext({ignoreHTTPSErrors:true})
  try{
    const email=(await server.rpc({kind:'fixtureEmail'})).email
    await login(page,email)
    await recover(page,(await server.rpc({kind:'recoveryProof'})).code)
    await expect(page.getByRole('button',{name:'Configurar autenticador',exact:true})).toBeVisible()
    phase('INDEPENDENT_PASSWORD_LOGIN')
    const second=await outsider.newPage();await second.goto('https://127.0.0.1:3000/login')
    await second.getByLabel('Email',{exact:true}).fill(email)
    await second.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
    const result=second.waitForResponse(r=>new URL(r.url()).pathname==='/auth/login')
    await second.getByRole('button',{name:'Continuar',exact:true}).click()
    const response=await result
    if(response.status()!==200){phase('INDEPENDENT_LOGIN_DENIED');expect((await server.rpc({kind:'inspectRecovery'})).active).toBe(0);return}
    const auth=(await response.json()).data
    if(auth.state!=='ENROLLMENT_REQUIRED'){phase('NO_UNBOUND_ENROLLMENT');expect(auth.state).not.toBe('ACTIVE');return}
    phase('UNBOUND_ENROLLMENT_OFFERED')
    const enrolled=second.waitForResponse(r=>new URL(r.url()).pathname==='/mfa/totp/enroll')
    await second.getByRole('button',{name:'Configurar autenticador',exact:true}).click()
    const enrollment=await enrolled
    if(enrollment.status()!==200){phase('UNBOUND_ENROLLMENT_DENIED');return}
    const material=(await enrollment.json()).data
    const {URI,TOTP}=await import('otpauth'),authenticator=URI.parse(material.provisioning_uri)
    if(!(authenticator instanceof TOTP))throw Error('INVALID_AUTHENTICATOR_TYPE')
    await second.getByLabel('Primer código',{exact:true}).fill(authenticator.generate())
    const confirmed=second.waitForResponse(r=>new URL(r.url()).pathname==='/mfa/totp/confirm')
    await second.getByRole('button',{name:'Confirmar',exact:true}).click()
    const status=(await confirmed).status();phase('UNBOUND_CONFIRM_'+status)
    const state=await server.rpc({kind:'inspectRecovery'})
    phase('UNBOUND_ACTIVE_'+state.active)
    expect(status===200 && state.active>0).toBe(false)
  }finally{await outsider.close();await server.close()}
})

test('concurrent first-factor confirmations complete only the authorized recovery once',async({page})=>{
  phase('SETUP');const server=await startRealBrowserServer('recovery')
  try{
    await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
    await recover(page,(await server.rpc({kind:'recoveryProof'})).code)
    await expect(page.getByRole('button',{name:'Configurar autenticador',exact:true})).toBeVisible()
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/mfa/totp/enroll')
    await page.getByRole('button',{name:'Configurar autenticador',exact:true}).click()
    const material=(await (await response).json()).data
    const {URI,TOTP}=await import('otpauth'),authenticator=URI.parse(material.provisioning_uri)
    if(!(authenticator instanceof TOTP))throw Error('INVALID_AUTHENTICATOR_TYPE')
    phase('CONCURRENT_CONFIRM')
    const statuses=await page.evaluate(async proof=>{
      const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1]
      const submit=async()=> (await fetch('/mfa/totp/confirm',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(proof)})).status
      return Promise.all([submit(),submit()])
    },{enrollment_id:material.enrollment_id,proof:authenticator.generate()})
    phase('CONFIRM_'+statuses.join('_'))
    expect(statuses.filter(s=>s===200).length).toBe(1)
    const state=await server.rpc({kind:'inspectRecovery'})
    expect(state.active===1 && state.recoveryBindings===0 && state.codes.unused===10).toBe(true)
  }finally{await server.close()}
})

test('abandoned expired recovery cannot reopen password-only enrollment',async({page,browser})=>{
  phase('SETUP');const server=await startRealBrowserServer('recovery')
  const second=await browser.newContext({ignoreHTTPSErrors:true})
  try{
    const email=(await server.rpc({kind:'fixtureEmail'})).email
    await login(page,email)
    await recover(page,(await server.rpc({kind:'recoveryProof'})).code)
    await expect(page.getByRole('button',{name:'Configurar autenticador',exact:true})).toBeVisible()
    await server.rpc({kind:'expireRecovery'})
    phase('ABANDONED_RESTART')
    const fresh=await second.newPage();await fresh.goto('https://127.0.0.1:3000/login')
    await fresh.getByLabel('Email',{exact:true}).fill(email)
    await fresh.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
    const pending=fresh.waitForResponse(r=>new URL(r.url()).pathname==='/auth/login')
    await fresh.getByRole('button',{name:'Continuar',exact:true}).click()
    expect((await pending).status()).not.toBe(200)
    const state=await server.rpc({kind:'inspectRecovery'})
    expect(state.active===0 && state.recoveryBindings===1 && state.codes.consumed===1).toBe(true)
  }finally{await second.close();await server.close()}
})

test('lost first-factor COMMIT retains recovery binding and allows only the bound retry',async({page})=>{
  phase('SETUP');const server=await startRealBrowserServer('recovery')
  try{
    await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
    await recover(page,(await server.rpc({kind:'recoveryProof'})).code)
    await expect(page.getByRole('button',{name:'Configurar autenticador',exact:true})).toBeVisible()
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/mfa/totp/enroll')
    await page.getByRole('button',{name:'Configurar autenticador',exact:true}).click()
    const material=(await (await response).json()).data
    const {URI,TOTP}=await import('otpauth'),authenticator=URI.parse(material.provisioning_uri)
    if(!(authenticator instanceof TOTP))throw Error('INVALID_AUTHENTICATOR_TYPE')
    await server.rpc({kind:'failFactorCommit'})
    await page.getByLabel('Primer código',{exact:true}).fill(authenticator.generate())
    phase('FIRST_FACTOR_COMMIT_FAILURE')
    const rejected=page.waitForResponse(r=>new URL(r.url()).pathname==='/mfa/totp/confirm')
    await page.getByRole('button',{name:'Confirmar',exact:true}).click()
    const status=(await rejected).status();phase('FIRST_FACTOR_STATUS_'+status)
    const diagnostic=await server.rpc({kind:'diagnostics'})
    for(const entry of diagnostic.failures)phase('SQL_'+entry.sqlstate)
    const failed=await server.rpc({kind:'inspectRecovery'})
    phase('ACTIVE_'+failed.active+'_BINDINGS_'+failed.recoveryBindings)
    expect(status).toBe(503)
    phase('STATUS_MATCHES_'+await page.getByRole('status').count())
    await expect(page.locator('p[role="status"]')).toContainText('No se pudo confirmar')
    expect(failed.active===0 && failed.recoveryBindings===1 && failed.methods.every((m:{state:string})=>m.state!=='ACTIVE')).toBe(true)
    phase('BOUND_FIRST_FACTOR_RETRY')
    await page.getByLabel('Primer código',{exact:true}).fill(authenticator.generate())
    await page.getByRole('button',{name:'Confirmar',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Códigos de recuperación',exact:true})).toBeVisible()
    const committed=await server.rpc({kind:'inspectRecovery'})
    expect(committed.active===1 && committed.recoveryBindings===0 && committed.codes.unused===10).toBe(true)
  }finally{await server.close()}
})
