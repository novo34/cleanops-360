import { test, expect } from '@playwright/test'

test('demo preference does not create an authenticated session or change closed private routes', async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Activar modo claro' }).click()
  await page.goto('/login')
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.locator('#demo-theme-root')).toHaveCount(0)
  expect(await page.context().cookies()).toEqual([])
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([['cleanops.demo.theme', 'light']])
  for (const path of ['/auth/me', '/me/sessions', '/auth/tenants']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(503)
    expect((await response.json()).error.code).toBe('AUTH_DEPENDENCY_UNAVAILABLE')
    expect(response.headers()['cache-control']).toContain('no-store')
    expect(response.headers()['set-cookie']).toBeUndefined()
  }
})
