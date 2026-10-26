import {defineConfig} from '@playwright/test'
import base from './playwright.config'
// Existing dashboard tests, on the disposable local Next server only.
// Preserve the complete Chromium/Firefox/WebKit matrix from Quality.
export default defineConfig({...base,testMatch:['demo-workspace.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:3117'}})
