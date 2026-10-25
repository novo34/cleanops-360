import base from './playwright.real-b1.config'
export default {...base,testMatch:'b1-sql13-postgres.spec.ts',timeout:90000,use:{...base.use,actionTimeout:15000}}
