import { test, expect } from '@playwright/test'
// @ts-expect-error CI-only JS bridge intentionally has no application import/declaration.
import { startRealBrowserServer } from '../scripts/b1-real-browser-server.mjs'

// No page.route(), synthetic response, injected cookie or browser storage.
// Fixture credentials/keys are ephemeral, not production policy or enrollment approval.
test('real UI password, TOTP, persisted session, step-up, revocation and logout', async ({ page }) => {
  const server = await startRealBrowserServer()
  try {
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill('u2@fixture.invalid')
    await page.getByLabel('Contraseña').fill('PG05 synthetic passphrase!')
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    await expect(page.getByText('Seguridad de la cuenta')).toHaveCount(0)
    const first = await server.rpc({ kind: 'proof' })
    await page.getByLabel('Código', { exact: true }).fill(first.proof)
    await page.getByRole('button', { name: 'Verificar', exact: true }).click()
    await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
    const persisted = await server.rpc({ kind: 'inspect' })
    expect(persisted.counterConsumed === true && persisted.states[0] === 'ACTIVE').toBe(true)
    await page.getByRole('button', { name: 'Mi identidad', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Synthetic A2')
    await page.getByRole('button', { name: 'Mis sesiones', exact: true }).click()
    await expect(page.getByText('Synthetic PG05 · Synthetic PG05 (actual)')).toBeVisible()
    await page.getByRole('button', { name: 'Revocar mis demás sesiones', exact: true }).click()
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible()
    const next = await server.rpc({ kind: 'proof', next: true })
    await page.getByLabel('Código', { exact: true }).fill(next.proof)
    await page.getByRole('button', { name: 'Verificar', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Cambio confirmado.')
    await expect(page.getByText('Seguridad de la cuenta')).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await expect(page.getByLabel('Contraseña')).toBeVisible()
    const final = await server.rpc({ kind: 'inspect' })
    expect(final.states.every((state: string) => state === 'REVOKED')).toBe(true)
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
    const denied = await page.request.get('/auth/me')
    expect(denied.status()).toBe(401)
  } finally { await server.close() }
})
