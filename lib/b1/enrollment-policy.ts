/** Owner E1 resolution 2026-10-17. Architecture approved, not runtime activation
 * or proof of external-app compatibility. V4 period/digits/window stay unchanged. */
export const approvedTotpEnrollmentPolicy = Object.freeze({
  algorithm: 'SHA256' as const, secretBytes: 32, issuer: 'CleanOps 360',
})
