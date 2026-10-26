import { expect, test } from "@playwright/test"

// Browser-only response fixtures verify rendering, not authorized backend access.
// All real administrative endpoints remain fail-closed in csp.spec.ts.
const healthy = { api: "operational", database: { status: "operational" }, jobs: { status: "operational" } }

test("initial loading remains distinct from service health", async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route("**/api/system-status/health", async route => {
    await pending
    await route.fulfill({ status: 401, json: { code: "AUTH_GATE_05" } })
  })
  await page.goto("/")
  try {
    await expect(page.getByRole("button", { name: "Checking" })).toBeDisabled()
    await expect(page.getByRole("region", { name: "System services" })).toHaveAttribute("aria-busy", "true")
    await expect(page.locator(".admin-status-card strong")).toHaveText(["Checking", "Checking", "Checking"])
  } finally {
    release()
  }
  await expect(page.getByRole("main").getByRole("alert")).toContainText("AUTH-GATE-05")
})

test("operational, degraded and unavailable render separately", async ({ page }) => {
  await page.route("**/api/system-status/health", route => route.fulfill({
    json: { api: "operational", database: { status: "degraded" }, jobs: { status: "disconnected" } },
  }))
  await page.goto("/")
  await expect(page.locator(".admin-status-card strong")).toHaveText(["operational", "degraded", "Unavailable"])
  await expect(page.getByRole("region", { name: "System services" })).toHaveAttribute("aria-busy", "false")
})

for (const fixture of [
  { name: "HTTP 500 even with a valid health body", status: 500, body: healthy },
  { name: "HTTP 403 with a misleading gate code", status: 403, body: { code: "AUTH_GATE_05" } },
  { name: "missing service statuses", status: 200, body: { error: "sensitive-diagnostic-marker" } },
  { name: "null JSON", status: 200, body: null },
  { name: "unknown service status", status: 200, body: { ...healthy, api: "sensitive-diagnostic-marker" } },
]) {
  test(`${fixture.name} displays unavailable without diagnostics or service claims`, async ({ page }) => {
    await page.route("**/api/system-status/health", route => route.fulfill({ status: fixture.status, json: fixture.body }))
    await page.goto("/")
    await expect(page.getByRole("main").getByRole("alert")).toContainText("System status unavailable")
    await expect(page.getByRole("region", { name: "System services" })).toHaveCount(0)
    await expect(page.getByRole("main")).not.toContainText("sensitive-diagnostic-marker")
  })
}

test("Refresh shows checking, discards stale health on error and can recover", async ({ page }) => {
  const pageErrors: string[] = []
  page.on("pageerror", error => pageErrors.push(error.message))
  let requests = 0
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route("**/api/system-status/health", async route => {
    requests++
    if (requests === 2) {
      await pending
      await route.fulfill({ status: 503, json: { error: "sensitive-diagnostic-marker" } })
    } else {
      await route.fulfill({ json: healthy })
    }
  })
  await page.goto("/")
  await expect(page.locator(".admin-status-card strong")).toHaveText(["operational", "operational", "operational"])
  await page.getByRole("button", { name: "Refresh" }).click()
  try {
    await expect(page.getByRole("button", { name: "Checking" })).toBeDisabled()
    await expect(page.locator(".admin-status-card strong")).toHaveText(["Checking", "Checking", "Checking"])
  } finally {
    release()
  }
  await expect(page.getByRole("main").getByRole("alert")).toContainText("System status unavailable")
  await expect(page.getByRole("region", { name: "System services" })).toHaveCount(0)
  await page.getByRole("button", { name: "Refresh" }).click()
  await expect(page.locator(".admin-status-card strong")).toHaveText(["operational", "operational", "operational"])
  expect(pageErrors).toEqual([])
})

test("a non-JSON server error is unavailable without exposing its body", async ({ page }) => {
  await page.route("**/api/system-status/health", route => route.fulfill({
    status: 502, contentType: "text/html", body: "<h1>sensitive-diagnostic-marker</h1>",
  }))
  await page.goto("/")
  await expect(page.getByRole("main").getByRole("alert")).toContainText("System status unavailable")
  await expect(page.getByRole("main")).not.toContainText("sensitive-diagnostic-marker")
  await expect(page.getByRole("region", { name: "System services" })).toHaveCount(0)
})
