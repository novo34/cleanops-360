import { defineConfig } from '@playwright/test'

// No webServer, fixture bridge or unattended remote access. Operator authorizes each run.
export default defineConfig({
  testDir: './e2e/staging',
  workers: 1,
  use: { baseURL: 'https://cleanops.nuvurent.com', ignoreHTTPSErrors: false, trace: 'off', screenshot: 'off', video: 'off' },
  reporter: 'line',
})
