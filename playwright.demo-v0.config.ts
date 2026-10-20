import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const chromium = process.env.CLEANOPS_CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
export default defineConfig({
  testDir: './e2e',
  testMatch: ['demo-workspace.spec.ts', 'demo-v0-map.spec.ts', 'demo-security-boundary.spec.ts', 'csp.spec.ts'],
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/demo-v0-results.json' }]],
  use: {
    baseURL: process.env.CLEANOPS_DEMO_URL || 'http://127.0.0.1:3107',
    launchOptions: { executablePath: chromium, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium-demo' }],
})
