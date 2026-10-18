import base from './playwright.access-b1.config'
export default {...base,testMatch:['b1-access-postgres.spec.ts','b1-real-postgres.spec.ts'],grep:/AUTHZ|real UI password/,grepInvert:/read-only UI|current administrator/}
