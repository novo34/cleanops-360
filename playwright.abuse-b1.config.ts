import base from './playwright.real-b1.config'
export default {...base,testMatch:'b1-abuse-postgres.spec.ts',timeout:120000,use:{...base.use,actionTimeout:15000}}
