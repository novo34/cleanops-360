import base from './playwright.real-b1.config'
export default {...base,testMatch:['b1-switch-postgres.spec.ts','b1-access-postgres.spec.ts'],grepInvert:/read-only UI|current administrator/,timeout:90000,use:{...base.use,actionTimeout:15000}}
