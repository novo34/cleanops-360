import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'b1-real-postgres.spec.ts', workers: 1, retries: 0,
  reporter: [['json', { outputFile: 'artifacts/b1-real-browser/playwright.json' }]],
  use: { baseURL: 'https://127.0.0.1:3000', trace: 'off', screenshot: 'off', video: 'off', ignoreHTTPSErrors: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm start -- --hostname 127.0.0.1 --port 3001', url: 'http://127.0.0.1:3001/login', reuseExistingServer: false },
})
