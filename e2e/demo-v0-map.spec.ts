import { test, expect } from '@playwright/test'

const evidence = 'docs/implementation/demo-v0/evidence'
test('local geographic map renders under unchanged CSP and interacts with existing details', async ({ page }) => {
  const errors: string[] = [], external: string[] = [], privateRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(request.url())
    if (/^\/(auth|api|me|mfa)(\/|$)/.test(url.pathname)) privateRequests.push(url.pathname)
  })
  const response = await page.goto('/demo')
  expect(response?.headers()['content-security-policy']).toContain("connect-src 'self'")
  await expect(page.locator('.demo-map-marker')).toHaveCount(3)
  await expect(page.locator('.demo-map-loading')).toHaveCount(0)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByLabel('Periodo del mapa').selectOption('week')
  await expect(page.locator('.demo-map-marker')).toHaveCount(7)
  await page.getByLabel('Filtrar mapa').selectOption('issues')
  await expect(page.locator('.demo-map-marker')).toHaveCount(3)
  await page.getByLabel('Filtrar mapa').selectOption('all')
  await expect(page.locator('.demo-map-marker')).toHaveCount(7)
  const point = page.locator('.demo-map-marker').first()
  await point.focus()
  await page.keyboard.press('Enter')
  await expect(point).toBeFocused()
  await expect(point).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Servicio seleccionado' })).toContainText('Preparación de espacios')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: evidence + '/map-selected-dark.png', fullPage: true })
  await page.getByRole('button', { name: 'Ver ficha del servicio' }).click()
  await expect(page.getByRole('dialog')).toContainText('Maison des Rives')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Ver ficha del servicio' })).toBeFocused()
  await page.getByRole('button', { name: 'Acercar mapa' }).click()
  await page.getByRole('button', { name: 'Alejar mapa' }).click()
  await page.getByRole('button', { name: 'Centrar servicios' }).click()
  expect(errors).toEqual([])
  expect(external).toEqual([])
  expect(privateRequests).toEqual([])
})

test('map and theme follow the shared scenario across navigation without cookies or storage', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.locator('.demo-map-marker')).toHaveCount(3)
  await page.getByRole('button', { name: 'Activar modo claro' }).click()
  await page.getByLabel('Escenario ficticio').selectOption('alpes')
  await expect(page.locator('.demo-map-marker')).toHaveCount(3)
  await page.getByLabel('Filtrar mapa').selectOption('issues')
  await expect(page.locator('.demo-map-marker')).toHaveCount(1)
  await expect(page.locator('.demo-map-services')).toContainText('Lausanne')
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Clientes', exact: true }).click()
  await expect(page.locator('.demo-workspace')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByLabel('Escenario ficticio')).toHaveValue('alpes')
  expect(await page.context().cookies()).toEqual([])
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
})

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height, size] of [[1440, 1000, 'desktop'], [834, 1112, 'tablet'], [390, 844, 'mobile']] as const) {
    test(`dashboard map ${theme} ${size}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/demo')
      if (theme === 'light') await page.getByRole('button', { name: 'Activar modo claro' }).click()
      await expect(page.locator('.demo-map-marker')).toHaveCount(3)
      await expect(page.locator('.demo-map-loading')).toHaveCount(0)
      await expect(page.locator('.demo-workspace')).toHaveAttribute('data-theme', theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `${evidence}/dashboard-${theme}-${size}.png`, fullPage: true })
    })
  }
}

test('service selection remains usable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...options: unknown[]) {
      if (contextId.startsWith('webgl') || contextId === 'experimental-webgl') return null
      return Reflect.apply(original, this, [contextId, ...options])
    } as typeof original
  })
  await page.goto('/demo')
  await expect(page.getByRole('status').filter({ hasText: 'Cartografía no disponible' })).toBeVisible()
  await page.locator('.demo-map-services > button').first().click()
  await expect(page.getByRole('region', { name: 'Servicio seleccionado' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Acercar mapa' })).toBeDisabled()
  await page.getByRole('button', { name: 'Ver ficha del servicio' }).click()
  await expect(page.getByRole('dialog')).toContainText('Preparación de espacios')
})
