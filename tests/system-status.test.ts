import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { requireAdminAccess } from "../lib/system-status/access"

const testDatabaseUrl = process.env.CLEANOPS_TEST_DATABASE_URL

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("DATABASE_URL", "")
})

afterEach(async () => {
  const { getPool } = await import("../lib/system-status/db")
  await getPool()?.end()
  vi.unstubAllEnvs()
})

describe("Administration / System Status access", () => {
  it("fails closed while AUTH-GATE-05 is open", () => {
    expect(requireAdminAccess()).toEqual({ authorized: false, reason: "AUTH_GATE_05" })
  })
})

describe("PostgreSQL health", () => {
  it("reports disconnected when DATABASE_URL is absent", async () => {
    vi.stubEnv("DATABASE_URL", "")
    const { checkDatabase } = await import("../lib/system-status/db")
    await expect(checkDatabase()).resolves.toEqual({ status: "disconnected", detail: "DATABASE_URL is not configured" })
  })
})

describe.skipIf(!testDatabaseUrl)("isolated PostgreSQL integration", () => {
  beforeAll(() => {
    const url = new URL(testDatabaseUrl!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/cleanops_test") {
      throw new Error("Integration tests require a loopback PostgreSQL database named cleanops_test")
    }
  })

  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", testDatabaseUrl!)
  })

  it("requires operational health for a successful connection", async () => {
    const { checkDatabase } = await import("../lib/system-status/db")
    await expect(checkDatabase()).resolves.toEqual({ status: "operational" })
  })

  it("connects to PostgreSQL 16 with the System Status migration applied", async () => {
    const { withDatabase } = await import("../lib/system-status/db")
    await withDatabase(async (client) => {
      const version = await client.query("SHOW server_version_num")
      expect(Number(version.rows[0].server_version_num)).toBeGreaterThanOrEqual(160000)
      expect(Number(version.rows[0].server_version_num)).toBeLessThan(170000)
      const migration = await client.query("SELECT id FROM _migrations WHERE id = $1", ["0001_system_status"])
      expect(migration.rows).toEqual([{ id: "0001_system_status" }])
      for (const table of ["organizations", "feature_flags", "audit_logs", "security_events"]) {
        const result = await client.query("SELECT to_regclass($1) AS name", [`public.${table}`])
        expect(result.rows[0].name).toBe(table)
      }
    })
  })

  it("reports degraded separately when PostgreSQL rejects credentials", async () => {
    const url = new URL(testDatabaseUrl!)
    url.password = `${url.password}_invalid`
    vi.stubEnv("DATABASE_URL", url.toString())
    const { checkDatabase } = await import("../lib/system-status/db")
    await expect(checkDatabase()).resolves.toEqual({ status: "degraded", detail: "Database connection failed" })
  })
})
