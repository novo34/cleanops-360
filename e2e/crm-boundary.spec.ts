import { test, expect } from '@playwright/test'

for (const width of [390, 1440]) {
  test(`private CRM remains closed without fixtures or browser persistence at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 })
    const response = await page.goto('/crm/empresas')
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
