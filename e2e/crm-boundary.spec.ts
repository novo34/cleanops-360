import { test, expect } from '@playwright/test'
import { createTranslator, locales } from '../lib/i18n'

for (const width of [390, 1440]) {
  test(`private CRM remains closed without fixtures or browser persistence at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 })
    const response = await page.goto('/crm/empresas?lang=es')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Empresas', exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByRole('alert')).toContainText('El servicio no está disponible')
    await expect(page.getByRole('button', { name: 'Nueva empresa' })).toBeDisabled()
    await expect(page.getByText('Maison des Rives')).toHaveCount(0)
    await page.getByRole('link', { name: 'Clientes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 })
    expect(await page.context().cookies()).toEqual([])
    for (const path of ['/auth/crm/companies', '/auth/crm/company?company_id=11111111-1111-4111-8111-111111111111']) {
      const result = await request.get(path)
      expect(result.status()).toBe(503)
      expect(result.headers()['set-cookie']).toBeUndefined()
      expect(result.headers()['cache-control']).toContain('no-store')
    }
  })
}

test('CRM language changes use the same server locale, keep user input and regional settings, and fit long text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/crm/empresas?lang=es&format=de-CH')
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  await page.getByRole('searchbox').fill('María Cliente <sin traducir>')
  for (const locale of locales) {
    await page.locator('nav select').selectOption(locale)
    await expect(page.locator('.crm-workspace')).toHaveAttribute('lang', locale)
    const t = createTranslator(locale)
    await expect(page.getByRole('heading', { name: t('crm.companies'), exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(t('crm.errorUnavailable'))
    await expect(page.getByRole('searchbox')).toHaveValue('María Cliente <sin traducir>')
    expect(new URL(page.url()).searchParams.get('format')).toBe('de-CH')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.getByRole('link', { name: 'Klientët', exact: true }).click()
  await expect(page.locator('.crm-workspace')).toHaveAttribute('lang', 'sq')
  expect(new URL(page.url()).searchParams.get('lang')).toBe('sq')
})

test('SSR negotiates a supported UI language and does not silently use French or a global fallback', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-CH' })
  const page = await context.newPage()
  await page.goto('/crm/empresas')
  await expect(page.locator('.crm-workspace')).toHaveAttribute('lang', 'de')
  await expect(page.getByRole('heading', { name: 'Unternehmen', exact: true })).toBeVisible()
  await page.goto('/crm/empresas?lang=fr')
  await expect(page.getByRole('heading', { name: 'CleanOps 360', exact: true })).toBeVisible()
  for (const name of ['Deutsch', 'Español', 'English', 'Italiano', 'Português', 'Shqip']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
  await expect(page.locator('nav select')).toHaveCount(0)
  await context.close()
})
