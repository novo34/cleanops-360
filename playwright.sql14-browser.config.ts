import base from './playwright.real-b1.config'
export default {...base,testMatch:'b1-sql14-postgres.spec.ts',grep:process.env.B1_SQL14_BROWSER_GREP?new RegExp(process.env.B1_SQL14_BROWSER_GREP):undefined,timeout:90000,use:{...base.use,actionTimeout:15000}}
