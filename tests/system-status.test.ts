import { describe, expect, it } from "vitest"
import { requireAdminAccess } from "../lib/system-status/access"
import { checkDatabase } from "../lib/system-status/db"

describe("Administration / System Status access", () => {
  it("fails closed while AUTH-GATE-05 is open", () => {
    expect(requireAdminAccess()).toEqual({ authorized: false, reason: "AUTH_GATE_05" })
  })
})

describe("PostgreSQL health", () => {
  it("reports disconnected when DATABASE_URL is absent", async () => {
    const original = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    await expect(checkDatabase()).resolves.toEqual({ status: "disconnected", detail: "DATABASE_URL is not configured" })
    if (original) process.env.DATABASE_URL = original
  })

  it.skipIf(!process.env.DATABASE_URL)("checks the configured isolated PostgreSQL instance", async () => {
    const result = await checkDatabase()
    expect(["operational", "degraded"]).toContain(result.status)
  })
})
