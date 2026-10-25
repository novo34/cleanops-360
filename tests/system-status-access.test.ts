import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as health } from "../app/api/system-status/health/route"
import { GET as config } from "../app/api/system-status/config/route"
import { GET as version } from "../app/api/system-status/version/route"
import { GET as audit } from "../app/api/system-status/audit/route"
import { checkDatabase, withDatabase } from "../lib/system-status/db"

vi.mock("../lib/system-status/db", () => ({ checkDatabase: vi.fn(), withDatabase: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe("real administrative gate", () => {
  for (const [name, handler] of Object.entries({ health, config, version, audit })) {
    it(`${name} denies access before reading any database data`, async () => {
      const response = await handler()
      expect(response.status).toBe(401)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(await response.json()).toEqual({
        error: "unauthorized",
        code: "AUTH_GATE_05",
        message: "Administrative access is unavailable until AUTH-GATE-05 is approved.",
      })
      expect(checkDatabase).not.toHaveBeenCalled()
      expect(withDatabase).not.toHaveBeenCalled()
    })
  }
})
