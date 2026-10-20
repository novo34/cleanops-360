import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // B1 and B2 use node:test and run in their dedicated, mandatory CI steps.
    exclude: ["tests/b1/**", "tests/b2/**"],
    include: ["test/**/*.test.ts", "tests/**/*.test.ts"],
  },
})
