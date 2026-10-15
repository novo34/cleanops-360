import { test, expect } from "@playwright/test"

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`System Status gate, CSP and browser render — ${viewport.name}`, async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: "System status", exact: true })).toBeVisible()
    await expect(page.getByRole("main").getByRole("alert")).toContainText("AUTH-GATE-05")
    await expect(page.getByRole("heading", { name: "Administrative access is not available yet." })).toBeVisible()
    await expect(page.getByRole("region", { name: "System services" })).toHaveCount(0)
    await expect(page.locator(".admin-gate")).toHaveCSS("background-color", "rgb(255, 253, 246)")
    const refresh = page.waitForResponse(response => response.url().endsWith("/api/system-status/health"))
    await page.getByRole("button", { name: "Refresh" }).click()
    expect((await refresh).status()).toBe(401)
    await expect(page.getByRole("main").getByRole("alert")).toContainText("AUTH-GATE-05")
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

test("CSP blocks an inline script without a nonce", async ({ page }) => {
  // Inject into the parsed document, not through DevTools' trusted evaluation.
  await page.route("**/", async route => {
    const response = await route.fetch()
    const html = await response.text()
    await route.fulfill({
      response,
      body: html.replace("</head>", "<script>document.documentElement.dataset.inlineProbe = 'executed'</script></head>"),
    })
  })
  await page.goto("/")
  await expect(page.getByRole("main").getByRole("alert")).toContainText("AUTH-GATE-05")
  expect(await page.locator("html").getAttribute("data-inline-probe")).toBeNull()
})

for (const endpoint of ["health", "config", "version", "audit"]) {
  test(`System Status ${endpoint} denies unauthenticated access`, async ({ request }) => {
    const response = await request.get(`/api/system-status/${endpoint}`)
    expect(response.status()).toBe(401)
    expect(response.headers()["cache-control"]).toBe("private, no-store")
    expect(await response.json()).toEqual({
      error: "unauthorized",
      code: "AUTH_GATE_05",
      message: "Administrative access is unavailable until AUTH-GATE-05 is approved.",
    })
    for (const organization of ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"]) {
      const forged = await request.get(`/api/system-status/${endpoint}?organization_id=${organization}`, {
        headers: {
          Authorization: "Bearer invalid-test-token",
          Cookie: "session=invalid-test-session",
          "X-Organization-ID": organization,
          "X-Tenant-ID": organization,
          "X-Middleware-Subrequest": "middleware:middleware:middleware:middleware:middleware",
        },
      })
      expect(forged.status()).toBe(401)
      expect(await forged.json()).toEqual(await response.json())
    }
    const head = await request.head(`/api/system-status/${endpoint}`)
    expect(head.status()).toBe(401)
    expect(await head.text()).toBe("")
  })
}

test("System Status shows a transport error without inferring service health", async ({ page }) => {
  await page.route("**/api/system-status/health", route => route.abort())
  await page.goto("/")
  await expect(page.getByRole("main").getByRole("alert")).toContainText("System status unavailable")
  await expect(page.getByRole("region", { name: "System services" })).toHaveCount(0)
})
