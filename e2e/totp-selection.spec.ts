import { test, expect, type Page } from '@playwright/test'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const expiry = () => new Date(Date.now() + 60_000).toISOString()
const selection = () => ({ state: 'TOTP_SELECTION_REQUIRED', methods: [{ method_id: id, kind: 'TOTP' }, { method_id: other, kind: 'TOTP' }], expires_at: expiry() })
const pending = () => ({ state: 'PENDING_MFA', challenge_id: id, allowed_methods: ['TOTP'], expires_at: expiry() })
const active = () => ({ state: 'ACTIVE', session_id: id, tenant_id: other, absolute_expires_at: expiry() })
const envelope = (data: unknown) => ({ data, meta: { correlation_id: id } })
async function setup(page: Page, data: unknown = selection()) {
  await page.context().addCookies([{ name: '__Host-cleanops_csrf', value: 'a'.repeat(43), url: 'https://127.0.0.1:3000', secure: true, sameSite: 'Strict' }])
  await page.route('**/auth/login', route => route.fulfill({ json: envelope(data) }))
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid')
  await page.getByLabel('Contraseña').fill('fixture-only')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
}
test('selection uses authorized UUID, CSRF, no grant in PREAUTH; double submit and cancellation never bypass MFA', async ({ page }) => {
  let count = 0
  await page.route('**/auth/mfa/totp/select', async route => {
    count++
    expect(route.request().postDataJSON()).toEqual({ totp_method_id: other })
    expect(route.request().headers()['x-csrf-token']).toBe('a'.repeat(43))
    expect(route.request().headers()['idempotency-key']).toMatch(/^[a-zA-Z0-9_-]{16,128}$/)
    await new Promise(resolve => setTimeout(resolve, 150))
    await route.fulfill({ json: envelope(pending()) })
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
    return keys.length === 1 ? route.abort('failed') : route.fulfill({ json: envelope(pending()) })
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
  await page.route('**/auth/step-up', route => route.fulfill({ json: envelope(selection()) }))
  await page.route('**/auth/mfa/totp/select', route => {
    expect(route.request().postDataJSON()).toEqual({ totp_method_id: id, grant_id: 'B1-SELF-04' })
    const { state: _state, ...challenge } = pending()
    void _state
    return route.fulfill({ json: envelope(challenge) })
  })
  await page.route('**/me/sessions/revoke-other-own', route => { effects++; return route.abort() })
  await setup(page, active())
  await page.getByRole('button', { name: 'Revocar mis demás sesiones' }).click()
  await page.getByLabel('Aplicación de autenticación 1').focus()
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Continuar con este método' }).click()
  await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
  expect(effects).toBe(0)
  await page.getByRole('button', { name: 'Cancelar verificación' }).click()
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
  await setup(page, duplicate)
  await expect(page.getByRole('status')).toContainText('No se pudo confirmar')
  await expect(page.getByRole('group', { name: 'Selecciona tu autenticador' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
