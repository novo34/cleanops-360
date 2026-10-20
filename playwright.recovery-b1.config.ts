import base from './playwright.real-b1.config'
export default {...base,testMatch:['b1-recovery-postgres.spec.ts','b1-email-postgres.spec.ts','b1-real-postgres.spec.ts'],timeout:60000}
