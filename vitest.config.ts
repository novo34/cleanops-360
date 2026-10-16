import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["tests/b1/**"],
    include: ["test/**/*.test.ts", "tests/**/*.test.ts"],
  },
})
