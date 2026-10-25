import base from './playwright.real-b1.config'
export default {...base,grep:/real first enrollment/,timeout:90000,use:{...base.use,actionTimeout:15000}}
