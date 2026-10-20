import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
 testDir:'./e2e',testMatch:['b2-boundary.spec.ts','demo-workspace.spec.ts'],retries:0,
 use:{baseURL:'http://127.0.0.1:3000',trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 // Match B1's already verified production-Next listener configuration exactly.
 webServer:{command:'npm run start -- --hostname 0.0.0.0',url:'http://127.0.0.1:3000/demo',reuseExistingServer:false,env:{CLEANOPS_AUTH_ORIGIN:'https://cleanops.nuvurent.com',CLEANOPS_AUTH_INTERNAL_ORIGINS:'["http://0.0.0.0:3000","https://0.0.0.0:3000","http://127.0.0.1:3000"]'}},
})
