import base from './playwright.enrollment-b1.config'
// Explicit test-worker capability; never read by application/runtime.
process.env.B1_TOTP_APP='INSTALLED_APPLICATIONS'
export default {...base,timeout:150000}
