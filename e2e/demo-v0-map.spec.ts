import { test, expect } from '@playwright/test'

const evidence = 'docs/implementation/demo-v0/closure-evidence'
test('local geographic map renders under unchanged CSP and interacts with existing details', async ({ page }) => {
  const errors: string[] = [], external: string[] = [], privateRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(request.url())
    if (/^\/(auth|api|me|mfa)(\/|$)/.test(url.pathname)) privateRequests.push(url.pathname)
  })
  await page.emulateMedia({ colorScheme: 'dark' })
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

test('map and theme follow the shared scenario across navigation with only a non-sensitive visual preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
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
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([1, 0])
})

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height, size] of [[1440, 1000, 'desktop'], [834, 1112, 'tablet'], [390, 844, 'mobile']] as const) {
    test(`dashboard map ${theme} ${size}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ colorScheme: 'dark' })
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
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/demo')
  await expect(page.getByRole('status').filter({ hasText: 'Cartografía no disponible' })).toBeVisible()
  await page.locator('.demo-map-services > button').first().click()
  await expect(page.getByRole('region', { name: 'Servicio seleccionado' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Acercar mapa' })).toBeDisabled()
  await page.getByRole('button', { name: 'Ver ficha del servicio' }).click()
  await expect(page.getByRole('dialog')).toContainText('Preparación de espacios')
})

test('theme follows the OS until explicit preference and persists reload/navigation', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/demo')
  await expect(page.locator('.demo-workspace')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.length)).toBe(0)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('.demo-workspace')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Activar modo claro' }).click()
  await page.reload()
  await expect(page.locator('.demo-workspace')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('#demo-theme-root')).toHaveAttribute('data-demo-theme', 'light')
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([['cleanops.demo.theme', 'light']])
  await page.getByRole('navigation').getByRole('link', { name: 'Planning Engine', exact: true }).click()
  await expect(page.locator('.demo-workspace')).toHaveAttribute('data-theme', 'light')
})

test('filters retain visible selection, clear hidden services, reset, and provide accessible empty state', async ({ page }) => {
  await page.goto('/demo')
  const list = page.getByRole('group', { name: 'Servicios del mapa' })
  await list.getByRole('button').first().click()
  await page.getByLabel('Periodo del mapa').selectOption('week')
  await expect(page.getByRole('region', { name: 'Servicio seleccionado' })).toBeVisible()
  await expect(page.locator('.demo-map-marker[aria-pressed="true"]')).toHaveCount(1)
  await page.getByLabel('Filtrar mapa').selectOption('MAINTENANCE_CONTRACT')
  await expect(page.getByRole('region', { name: 'Servicio seleccionado' })).toHaveCount(0)
  await page.getByLabel('Periodo del mapa').selectOption('today')
  await expect(page.getByText('No hay servicios con estos filtros.')).toBeVisible()
  await expect(page.locator('.demo-map-marker')).toHaveCount(0)
  await page.screenshot({ path: evidence + '/empty-state.png', fullPage: true })
  await page.getByRole('button', { name: 'Restablecer mapa' }).click()
  await expect(list.getByRole('button')).toHaveCount(3)
  const trigger = list.getByRole('button').first()
  await trigger.focus(); await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Cerrar selección del mapa' }).focus()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(page.getByRole('region', { name: 'Servicio seleccionado' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await trigger.click()
  await page.getByRole('region', { name: 'Servicio seleccionado' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: evidence + '/mobile-selected-text-alternative.png', fullPage: true })
})

test('zoom and drag actually move cartography and selected nearby services remain identifiable', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.locator('.demo-map-marker')).toHaveCount(3)
  const canvas = page.locator('.maplibregl-canvas')
  await canvas.scrollIntoViewIfNeeded()
  const before = await page.locator('.demo-map-marker').first().boundingBox()
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 12 }); await page.mouse.up()
  await expect.poll(async () => { const after = (await page.locator('.demo-map-marker').first().boundingBox())!; return Math.hypot(after.x - before!.x, after.y - before!.y) }).toBeGreaterThan(5)
  await page.getByRole('button', { name: 'Centrar servicios' }).click()
  const centered = await page.locator('.demo-map-marker').first().boundingBox()
  await page.getByRole('button', { name: 'Acercar mapa' }).click()
  await expect.poll(async () => (await page.locator('.demo-map-marker').first().boundingBox())?.x).not.toBe(centered?.x)
  await page.getByRole('button', { name: 'Alejar mapa' }).click()
  await page.getByLabel('Periodo del mapa').selectOption('week')
  for (const button of await page.locator('.demo-map-services > button').all()) {
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.demo-map-marker[aria-pressed="true"]')).toHaveCount(1)
  }
  await page.screenshot({ path: evidence + '/weekly-filter-selection.png', fullPage: true })
})

test('stored theme is applied before hydration, using the existing CSP nonce', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cleanops.demo.theme', 'light'))
  await page.route('**/_next/static/**/*.js', route => route.abort())
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#demo-theme-root')).toHaveAttribute('data-demo-theme', 'light')
  await expect(page.locator('.demo-workspace')).toHaveCSS('background-color', 'rgb(241, 245, 247)')
})

test('blocked visual storage does not disable theme control and landscape stays usable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Activar modo claro' }).click()
  await expect(page.locator('.demo-workspace')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('.demo-map-marker')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('agenda selection restores map context even after filtering out that service', async ({ page }) => {
  await page.goto('/demo')
  await page.getByLabel('Filtrar mapa').selectOption('MAINTENANCE_CONTRACT')
  await expect(page.getByText('No hay servicios con estos filtros.')).toBeVisible()
  await page.locator('.demo-agenda-row').first().click()
  await expect(page.getByRole('dialog')).toContainText('Preparación de espacios')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Servicio seleccionado' })).toContainText('Preparación de espacios')
  await expect(page.getByLabel('Filtrar mapa')).toHaveValue('all')
  await expect(page.locator('.demo-map-marker[aria-pressed="true"]')).toHaveCount(1)
})

test('mobile navigation opens with keyboard focus and Escape returns to the trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Abrir navegación' }).click()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Dashboard', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toHaveAttribute('aria-expanded', 'false')
})

test('touch emulation selects and closes services with sufficiently sized map controls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' })
  try {
    const page = await context.newPage()
    await page.goto(process.env.CLEANOPS_DEMO_URL || 'http://127.0.0.1:3107/demo')
    await expect(page.locator('.demo-map-marker')).toHaveCount(3)
    await page.locator('.demo-map-services > button').first().tap()
    await expect(page.getByRole('region', { name: 'Servicio seleccionado' })).toBeVisible()
    for (const control of await page.locator('.demo-map-zoom button, .demo-map-toolbar select, .demo-theme-toggle').all()) {
      const box = (await control.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(24)
      expect(box.height).toBeGreaterThanOrEqual(24)
    }
    await page.getByRole('button', { name: 'Cerrar selección del mapa' }).tap()
    await expect(page.getByRole('region', { name: 'Servicio seleccionado' })).toHaveCount(0)
  } finally { await context.close() }
})
