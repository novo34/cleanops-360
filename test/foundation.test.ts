import { describe, expect, it } from "vitest"
import { securityHeaders } from "../lib/security-headers"

describe("Foundation bootstrap", () => {
  it("sets defensive headers without a conflicting global CSP", () => {
    expect(securityHeaders.map((header) => header.key)).toContain("X-Content-Type-Options")
    expect(securityHeaders.map((header) => header.key)).not.toContain("Content-Security-Policy")
  })
})
