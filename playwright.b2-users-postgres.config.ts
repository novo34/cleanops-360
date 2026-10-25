import {defineConfig} from '@playwright/test'
import base from './playwright.b2-postgres.config'
export default defineConfig({...base,testMatch:['b2-users-postgres.spec.ts'],reporter:[['list'],['json',{outputFile:'artifacts/b2-users/playwright.json'}]]})
