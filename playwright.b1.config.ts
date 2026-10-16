import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  testMatch: 'totp-selection.spec.ts',
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm start -- --hostname 127.0.0.1', url: 'http://127.0.0.1:3000/login', reuseExistingServer: false },
})
