import { test, expect, type Page } from '@playwright/test'
import { numeric } from '../lib/b1/config'
// @ts-expect-error CI-only isolated bridge has no application declaration.
import { startRealBrowserServer } from '../scripts/b1-real-browser-server.mjs'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
}
async function proof(page: Page, code: string) {
  await page.getByLabel('Código', { exact: true }).fill(code)
  await page.getByRole('button', { name: 'Verificar', exact: true }).click()
}
const phase = (description: string) => test.info().annotations.push({ type: 'phase', description })

test('EMAIL enrollment first proof and committed login through real UI API PG', async ({ page }) => {
  phase('SETUP');const server = await startRealBrowserServer('email-enrollment')
  try {
    phase('PASSWORD');await login(page, (await server.rpc({kind:'fixtureEmail'})).email)
    await expect(page.getByRole('button', { name: 'Configurar códigos por email', exact: true })).toBeVisible()
    phase('BEGIN');await page.getByRole('button', { name: 'Configurar códigos por email', exact: true }).click()
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    const pending = await server.rpc({ kind: 'inspectEmail' })
    expect(pending.methods[0].state === 'PENDING' && pending.active === 0 && pending.outbox[0].bytes > 30).toBe(true)
    expect(pending.challenges[0].digest_bytes === 32 && pending.challenges[0].ttl > 290 && pending.challenges[0].ttl <= 300).toBe(true)
    phase('DELIVER');const sent = await server.rpc({ kind: 'deliverEmail' })
    expect(sent.result.state).toBe('FINISHED')
    const wrong = sent.proof.slice(0,5) + (sent.proof[5] === '0' ? '1' : '0')
    phase('INVALID');await proof(page, wrong)
    await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
    expect((await server.rpc({ kind: 'inspectEmail' })).active).toBe(0)
    phase('CONFIRM');await proof(page, sent.proof)
    await expect(page.getByText('Seguridad de la cuenta', { exact: true })).toBeVisible()
    const committed = await server.rpc({ kind: 'inspectEmail' })
    expect(committed.active === 1 && committed.methods[0].state === 'ACTIVE' && committed.outbox[0].bytes === 0).toBe(true)
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  } finally { await server.close() }
})

test('EMAIL ACTIVE enrollment requires independent step-up for begin and confirmation', async ({ page }) => {
  test.setTimeout(140000)
  phase('SETUP');const server = await startRealBrowserServer('email-additional')
  try {
    phase('LOGIN');await login(page, (await server.rpc({kind:'fixtureEmail'})).email)
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    await proof(page,(await server.rpc({kind:'proof'})).proof)
    await expect(page.getByText('Seguridad de la cuenta', { exact: true })).toBeVisible()
    phase('BEGIN_STEPUP');await page.getByRole('button',{name:'Añadir códigos por email',exact:true}).click()
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    await proof(page,(await server.rpc({kind:'proof',next:true})).proof)
    await expect(page.getByRole('button',{name:'Autorizar confirmación email',exact:true})).toBeVisible()
    expect((await server.rpc({kind:'inspectEmail'})).methods[0].state).toBe('PENDING')
    const sent = await server.rpc({kind:'deliverEmail'})
    // Preserve canonical challenge cooldown and TOTP global replay counter.
    await page.waitForTimeout(numeric('otp_resend_cooldown')*1000+200)
    phase('CONFIRM_STEPUP');await page.getByRole('button',{name:'Autorizar confirmación email',exact:true}).click()
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    await proof(page,(await server.rpc({kind:'proof',next:true})).proof)
    phase('FIRST_EMAIL_PROOF');await expect(page.getByText('Introduce el código enviado a tu dirección verificada. No compartas este código.')).toBeVisible()
    await proof(page,sent.proof)
    await expect(page.getByText('Seguridad de la cuenta', { exact: true })).toBeVisible()
    const state=await server.rpc({kind:'inspectEmail'})
    expect(state.methods[0].state==='ACTIVE' && state.active===1).toBe(true)
  } finally { await server.close() }
})

test('EMAIL rate limiting precedes the per-challenge ceiling and blocks a later valid proof', async ({ page }) => {
  phase('SETUP');const server = await startRealBrowserServer('email')
  try {
    await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    const sent=await server.rpc({kind:'deliverEmail'})
    const wrong=sent.proof.slice(0,5)+(sent.proof[5]==='0'?'1':'0')
    phase('EXHAUST')
    const permitted=Math.min(numeric('otp_attempts'),numeric('otp_issue_user_limit')-1)
    for(let i=0;i<permitted;i++) {
      await proof(page,wrong)
      await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
    }
    const state=await server.rpc({kind:'inspectEmail'})
    expect(state.active===0 && state.challenges[0].state==='ISSUED' && state.challenges[0].attempts===permitted).toBe(true)
    await proof(page,sent.proof)
    await expect(page.getByRole('status')).toContainText('Demasiados intentos')
    expect((await server.rpc({kind:'inspectEmail'})).active).toBe(0)
  } finally { await server.close() }
})

