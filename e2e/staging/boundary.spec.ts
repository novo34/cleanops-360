import { test, expect } from '@playwright/test'

test('synthetic online UI and HTTPS preserve the closed authentication gate', async ({ page, request }) => {
  test.skip(process.env.CLEANOPS_STAGING_BROWSER_AUTHORIZED !== 'yes', 'Explicit operator authorization required')
  const response = await page.goto('/login')
  expect(response?.status()).toBe(200)
  await expect(page.locator('input[type="password"]')).toBeVisible()
  const auth = await request.get('/auth/me')
  expect(auth.status()).toBe(503)
  expect((await auth.json()).error.code).toBe('AUTH_DEPENDENCY_UNAVAILABLE')
  expect(auth.headers()['cache-control']).toContain('no-store')
})
