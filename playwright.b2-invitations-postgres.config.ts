import {defineConfig} from '@playwright/test'
import base from './playwright.b2-postgres.config'
export default defineConfig({...base,testMatch:['b2-invitations-postgres.spec.ts'],
 reporter:[['list'],['json',{outputFile:'artifacts/b2-invitations/playwright.json'}]],
 webServer:{...base.webServer,command:'node scripts/b2-invitation-browser-server.mjs'},
})
