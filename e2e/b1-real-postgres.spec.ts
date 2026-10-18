import {spawnSync} from 'node:child_process'
import {openAuthenticatorApps} from './helpers/authenticator-apps'
import { test, expect } from '@playwright/test'
import { numeric } from '../lib/b1/config'
// @ts-expect-error CI-only JS bridge intentionally has no application import/declaration.
import { startRealBrowserServer } from '../scripts/b1-real-browser-server.mjs'

// No page.route(), synthetic response, injected cookie or browser storage.
// Fixture credentials/keys are ephemeral, not production policy or enrollment approval.
test('real UI password, TOTP, persisted session, step-up, revocation and logout', async ({ page }) => {
  const phase = (description: string) => test.info().annotations.push({ type: 'phase', description })
  phase('INIT_BACKEND')
  const server = await startRealBrowserServer()
  try {
    phase('LOGIN')
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill('u2@fixture.invalid')
    await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
    phase('TOTP')
    const first = await server.rpc({ kind: 'proof' })
    await page.getByLabel('Código', { exact: true }).fill(first.proof)
    await page.getByRole('button', { name: 'Verificar', exact: true }).click()
    await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
    const persisted = await server.rpc({ kind: 'inspect' })
    expect(persisted.counterConsumed === true && persisted.states[0] === 'ACTIVE').toBe(true)
    phase('IDENTITY')
    await page.getByRole('button', { name: 'Mi identidad', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Synthetic A2')
    phase('SESSIONS_FIRST')
    await page.getByRole('button', { name: 'Mis sesiones', exact: true }).click()
    await expect(page.getByText('Synthetic PG05 · Synthetic PG05 (actual)')).toBeVisible()
    phase('SESSIONS_NEXT')
    await page.getByRole('button', { name: 'Cargar más sesiones', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cargar más sesiones', exact: true })).toHaveCount(0)
    const initial = await server.rpc({ kind: 'inspect' })
    await expect(page.getByRole('button', { name: 'Revocar', exact: true })).toHaveCount(initial.expectedSessions)
    phase('REVOKE_INDIVIDUAL')
    // Individual revocation is a real DELETE followed by a fresh signed-cursor traversal.
    await page.getByRole('button', { name: 'Revocar', exact: true }).last().click()
    await expect(page.getByRole('button', { name: 'Revocar', exact: true })).toHaveCount(0)
    phase('SESSIONS_FIRST')
    await page.getByRole('button', { name: 'Mis sesiones', exact: true }).click()
    phase('SESSIONS_NEXT')
    await page.getByRole('button', { name: 'Cargar más sesiones', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Revocar', exact: true })).toHaveCount(initial.expectedSessions - 1)
    await expect(page.getByText('Última actividad', { exact: true }).first()).toBeVisible()
    expect(await page.locator('time').count()).toBeGreaterThanOrEqual(3)
    phase('STEPUP')
    await page.getByRole('button', { name: 'Revocar mis demás sesiones', exact: true }).click()
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    const next = await server.rpc({ kind: 'proof', next: true })
    await page.getByLabel('Código', { exact: true }).fill(next.proof)
    await page.getByRole('button', { name: 'Verificar', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Cambio confirmado.')
    await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
    phase('BULK_RESULT')
    const afterBulk = await server.rpc({ kind: 'inspect' })
    expect(afterBulk.states.filter((state: string) => state === 'ACTIVE').length).toBe(1)
    expect(afterBulk.states.filter((state: string) => state === 'REVOKED').length).toBe(initial.expectedSessions - 1)
    phase('LOGOUT')
    const freshBootstrap = page.waitForNavigation({waitUntil:'domcontentloaded'})
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    expect((await freshBootstrap)!.status()).toBe(200)
    await expect(page.getByLabel('Contraseña')).toBeVisible()
    const final = await server.rpc({ kind: 'inspect' })
    expect(final.states.every((state: string) => state === 'REVOKED')).toBe(true)
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
    const denied = await page.request.get('/auth/me')
    expect(denied.status()).toBe(401)
  } finally { phase('CLEANUP'); await server.close(); phase('CLEANUP_DONE') }
})

test('real first enrollment confirms SHA256 with CAS, recovery codes and committed session', async ({ page }) => {
  const phase = (description: string) => test.info().annotations.push({ type: 'phase', description })
  phase('INIT_ENROLLMENT')
  const server = await startRealBrowserServer('enrollment')
  let apps:ReturnType<typeof openAuthenticatorApps>|undefined,usedCounter=-1
  try {
    phase('LOGIN_NO_METHOD')
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill('u2@fixture.invalid')
    await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Configurar autenticador', exact: true })).toBeVisible()
    await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
    phase('ENROLL_PENDING')
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/mfa/totp/enroll')
    await page.getByRole('button', { name: 'Configurar autenticador', exact: true }).click()
    const enrolled = await response
    expect(enrolled.status()).toBe(200)
    const material = (await enrolled.json()).data
    await expect(page.getByRole('heading', { name: 'Configura tu autenticador' })).toBeVisible()
    const qr = page.getByRole('img', { name: 'Código QR temporal para configurar tu autenticador' })
    await expect(qr).toBeVisible()
    await expect.poll(() => qr.evaluate((element: HTMLCanvasElement) => {
      const pixels=element.getContext('2d')?.getImageData(0,0,element.width,element.height).data
      if (!pixels) return false
      let black=false,white=false
      for(let i=0;i<pixels.length;i+=4) {
        if(pixels[i+3]===255 && pixels[i]===0)black=true
        if(pixels[i+3]===255 && pixels[i]===255)white=true
      }
      return black&&white
    })).toBe(true)
    const pending = await server.rpc({ kind: 'inspectEnrollment' })
    expect(pending.methods[0].state === 'PENDING' && pending.methods[0].bytes === 61 && pending.methods[0].algorithm === 'SHA256').toBe(true)
    expect(pending.recoveryCount).toBe(0)
    phase('INVALID_FIRST_CODE')
    const invalid = await page.request.post('/mfa/totp/confirm', { headers: { Origin: 'https://127.0.0.1:3000', 'Sec-Fetch-Site': 'same-origin',
      'X-CSRF-Token': (await page.context().cookies()).find(c => c.name === '__Host-cleanops_csrf')!.value, 'Idempotency-Key': crypto.randomUUID() },
      data: { enrollment_id: material.enrollment_id, proof: 'invalid' } })
    expect(invalid.status()).toBe(422)
    const { URI, TOTP } = await import('otpauth')
    // Decode the actual rendered QR, not merely the enrollment JSON URI.
    const png=await qr.evaluate((element:HTMLCanvasElement)=>element.toDataURL('image/png'))
    const decoded=spawnSync('zbarimg',['--quiet','--raw','-'],{input:Buffer.from(png.split(',')[1],'base64'),encoding:'utf8',timeout:10000,maxBuffer:8192})
    if(decoded.status!==0)throw Error('SYNTHETIC_QR_DECODE_FAILED')
    const qrUri=decoded.stdout.trim();expect(qrUri).toBe(material.provisioning_uri)
    const authenticator = URI.parse(qrUri)
    if (!(authenticator instanceof TOTP)) throw Error('INVALID_AUTHENTICATOR_TYPE')
    expect(authenticator.algorithm).toBe('SHA256')
    expect(authenticator.issuer).toBe('CleanOps 360')
    const nearby = new Set(Array.from({ length: 2*(numeric('totp_window')+1)+1 }, (_,index) => authenticator.generate({timestamp:Date.now()+(index-numeric('totp_window')-1)*numeric('totp_period')*1000})))
    const badProof = Array.from({length:10},(_,n)=>String(n).padStart(numeric('totp_digits'),'0')).find(code=>!nearby.has(code))!
    const rejected = await page.request.post('/mfa/totp/confirm', {headers:{Origin:'https://127.0.0.1:3000','Sec-Fetch-Site':'same-origin',
      'X-CSRF-Token':(await page.context().cookies()).find(c=>c.name==='__Host-cleanops_csrf')!.value,'Idempotency-Key':crypto.randomUUID()},
      data:{enrollment_id:material.enrollment_id,proof:badProof}})
    expect(rejected.status()).toBe(401)
    const stillPending = await server.rpc({kind:'inspectEnrollment'})
    expect(stillPending.methods[0].state==='PENDING' && stillPending.methods[0].last_totp_counter===null).toBe(true)
    expect(stillPending.recoveryCount).toBe(0)
    if(process.env.B1_TOTP_APP==='INSTALLED_APPLICATIONS'){
      phase('REAL_AUTHENTICATOR_APPLICATIONS')
      apps=openAuthenticatorApps(qrUri)
      // An actual OATH Toolkit application produces the expired code; SQL clocks/window are unchanged.
      let expired=''
      for(let n=3;n<8;n++){const candidate=apps.oathtool(Date.now()-(numeric('totp_window')+n)*numeric('totp_period')*1000);if(!nearby.has(candidate)){expired=candidate;break}}
      expect(expired.length).toBe(numeric('totp_digits'))
      const denied=await page.request.post('/mfa/totp/confirm',{headers:{Origin:'https://127.0.0.1:3000','Sec-Fetch-Site':'same-origin','X-CSRF-Token':(await page.context().cookies()).find(c=>c.name==='__Host-cleanops_csrf')!.value,'Idempotency-Key':crypto.randomUUID()},data:{enrollment_id:material.enrollment_id,proof:expired}})
      expect(denied.status()).toBe(401)
      const state=await server.rpc({kind:'inspectEnrollment'});expect(state.methods[0].state).toBe('PENDING');expect(state.methods[0].last_totp_counter).toBe(null)
    }
    phase('CONFIRM_FIRST_CODE')
    const appStart=Date.now(),firstProof=apps?apps.keepassxc():authenticator.generate(),appEnd=Date.now()
    if(apps){
      const counters=[Math.floor(appStart/(numeric('totp_period')*1000)),Math.floor(appEnd/(numeric('totp_period')*1000))]
      usedCounter=counters.find(counter=>authenticator.generate({timestamp:counter*numeric('totp_period')*1000})===firstProof)??-1
      expect(usedCounter).toBeGreaterThan(0)
    }
    await page.getByLabel('Primer código', { exact: true }).fill(firstProof)
    const confirmed = page.waitForResponse(r => new URL(r.url()).pathname === '/mfa/totp/confirm')
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
    const result = await confirmed
    expect(result.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Códigos de recuperación' })).toBeVisible()
    await expect(page.locator('code')).toHaveCount(10)
    await expect(page.locator('output')).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Código QR temporal para configurar tu autenticador' })).toHaveCount(0)
    const stored = await server.rpc({ kind: 'inspectEnrollment' })
    expect(stored.methods[0].state === 'ACTIVE' && stored.methods[0].last_totp_counter !== null).toBe(true)
    expect(stored.recoveryCount).toBe(10)
    expect(stored.recoveryHmacOnly).toBe(true)
    phase('ONE_TIME_REPLAY_DENIED')
    const replay = await page.request.post('/mfa/totp/confirm', { headers: { Origin: 'https://127.0.0.1:3000', 'Sec-Fetch-Site': 'same-origin',
      'X-CSRF-Token': (await page.context().cookies()).find(c => c.name === '__Host-cleanops_csrf')!.value, 'Idempotency-Key': crypto.randomUUID() },
      data: { enrollment_id: material.enrollment_id, proof: authenticator.generate() } })
    expect([401,403,409]).toContain(replay.status())
    await page.getByRole('button', { name: 'Ya los he guardado', exact: true }).click()
    await expect(page.locator('code')).toHaveCount(0)
    const freshBootstrap = page.waitForNavigation({waitUntil:'domcontentloaded'})
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    expect((await freshBootstrap)!.status()).toBe(200)
    await expect(page.getByLabel('Contraseña')).toBeVisible()
    phase('LOGIN_AFTER_LOGOUT')
    await page.getByLabel('Email', { exact: true }).fill('u2@fixture.invalid')
    await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
    const loginAgain = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/login')
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    expect((await loginAgain).status()).toBe(200)
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    phase('VERIFY_ENROLLED_METHOD_AFTER_LOGIN')
    if(apps){
      // A real next counter, not a future timestamp supplied to a library or weakened CAS.
      const wait=(usedCounter+1)*numeric('totp_period')*1000-Date.now()+200
      if(wait>0)await page.waitForTimeout(wait)
    }
    const loginStart=Date.now(),loginProof=apps?apps.oathtool():authenticator.generate({timestamp:Date.now()+numeric('totp_period')*1000}),loginEnd=Date.now()
    if(apps){expect([authenticator.generate({timestamp:loginStart}),authenticator.generate({timestamp:loginEnd})]).toContain(loginProof);phase('REAL_OATHTOOL_LOGIN')}
    await page.getByLabel('Código', { exact: true }).fill(loginProof)
    const reusedMethod=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/verify')
    await page.getByRole('button',{name:'Verificar',exact:true}).click()
    expect((await reusedMethod).status()).toBe(200)
    await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
    await expect(page.locator('output')).toHaveCount(0)
    await expect(page.locator('code')).toHaveCount(0)
  } finally { phase('CLEANUP'); apps?.close(); await server.close(); phase('CLEANUP_DONE') }
})

test('real ACTIVE additional enrollment requires both grants and preserves rate limiting',async({page})=>{
  // Real canonical counter windows and resend cooldown require up to60s. The old
  // test timeouts are unchanged; no SQL clock/profile/control is weakened.
  test.setTimeout(120000)
  const phase=(description:string)=>test.info().annotations.push({type:'phase',description})
  phase('INIT_ADDITIONAL_ENROLLMENT')
  const server=await startRealBrowserServer('additional')
  try{
    await page.goto('/login')
    await page.getByLabel('Email',{exact:true}).fill('u2@fixture.invalid')
    await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
    await page.getByRole('button',{name:'Continuar',exact:true}).click()
    await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
    const proof=await server.rpc({kind:'proof'})
    await page.getByLabel('Código',{exact:true}).fill(proof.proof)
    await page.getByRole('button',{name:'Verificar',exact:true}).click()
    await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
    const initialCookies=await page.context().cookies(), original=initialCookies.find(c=>c.name==='__Host-cleanops_session')!.value
    phase('STEPUP_ENROLL_05')
    await page.getByRole('button',{name:'Añadir autenticador',exact:true}).click()
    await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
    const authorizeEnrollment=await server.rpc({kind:'proof',next:true})
    await page.getByLabel('Código',{exact:true}).fill(authorizeEnrollment.proof)
    const enrolled=page.waitForResponse(r=>new URL(r.url()).pathname==='/mfa/totp/enroll')
    await page.getByRole('button',{name:'Verificar',exact:true}).click()
    const enrollmentResponse=await enrolled
    expect(enrollmentResponse.status()).toBe(200)
    const material=(await enrollmentResponse.json()).data
    await expect(page.getByRole('img',{name:'Código QR temporal para configurar tu autenticador'})).toBeVisible()
    await expect(page.getByLabel('Primer código',{exact:true})).toHaveCount(0)
    phase('DENY_WITHOUT_CONFIRM_GRANT')
    const premature=await page.request.post('/mfa/totp/confirm',{headers:{Origin:'https://127.0.0.1:3000','Sec-Fetch-Site':'same-origin',
      'X-CSRF-Token':(await page.context().cookies()).find(c=>c.name==='__Host-cleanops_csrf')!.value,'Idempotency-Key':crypto.randomUUID()},
      data:{enrollment_id:material.enrollment_id,proof:'000000'}})
    expect(premature.status()).toBe(403)
    const unconfirmed=await server.rpc({kind:'inspectEnrollment'})
    expect(unconfirmed.methods[0].state==='PENDING' && unconfirmed.methods[0].last_totp_counter===null && unconfirmed.recoveryCount===10).toBe(true)
    phase('STEPUP_CONFIRM_06')
    await page.getByRole('button',{name:'Autorizar confirmación',exact:true}).click()
    await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
    await expect(page.locator('output')).toHaveCount(0)
    phase('WAIT_COUNTER_WINDOW')
    const period=numeric('totp_period')*1000
    await new Promise(resolve=>setTimeout(resolve,period-(Date.now()%period)+100))
    const authorizeConfirmation=await server.rpc({kind:'proof',next:true})
    await page.getByLabel('Código',{exact:true}).fill(authorizeConfirmation.proof)
    await page.getByRole('button',{name:'Verificar',exact:true}).click()
    await expect(page.getByLabel('Primer código',{exact:true})).toBeVisible()
    const {URI,TOTP}=await import('otpauth'),app=URI.parse(material.provisioning_uri)
    if(!(app instanceof TOTP))throw Error('INVALID_AUTHENTICATOR_TYPE')
    phase('CONFIRM_ADDITIONAL_METHOD')
    await page.getByLabel('Primer código',{exact:true}).fill(app.generate())
    const confirmation=page.waitForResponse(r=>new URL(r.url()).pathname==='/mfa/totp/confirm')
    await page.getByRole('button',{name:'Confirmar',exact:true}).click()
    const result=await confirmation
    expect(result.status()).toBe(200)
    await expect(page.locator('code')).toHaveCount(10)
    expect((await page.context().cookies()).find(c=>c.name==='__Host-cleanops_session')!.value===original).toBe(true)
    const stored=await server.rpc({kind:'inspectEnrollment'})
    expect(stored.methods.filter((m:{state:string})=>m.state==='ACTIVE').length).toBe(2)
    expect(stored.recoveryCount===10 && stored.revokedRecoveryCount>=10 && stored.recoveryHmacOnly===true).toBe(true)
    const logout=page.waitForNavigation({waitUntil:'domcontentloaded'})
    await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await logout
    phase('EXPLICIT_MULTI_METHOD_LOGIN')
    await page.getByLabel('Email',{exact:true}).fill('u2@fixture.invalid')
    await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
    const selected=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/login')
    await page.getByRole('button',{name:'Continuar',exact:true}).click()
    const choices=(await(await selected).json()).data
    expect(choices.state).toBe('TOTP_SELECTION_REQUIRED')
    const index=choices.methods.findIndex((m:{method_id:string})=>m.method_id===material.enrollment_id)
    expect(index>=0).toBe(true)
    await page.getByLabel('Aplicación de autenticación '+(index+1)).check()
    const chosenMethod=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/totp/select')
    await page.getByRole('button',{name:'Continuar con este método',exact:true}).click()
    phase('SELECT_STATUS_'+(await chosenMethod).status())
    await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
    await page.getByLabel('Código',{exact:true}).fill(app.generate({timestamp:Date.now()+numeric('totp_period')*1000}))
    const verifiedMethod=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/verify')
    await page.getByRole('button',{name:'Verificar',exact:true}).click()
    const verifiedStatus=(await verifiedMethod).status();phase('VERIFY_STATUS_'+verifiedStatus)
    expect(verifiedStatus).toBe(429)
    await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
    expect((await page.context().cookies()).some(c=>c.name==='__Host-cleanops_session')).toBe(false)
    await expect(page.getByRole('status')).toContainText('Demasiados intentos')
    await expect(page.locator('code')).toHaveCount(0)
  }finally{phase('CLEANUP');await server.close();phase('CLEANUP_DONE')}
})

test('real authorized multi-method selection commits a session for a separate synthetic account',async({page})=>{
 const phase=(description:string)=>test.info().annotations.push({type:'phase',description})
 phase('INIT_MULTIPLE_ACCOUNT')
 const server=await startRealBrowserServer('multiple')
 try{
  await page.goto('/login')
  await page.getByLabel('Email',{exact:true}).fill('multi@fixture.invalid')
  await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
  const login=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/login')
  await page.getByRole('button',{name:'Continuar',exact:true}).click()
  const choice=(await(await login).json()).data
  expect(choice.state).toBe('TOTP_SELECTION_REQUIRED');expect(choice.methods.length).toBe(2)
  await expect(page.getByLabel('Código',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Continuar con este método',exact:true})).toBeDisabled()
  expect((await page.request.get('/auth/me')).status()).toBe(401)
  const primary=await server.rpc({kind:'primaryMethod'}),index=choice.methods.findIndex((m:{method_id:string})=>m.method_id===primary.id)
  expect(index>=0).toBe(true)
  phase('SELECT_AUTHORIZED_METHOD')
  await page.getByLabel('Aplicación de autenticación '+(index+1)).check()
  await page.getByRole('button',{name:'Continuar con este método',exact:true}).click()
  await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
  const proof=await server.rpc({kind:'proof'})
  await page.getByLabel('Código',{exact:true}).fill(proof.proof)
  const verified=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/mfa/verify')
  await page.getByRole('button',{name:'Verificar',exact:true}).click()
  expect((await verified).status()).toBe(200)
  await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
  expect((await page.request.get('/auth/me')).status()).toBe(200)
 }finally{phase('CLEANUP');await server.close();phase('CLEANUP_DONE')}
})
