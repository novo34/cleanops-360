import base from './playwright.real-b1.config'
export default {...base,testMatch:['b1-reset-postgres.spec.ts','b1-recovery-postgres.spec.ts'],timeout:60000}
