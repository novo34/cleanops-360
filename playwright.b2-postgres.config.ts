import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
 testDir:'./e2e',testMatch:['b2-directory-postgres.spec.ts'],workers:1,retries:0,timeout:30000,
 use:{baseURL:'https://127.0.0.1:3443',ignoreHTTPSErrors:true,trace:'off',screenshot:'off'},
 reporter:[['list'],['json',{outputFile:'artifacts/b2-directory/playwright.json'}]],
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{command:'node scripts/b2-real-browser-server.mjs',url:'https://127.0.0.1:3443/administration/users',ignoreHTTPSErrors:true,reuseExistingServer:false},
})
