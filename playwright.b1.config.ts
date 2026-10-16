import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  testMatch: 'totp-selection.spec.ts',
  retries: 0,
  use: { baseURL: 'https://127.0.0.1:3000', trace: 'off', ignoreHTTPSErrors: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node scripts/b1-ui-fixture-server.mjs', url: 'https://127.0.0.1:3000/login', reuseExistingServer: false, ignoreHTTPSErrors: true },
})
