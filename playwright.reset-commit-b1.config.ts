import base from './playwright.reset-b1.config'
export default {...base,testMatch:'b1-reset-postgres.spec.ts',grep:/actual reset COMMIT acknowledgement loss/}
