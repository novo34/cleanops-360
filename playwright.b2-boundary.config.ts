import { defineConfig, devices } from '@playwright/test'
const development=process.env.B2_BOUNDARY_DEV==='1'
export default defineConfig({
 testDir:'./e2e',testMatch:['b2-boundary.spec.ts','demo-workspace.spec.ts'],retries:0,
 // Next development needs eval for its runtime. Only this local mode bypasses
 // CSP; the default production run continues to exercise the real policy.
 use:{baseURL:development?'http://localhost:3000':'http://127.0.0.1:3000',bypassCSP:development,trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 // Match B1's already verified production-Next listener configuration exactly.
 webServer:{command:development?'npm run dev -- --hostname 0.0.0.0':'npm run start -- --hostname 0.0.0.0',url:development?'http://localhost:3000/demo':'http://127.0.0.1:3000/demo',reuseExistingServer:false,env:{CLEANOPS_AUTH_ORIGIN:'https://cleanops.nuvurent.com',CLEANOPS_AUTH_INTERNAL_ORIGINS:JSON.stringify(['http://0.0.0.0:3000','https://0.0.0.0:3000','http://127.0.0.1:3000',...(development?['http://localhost:3000']:[])])}},
})
