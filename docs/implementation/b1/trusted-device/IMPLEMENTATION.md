# Current acceptance

COMPLETE in isolated functional scope. REQ-AUTH-046 accepted, B1 15/44; SQL10 exact owner-authorized root fix and9 individually pinned real browser PASS cases. See RESULT.md. Historical preapproval state below is retained.

# Current execution result

INCOMPLETE. See RESULT.md and exact SQL10 REVIEW ONLY approval request; SQL09 clock-constraint defect reproduced. No new requirement accepted.

# Trusted device — real vertical, acceptance pending execution

Scope: REQ-AUTH-046, existing approved SQL09 only. closedBackend remains connected; B1/AUTH-GATE-05 OPEN. No canonical bytes, SQL, ACL, role or policy are modified. Existing `register_trusted_device`, `trusted_device_valid`, `own_trusted_devices`, `revoke_trusted_device`, `admin_revoke_trusted_devices` enforce context and scope. Typed fixed SQL only.

Additive HTTP routes are in lib/b1/trusted-http.json. All require ACTIVE; list/status B1-SELF-02; mutations B1-SELF-06 with fresh step-up and owned reservations. Admin revocation additionally checks effective edit/users for the locator inside the same transaction. HTTP selectors never supply tenant, user authority, principal, credential version or token. Registration uses 32 random bytes and digest-only persistence; one-time idempotence never stores/replays its cookie. A `__Host-cleanops_trusted` Secure HttpOnly SameSite=Lax Path=/ cookie is emitted only after COMMIT with the exact database expiry, never beyond the approved 30 days. Cookie is not emitted on COMMIT uncertainty. Lists expose id/creation/expiry only with actor-bound signed pagination. Self global revocation iterates currently valid pages under the principal lock, reusing existing guarded revocations and audit, in one transaction. Expired metadata is already invalid; administrative/global security invalidations also revoke expired rows through existing approved functions.

Trust is metadata only after actual MFA/ACTIVE. It never establishes identity, accepts PREAUTH, bypasses any factor/step-up, or extends absolute/idle session deadlines. A stolen bearer with no ACTIVE context has no authority; a different principal/tenant cannot use it. No device fingerprinting. The SQL table binds the principal, tenant, user and credential version; session association is validated by the transaction's ACTIVE context (no invented session-id storage column). Reset/recovery/version changes invalidate it under existing SQL. Company disable is authoritative server policy; no UI toggle invents that policy.

Runtime remains closed. Isolated test composition uses synthetic fixture policy and identities, genuine service-role PostgreSQL calls, loopback TLS, real Chromium and no HTTP mocks. Native tests target only affected privilege boundaries; unchanged historical suites are not repeated. Unit tests are not acceptance evidence. Approval of the next candidate is required only if a SQL/ACL defect needs a modified installation.
