import { test, expect, type Page, type Route } from '@playwright/test'

import { contract, operations, valid } from '../lib/b1/contracts'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const expiry = () => new Date(Date.now() + 60_000).toISOString()
const selection = () => ({ state: 'TOTP_SELECTION_REQUIRED', methods: [{ method_id: id, kind: 'TOTP' }, { method_id: other, kind: 'TOTP' }], expires_at: expiry() })
const pending = () => ({ state: 'PENDING_MFA', challenge_id: id, allowed_methods: ['TOTP'], expires_at: expiry() })
const active = () => ({ state: 'ACTIVE', session_id: id, tenant_id: other, absolute_expires_at: expiry() })
const envelope = (data: unknown) => ({ data, meta: { correlation_id: id } })
const origin = 'https://127.0.0.1:3000'
const errorEnvelope = () => ({ error: { code: 'CONFLICT', message: 'No se pudo completar la solicitud.', details: [] }, correlation_id: id })
// Positive fixtures check both request and published response contracts. Negative tests deliberately bypass this helper.
async function succeed(route: Route, operation: string, data: unknown, csrf?: string) {
  const op = operations.find(value => value.operationId === operation)!
  const request = route.request()
  expect(request.method()).toBe(op.method)
  expect(new URL(request.url()).pathname).toBe(op.path)
  if (op.requestBody) expect(valid(op.requestBody.content['application/json'].schema, request.postDataJSON())).toBe(true)
  const headers = await request.allHeaders()
  for (const parameter of op.parameters.filter(value => value.in === 'header' && value.required)) {
    expect(valid(parameter.schema, headers[parameter.name.toLowerCase()])).toBe(true)
  }
  if (op.method !== 'GET') {
    expect(headers.origin).toBe(origin)
    // Fetch Metadata is browser-generated after Playwright interception; checked on the real TLS wire below.
    expect(headers.cookie).toContain('__Host-cleanops_csrf=' + headers['x-csrf-token'])
    expect(headers.cookie).toContain(operation === 'login' || !headers.cookie.includes('__Host-cleanops_session=') ? '__Host-cleanops_preauth=' : '__Host-cleanops_session=')
  }
  expect(valid(op.responses['200'].content['application/json'].schema, envelope(data))).toBe(true)
  await route.fulfill({ status: 200, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie',
    ...(csrf ? { 'Set-Cookie': '__Host-cleanops_csrf=' + csrf + '; Path=/; Secure; SameSite=Lax' } : {}) }, json: envelope(data) })
}
async function setup(page: Page, data: unknown = selection(), invalid = false) {
  // Simulated bootstrap binding, never a real identity. HttpOnly binding + readable CSRF.
  await page.context().addCookies([
    { name: '__Host-cleanops_csrf', value: 'a'.repeat(43), url: origin, secure: true, sameSite: 'Lax' },
    { name: '__Host-cleanops_preauth', value: 'b'.repeat(43), url: origin, secure: true, sameSite: 'Lax', httpOnly: true },
  ])
  await page.route('**/auth/login', async route => {
    await page.context().addCookies([{ name: '__Host-cleanops_preauth', value: 'p'.repeat(43), url: origin, secure: true, sameSite: 'Lax', httpOnly: true }])
    if (invalid) await route.fulfill({ json: envelope(data) })
    else {
      expect((data as { state?: string }).state).not.toBe('ACTIVE') // Explicit service.ts invariant, stricter than the shared AuthResult schema.
      await succeed(route, 'login', data, 'c'.repeat(43))
    }
  })
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid')
  await page.getByLabel('Contraseña').fill('fixture-only')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
}
async function setupActive(page: Page, auth = active()) {
  await setup(page, pending())
  await page.route('**/auth/mfa/verify', async route => {
    await page.context().clearCookies({ name: '__Host-cleanops_preauth' })
    await page.context().addCookies([{ name: '__Host-cleanops_session', value: 's'.repeat(43), url: origin, secure: true, sameSite: 'Lax', httpOnly: true }])
    await succeed(route, 'verifyMfa', auth, 'd'.repeat(43))
  })
  await page.getByLabel('Código', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verificar', exact: true }).click()
  await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
  return auth
}
test('selection uses authorized UUID, CSRF, no grant in PREAUTH; double submit and cancellation never bypass MFA', async ({ page }) => {
  let count = 0
  await page.route('**/auth/mfa/totp/select', async route => {
    count++
    expect(route.request().postDataJSON()).toEqual({ totp_method_id: other })
    expect(route.request().headers()['x-csrf-token']).toBe('c'.repeat(43))
    expect(route.request().headers()['idempotency-key']).toMatch(/^[a-zA-Z0-9_-]{16,128}$/)
    await new Promise(resolve => setTimeout(resolve, 150))
    await succeed(route, 'selectTotpMethod', pending())
  })
  await setup(page)
  await expect(page.getByRole('button', { name: 'Continuar con este método' })).toBeDisabled()
  await page.getByLabel('Aplicación de autenticación 2').check()
  await page.getByRole('button', { name: 'Continuar con este método' }).dblclick()
  await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
  expect(count).toBe(1)
  await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancelar verificación' }).click()
  await expect(page.getByLabel('Contraseña')).toBeVisible()
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
})
test('network retry preserves idempotency key and validates response before navigation', async ({ page }) => {
  const keys: string[] = []
  await page.route('**/auth/mfa/totp/select', route => {
    keys.push(route.request().headers()['idempotency-key'])
    return keys.length === 1 ? route.abort('failed') : succeed(route, 'selectTotpMethod', pending())
  })
  await setup(page)
  await page.getByLabel('Aplicación de autenticación 1').check()
  await page.getByRole('button', { name: 'Continuar con este método' }).click()
  await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
  await page.getByRole('button', { name: 'Continuar con este método' }).click()
  await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1])
})
for (const scenario of ['revoked', 'invalid', 'expired'] as const) {
  test(scenario + ' remains closed', async ({ page }) => {
    await page.route('**/auth/mfa/totp/select', route => route.fulfill(scenario === 'revoked'
      ? { status: 409, json: { error: { code: 'CONFLICT', message: 'private provider detail', details: [] }, correlation_id: id } }
      : { json: envelope(scenario === 'invalid' ? { ...pending(), ciphertext: 'must-not-render' } : { ...pending(), expires_at: '2000-01-01T00:00:00Z' }) }))
    await setup(page)
    await page.getByLabel('Aplicación de autenticación 1').check()
    await page.getByRole('button', { name: 'Continuar con este método' }).click()
    await expect(page.getByRole('status')).not.toHaveText('')
    await expect(page.getByRole('status')).not.toContainText('Procesando')
    await expect(page.getByLabel('Código', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
    await expect(page.getByText('private provider detail')).toHaveCount(0)
  })
}
test('expiry clears selection; single-method login keeps existing challenge flow', async ({ page }) => {
  await setup(page, { ...selection(), expires_at: new Date(Date.now() + 2500).toISOString() })
  await expect(page.getByRole('group', { name: 'Selecciona tu autenticador' })).toBeVisible()
  await expect(page.getByLabel('Contraseña')).toBeVisible({ timeout: 6000 })
  await setup(page, pending())
  await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Selecciona tu autenticador' })).toHaveCount(0)
})
test('ACTIVE step-up retains exact grant, keyboard selection, only verifies before protected action', async ({ page }) => {
  let effects = 0
  await page.route('**/auth/step-up', route => succeed(route, 'startStepUp', selection()))
  await page.route('**/auth/mfa/totp/select', route => {
    expect(route.request().postDataJSON()).toEqual({ totp_method_id: id, grant_id: 'B1-SELF-04' })
    const { state: _state, ...challenge } = pending()
    void _state
    return succeed(route, 'selectTotpMethod', challenge)
  })
  await page.route('**/me/sessions/revoke-other-own', route => { effects++; return route.abort() })
  await setupActive(page)
  await page.getByRole('button', { name: 'Revocar mis demás sesiones' }).click()
  await page.getByLabel('Aplicación de autenticación 1').focus()
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Continuar con este método' }).click()
  await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
  expect(effects).toBe(0)
  await page.route('**/auth/mfa/verify', route => route.fulfill({ json: envelope(pending()) }))
  await page.getByLabel('Código', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verificar', exact: true }).click()
  await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Respuesta no válida')
  expect(effects).toBe(0)
})

test('cancel selection on mobile sends no challenge request; duplicate method response is rejected', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 })
  let requests = 0
  await page.route('**/auth/mfa/totp/select', route => { requests++; return route.abort() })
  await setup(page)
  await page.getByRole('button', { name: 'Cancelar verificación' }).click()
  await expect(page.getByLabel('Contraseña')).toBeVisible()
  expect(requests).toBe(0)
  const duplicate = selection()
  duplicate.methods[1] = duplicate.methods[0]
  await setup(page, duplicate, true)
  await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
  await expect(page.getByRole('group', { name: 'Selecciona tu autenticador' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const status of [401, 403, 409, 410, 429]) {
  for (const stage of ['start', 'select', 'verify'] as const) {
    test('ACTIVE ' + stage + ' HTTP ' + status + ' keeps only the authorized context', async ({ page }) => {
      let effects = 0
      await setupActive(page)
      await page.route('**/me/sessions/revoke-other-own', route => { effects++; return route.abort() })
      const failure = (route: Route) => route.fulfill({ status, headers: status === 429 ? { 'Retry-After': '1' } : {}, json: errorEnvelope() })
      await page.route('**/auth/step-up', route => stage === 'start' ? failure(route) : succeed(route, 'startStepUp', selection()))
      await page.route('**/auth/mfa/totp/select', route => stage === 'select' ? failure(route) : succeed(route, 'selectTotpMethod', { challenge_id: id, allowed_methods: ['TOTP'], expires_at: expiry() }))
      await page.route('**/auth/mfa/verify', failure)
      await page.getByRole('button', { name: 'Revocar mis demás sesiones' }).click()
      if (stage !== 'start') {
        await page.getByLabel('Aplicación de autenticación 1').check()
        await page.getByRole('button', { name: 'Continuar con este método' }).click()
      }
      if (stage === 'verify') {
        await page.getByLabel('Código', { exact: true }).fill('123456')
        await page.getByRole('button', { name: 'Verificar', exact: true }).click()
      }
      if (status === 401) await expect(page.getByLabel('Contraseña')).toBeVisible()
      else if (status === 429 && stage !== 'start') {
        await expect(page.getByRole('status')).toContainText('Demasiados intentos')
        await page.getByRole('button', { name: 'Cancelar verificación' }).click()
        await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
      } else await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
      expect(effects).toBe(0)
    })
  }
}
for (const scenario of ['201', '202', '204', 'redirect', 'json', 'schema', 'content-type', 'wrong-factor', 'wrong-mode'] as const) {
  test('PREAUTH rejects unexpected ' + scenario + ' without advancing', async ({ page }) => {
    let redirected = 0
    await page.route('**/auth/mfa/verify', route => { redirected++; return route.fulfill({ json: envelope(pending()) }) })
    await page.route('**/auth/mfa/totp/select', route => {
      if (scenario === 'json') return route.fulfill({ contentType: 'application/json', body: '{' })
      if (scenario === 'content-type') return route.fulfill({ contentType: 'text/html', body: JSON.stringify(envelope(pending())) })
      if (scenario === 'redirect') return route.fulfill({ status: 302, headers: { Location: '/auth/mfa/verify' } })
      if (scenario === '204') return route.fulfill({ status: 204 })
      const value = scenario === 'schema' ? { ...pending(), private_secret: 'must-not-render' }
        : scenario === 'wrong-factor' ? { ...pending(), allowed_methods: ['EMAIL_OTP'] }
        : scenario === 'wrong-mode' ? { challenge_id: id, allowed_methods: ['TOTP'], expires_at: expiry() } : pending()
      return route.fulfill({ status: scenario === '201' || scenario === '202' ? Number(scenario) : 200, json: envelope(value) })
    })
    await setup(page)
    await page.getByLabel('Aplicación de autenticación 1').check()
    await page.getByRole('button', { name: 'Continuar con este método' }).click()
    await expect(page.getByRole('status')).not.toHaveText('')
    await expect(page.getByRole('status')).not.toContainText('Procesando')
    await expect(page.getByLabel('Código', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
    await expect(page.getByText('must-not-render')).toHaveCount(0)
    expect(redirected).toBe(0)
  })
}
for (const malformed of [true, false]) {
  test('401 invalidates ACTIVE independently of error JSON ' + malformed, async ({ page }) => {
    await setupActive(page)
    await page.route('**/auth/step-up', route => route.fulfill({ status: 401, contentType: 'application/json', body: malformed ? '{' : JSON.stringify({ not_an_error: true }) }))
    await page.getByRole('button', { name: 'Revocar mis demás sesiones' }).click()
    await expect(page.getByLabel('Contraseña')).toBeVisible()
    await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
  })
}
for (const reason of ['cancel', 'expire'] as const) {
  test('late invalid JSON after ' + reason + ' cannot overwrite ceremony state', async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.fetch.bind(window)
      window.fetch = async (...args) => {
        const response = await original(...args)
        if (String(args[0]).includes('/auth/mfa/totp/select')) {
          const parse = response.json.bind(response)
          response.json = async () => {
            await new Promise<void>(resolve => window.addEventListener('release-fixture-json', () => resolve(), { once: true }))
            return parse()
          }
        }
        return response
      }
    })
    await page.route('**/auth/mfa/totp/select', route => route.fulfill({ contentType: 'application/json', body: '{' }))
    await setup(page, { ...selection(), expires_at: new Date(Date.now() + 3000).toISOString() })
    await page.getByLabel('Aplicación de autenticación 1').check()
    const response = page.waitForResponse('**/auth/mfa/totp/select')
    await page.getByRole('button', { name: 'Continuar con este método' }).click()
    await response
    if (reason === 'cancel') await page.getByRole('button', { name: 'Cancelar verificación' }).click()
    await expect(page.getByLabel('Contraseña')).toBeVisible({ timeout: 6000 })
    const notice = await page.getByRole('status').textContent()
    await page.evaluate(() => window.dispatchEvent(new Event('release-fixture-json')))
    // A new request must remain busy while an obsolete request finishes.
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    await page.route('**/auth/login', async route => { await held; await succeed(route, 'login', selection()) })
    await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid')
    await page.getByLabel('Contraseña').fill('fixture-only')
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Procesando…')
    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled()
    expect(notice).toContain(reason === 'cancel' ? 'cancelada' : 'caducado')
    release()
    await expect(page.getByRole('group', { name: 'Selecciona tu autenticador' })).toBeVisible()
    await expect(page.getByLabel('Código', { exact: true })).toHaveCount(0)
  })
}
for (const scenario of ['tenant', 'session', 'extended-expiry'] as const) {
  test('step-up rejects mismatched ACTIVE ' + scenario, async ({ page }) => {
    let effects = 0
    const original = await setupActive(page)
    await page.route('**/me/sessions/revoke-other-own', route => { effects++; return route.abort() })
    await page.route('**/auth/step-up', route => succeed(route, 'startStepUp', { challenge_id: id, allowed_methods: ['TOTP'], expires_at: expiry() }))
    const mismatched = { ...original, ...(scenario === 'tenant' ? { tenant_id: id } : scenario === 'session' ? { session_id: other } : { absolute_expires_at: new Date(Date.parse(original.absolute_expires_at) + 1000).toISOString() }) }
    await page.route('**/auth/mfa/verify', route => route.fulfill({ json: envelope(mismatched) }))
    await page.getByRole('button', { name: 'Revocar mis demás sesiones' }).click()
    await page.getByLabel('Código', { exact: true }).fill('123456')
    await page.getByRole('button', { name: 'Verificar', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Respuesta no válida')
    await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
    expect(effects).toBe(0)
  })
}
test('successful TOTP selection and step-up execute exactly one authorized action', async ({ page }) => {
  let effects = 0
  const original = await setupActive(page)
  await page.route('**/auth/step-up', route => succeed(route, 'startStepUp', selection()))
  await page.route('**/auth/mfa/totp/select', route => succeed(route, 'selectTotpMethod', { challenge_id: id, allowed_methods: ['TOTP'], expires_at: expiry() }))
  await page.route('**/auth/mfa/verify', route => succeed(route, 'verifyMfa', original))
  await page.route('**/me/sessions/revoke-other-own', route => { effects++; return succeed(route, 'revokeOtherOwnSessions', { state: 'REVOKED', revoked_count: 2 }) })
  await page.getByRole('button', { name: 'Revocar mis demás sesiones' }).click()
  await page.getByLabel('Aplicación de autenticación 1').check()
  await page.getByRole('button', { name: 'Continuar con este método' }).click()
  await page.getByLabel('Código', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verificar', exact: true }).dblclick()
  await expect(page.getByRole('status')).toHaveText('Cambio confirmado.')
  expect(effects).toBe(1)
})
test('LOGIN cannot issue ACTIVE; expired ACTIVE is not retained', async ({ page }) => {
  await setup(page, active(), true)
  await expect(page.getByRole('status')).toContainText('Respuesta no válida')
  await expect(page.getByLabel('Contraseña')).toBeVisible()
  await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
  await page.clock.install()
  await setupActive(page)
  await page.clock.fastForward(61_000)
  await expect(page.getByLabel('Contraseña')).toBeVisible()
})
test('positive fixture shapes and error envelope match published HTTP schemas', () => {
  expect(valid(contract.components.schemas.Error, errorEnvelope())).toBe(true)
  for (const [operation, data] of [['login', selection()], ['login', pending()], ['verifyMfa', active()], ['startStepUp', selection()], ['selectTotpMethod', pending()]] as const) {
    const op = operations.find(value => value.operationId === operation)!
    expect(valid(op.responses['200'].content['application/json'].schema, envelope(data))).toBe(true)
  }
})

test('lost step-up response and 429 selection retry preserve their own idempotency keys', async ({ page }) => {
  await setupActive(page)
  const starts: string[] = []
  const selects: string[] = []
  await page.route('**/auth/step-up', route => {
    starts.push(route.request().headers()['idempotency-key'])
    return starts.length === 1 ? route.abort('failed') : succeed(route, 'startStepUp', selection())
  })
  await page.route('**/auth/mfa/totp/select', route => {
    selects.push(route.request().headers()['idempotency-key'])
    return selects.length === 1 ? route.fulfill({ status: 429, headers: { 'Retry-After': '1' }, json: errorEnvelope() })
      : succeed(route, 'selectTotpMethod', { challenge_id: id, allowed_methods: ['TOTP'], expires_at: expiry() })
  })
  await page.getByRole('button', { name: 'Revocar mis demás sesiones' }).click()
  await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
  await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
  await page.getByRole('button', { name: 'Revocar mis demás sesiones' }).click()
  await page.getByLabel('Aplicación de autenticación 1').check()
  await page.getByRole('button', { name: 'Continuar con este método' }).click()
  await expect(page.getByRole('status')).toContainText('Demasiados intentos')
  await page.getByRole('button', { name: 'Continuar con este método' }).click()
  await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
  expect(starts).toHaveLength(2); expect(starts[0]).toBe(starts[1])
  expect(selects).toHaveLength(2); expect(selects[0]).toBe(selects[1])
  expect(starts[0]).not.toBe(selects[0])
})

test('real TLS wire carries same-origin Fetch Metadata and rotated CSRF cookies', async ({ page }) => {
  await setup(page)
  const evidence = await page.evaluate(async () => {
    const csrf = document.cookie.split('; ').find(cookie => cookie.startsWith('__Host-cleanops_csrf='))?.split('=')[1] ?? ''
    const response = await fetch('/__b1_fixture_probe', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf } })
    return { secureContext: window.isSecureContext, evidence: await response.json(), visibleCookies: document.cookie }
  })
  expect(evidence.secureContext).toBe(true)
  expect(evidence.evidence).toEqual({ sameOrigin: true, sameSite: true, csrfMatches: true, bindingPresent: true })
  expect(evidence.visibleCookies).not.toContain('__Host-cleanops_preauth=')
  expect(evidence.visibleCookies).not.toContain('__Host-cleanops_session=')
})

for (const ceremony of ['selection', 'challenge'] as const) {
  test('expired ACTIVE step-up ' + ceremony + ' clears pending action but preserves source session', async ({ page }) => {
    await page.clock.install()
    await setupActive(page)
    let effects = 0
    const expires_at = new Date(Date.now() + 3000).toISOString()
    await page.route('**/auth/step-up', route => succeed(route, 'startStepUp', ceremony === 'selection'
      ? { ...selection(), expires_at } : { challenge_id: id, allowed_methods: ['TOTP'], expires_at }))
    await page.route('**/me/sessions/revoke-other-own', route => { effects++; return route.abort() })
    await page.getByRole('button', { name: 'Revocar mis demás sesiones' }).click()
    if (ceremony === 'selection') await expect(page.getByRole('group', { name: 'Selecciona tu autenticador' })).toBeVisible()
    else await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    await page.clock.fastForward(4000)
    await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('caducado')
    await expect(page.getByLabel('Contraseña')).toHaveCount(0)
    await expect(page.getByLabel('Código', { exact: true })).toHaveCount(0)
    expect(effects).toBe(0)
  })
}
