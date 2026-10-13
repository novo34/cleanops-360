import { test, expect } from "@playwright/test"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`bootstrap CSP and browser render — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    page.on("console", message => {
      if (message.type() === "error" && /content security policy|refused to execute|hydration/i.test(message.text())) {
        errors.push(message.text())
      }
    })
    const response = await page.goto("/", { waitUntil: "networkidle" })
    expect(response?.status()).toBe(200)
    const csp = response?.headers()["content-security-policy"] || ""
    expect(csp).toMatch(/script-src[^;]*'nonce-[^']+'/)
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    await expect(page.getByRole("heading", { name: "CleanOps 360" })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1)
    expect(errors).toEqual([])
  })
}

test("CSP nonce changes between responses", async ({ request }) => {
  const first = await request.get("/")
  const second = await request.get("/")
  expect(first.status()).toBe(200)
  expect(second.status()).toBe(200)
  expect(first.headers()["content-security-policy"]).not.toBe(second.headers()["content-security-policy"])
})