test('EMAIL login rejects invalid proof and reenables safe retry after real resend', async ({ page }) => {
  phase('SETUP');const server = await startRealBrowserServer('email')
  try {
    const loginResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/login' && r.request().method()==='POST')
    phase('LOGIN');await login(page, (await server.rpc({kind:'fixtureEmail'})).email)
    const originalChallenge=(await (await loginResponse).json()).data.challenge_id
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    const first = await server.rpc({ kind: 'deliverEmail' })
    phase('COOLDOWN');await page.getByRole('button', { name: 'Reenviar código', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Demasiados intentos')
    await server.rpc({ kind: 'emailClock' })
    phase('RESEND');await page.getByRole('button', { name: 'Reenviar código', exact: true }).click()
    await expect(page.getByRole('status')).not.toContainText('Procesando')
    const second = await server.rpc({ kind: 'deliverEmail' })
    phase('REVOKED_CHALLENGE')
    const revoked=await page.request.post('/auth/mfa/verify',{headers:{Origin:'https://127.0.0.1:3000','Sec-Fetch-Site':'same-origin',
      'X-CSRF-Token':(await page.context().cookies()).find(c=>c.name==='__Host-cleanops_csrf')!.value},data:{challenge_id:originalChallenge,method:'EMAIL_OTP',proof:first.proof}})
    expect(revoked.status()).toBe(422)
    expect((await server.rpc({kind:'inspectEmail'})).challenges.some((c:{state:string})=>c.state==='REVOKED')).toBe(true)
    phase('OLD_PROOF');await proof(page, first.proof)
    await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
    expect((await server.rpc({ kind: 'inspectEmail' })).active).toBe(0)
    phase('CURRENT_PROOF');await proof(page, second.proof)
    await expect(page.getByText('Seguridad de la cuenta', { exact: true })).toBeVisible()
    expect((await server.rpc({ kind: 'inspectEmail' })).active).toBe(1)
    phase('STEPUP');await server.rpc({ kind: 'emailClock' })
    await page.getByRole('button', { name: 'Revocar mis demás sesiones', exact: true }).click()
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    const step = await server.rpc({ kind: 'deliverEmail' });await proof(page, step.proof)
    await expect(page.getByRole('status')).toContainText('Cambio confirmado.')
  } finally { await server.close() }
})

test('EMAIL expired database challenge never creates a session', async ({ page }) => {
  phase('SETUP');const server = await startRealBrowserServer('email')
  try {
    phase('LOGIN');await login(page, (await server.rpc({kind:'fixtureEmail'})).email)
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    const sent = await server.rpc({ kind: 'deliverEmail' })
    await server.rpc({ kind: 'emailClock', expire: true })
    phase('EXPIRED_PROOF');await proof(page, sent.proof)
    await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
    expect((await server.rpc({ kind: 'inspectEmail' })).active).toBe(0)
    await expect(page.getByText('Seguridad de la cuenta', { exact: true })).toHaveCount(0)
  } finally { await server.close() }
})

test('EMAIL uncertain synthetic transport quarantines and cannot redeliver', async ({ page }) => {
  phase('SETUP');const server = await startRealBrowserServer('email')
  try {
    phase('LOGIN');await login(page, (await server.rpc({kind:'fixtureEmail'})).email)
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    phase('UNCERTAIN');await server.rpc({ kind: 'deliverEmail', uncertain: true })
    const next = await server.rpc({ kind: 'deliverEmail' })
    expect(next.result.state).toBe('EMPTY')
    const state = await server.rpc({ kind: 'inspectEmail' })
    expect(state.outbox[0].state === 'QUARANTINED' && state.active === 0).toBe(true)
    await page.getByRole('button', { name: 'Cancelar verificación', exact: true }).click()
    await expect(page.getByLabel('Contraseña')).toBeVisible()
  } finally { await server.close() }
})

test('EMAIL definitive transient rejection retries persisted ciphertext with stable delivery identity', async ({ page }) => {
  phase('SETUP');const server=await startRealBrowserServer('email')
  try {
    await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
    await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
    phase('TRANSIENT');const first=await server.rpc({kind:'deliverEmail',transient:true})
    expect(first.result.outcome).toBe('TRANSIENT')
    const queued=await server.rpc({kind:'inspectEmail'})
    expect(queued.outbox[0].state==='PENDING' && queued.outbox[0].bytes>30 && queued.active===0).toBe(true)
    expect((await server.rpc({kind:'deliverEmail'})).result.state).toBe('EMPTY')
    await server.rpc({kind:'retryMailReady'})
    phase('RETRY');const second=await server.rpc({kind:'deliverEmail'})
    expect(second.result.outcome==='ACCEPTED' && second.sameDeliveryKey && first.proof===second.proof).toBe(true)
    await proof(page,second.proof)
    await expect(page.getByText('Seguridad de la cuenta',{exact:true})).toBeVisible()
    expect((await server.rpc({kind:'inspectEmail'})).outbox[0].bytes).toBe(0)
  } finally {await server.close()}
})

test('EMAIL recipient revoked after issue prevents delivery and session issuance', async ({ page }) => {
  phase('SETUP');const server=await startRealBrowserServer('email')
  try {
    await login(page,(await server.rpc({kind:'fixtureEmail'})).email)
    await expect(page.getByLabel('Código',{exact:true})).toBeVisible()
    const first=await server.rpc({kind:'deliverEmail'})
    await server.rpc({kind:'revokeRecipient'})
    phase('REVOKED');await proof(page,first.proof)
    await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
    expect((await server.rpc({kind:'inspectEmail'})).active).toBe(0)
    expect((await server.rpc({kind:'deliverEmail'})).result.state).toBe('EMPTY')
  } finally {await server.close()}
})

test('EMAIL lost COMMIT rolls back session and proof and permits retry through real UI', async ({ page }) => {
  phase('SETUP');const server = await startRealBrowserServer('email')
  try {
    phase('LOGIN');await login(page, (await server.rpc({kind:'fixtureEmail'})).email)
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    const sent = await server.rpc({ kind: 'deliverEmail' })
    await server.rpc({ kind: 'failEmailCommit' })
    phase('FAILED_COMMIT');await proof(page, sent.proof)
    await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
    expect((await server.rpc({ kind: 'inspectEmail' })).active).toBe(0)
    await expect(page.getByText('Seguridad de la cuenta', { exact: true })).toHaveCount(0)
    phase('RETRY');await proof(page, sent.proof)
    await expect(page.getByText('Seguridad de la cuenta', { exact: true })).toBeVisible()
    expect((await server.rpc({ kind: 'inspectEmail' })).active).toBe(1)
  } finally { await server.close() }
})

test('EMAIL real API rejects CSRF and forged authority and concurrent proof has one winner', async ({ page }) => {
  phase('SETUP');const server = await startRealBrowserServer('email')
  try {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/login' && r.request().method() === 'POST')
    phase('LOGIN');await login(page, (await server.rpc({kind:'fixtureEmail'})).email)
    const challenge = (await (await response).json()).data.challenge_id
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    const sent = await server.rpc({kind:'deliverEmail'})
    phase('NEGATIVES')
    const result = await page.evaluate(async ({challenge,code}) => {
      const csrf = document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1]
      async function submit(body: object, includeCsrf = true) {
        return (await fetch('/auth/mfa/verify', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':includeCsrf?csrf:'A'.repeat(43)}, body:JSON.stringify(body) })).status
      }
      const body = {challenge_id:challenge,method:'EMAIL_OTP',proof:code}
      const csrfDenied = await submit(body,false)
      const authorityDenied = await submit({...body,tenantId:crypto.randomUUID(),methodVersion:'999'})
      const winners = await Promise.all([submit(body),submit(body)])
      return {csrfDenied,authorityDenied,winners}
    },{challenge,code:sent.proof})
    phase('CSRF_'+result.csrfDenied);phase('FORGED_'+result.authorityDenied);phase('RACE_'+result.winners.join('_'))
    const diagnostic=await server.rpc({kind:'diagnostics'})
    for(const item of diagnostic.failures) if(/^[0-9A-Z]{5}$/.test(item.sqlstate))phase('SQL_'+item.sqlstate)
    expect(result.csrfDenied).toBe(403);expect(result.authorityDenied).toBe(422)
    expect(result.winners.filter(s=>s===200).length).toBe(1)
    expect((await server.rpc({kind:'inspectEmail'})).active).toBe(1)
  } finally { await server.close() }
})
