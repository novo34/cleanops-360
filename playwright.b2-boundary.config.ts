import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
 testDir:'./e2e',testMatch:['b2-boundary.spec.ts','demo-workspace.spec.ts'],retries:0,
 use:{baseURL:'http://127.0.0.1:3000',trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{command:'npm run start -- --hostname 127.0.0.1',url:'http://127.0.0.1:3000/demo',reuseExistingServer:false,env:{CLEANOPS_AUTH_ORIGIN:'https://cleanops.test',CLEANOPS_AUTH_INTERNAL_ORIGINS:'["http://127.0.0.1:3000"]'}},
})
