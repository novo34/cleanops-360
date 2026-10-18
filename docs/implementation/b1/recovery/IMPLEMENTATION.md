# Current password reset / recovery integration

SQL09 is owner-authorized and installed/tested only in isolated synthetic PG16. Normal and operator-authorized password reset now use the existing auth panel/private service and a single owned SQL09 transaction. See PASSWORD_RESET_HTTP.md and ../consolidated-test-09/ for exact source/run evidence and boundaries.14/44 requirements accepted individually in isolated functional scope; B1/AUTH-GATE-05 OPEN, closedBackend. External attestation/custody are synthetic; the local password checker is real with a synthetic corpus dataset, not a selected production corpus.

The previous missing BOOTSTRAP reservation contract is resolved by exact approved09, with no additional SQL/ACL. Next B1 vertical is trusted-device UI/API/PostgreSQL, then full AUTHZ. Administrative MFA reset remains distinct from password reset and within B1; no omission or phase transfer.

## Historical SQL08 / SQL07 increments below

# Current recovery code — SQL08 isolated COMPLETE; reset OPEN

Source80a193b0ea8ead58e999e669826f979c6a0b11b1, real PG16/Chromium run39111607391:134PASS including23 real browser flows. See ../consolidated-test-08/RESULT.md and EXECUTION.json. The approved durable binding closes the SQL07 independent-password-browser takeover; expired abandonment stays closed, real COMMIT rollback retains the binding and bound retry succeeds. Direct service table/role and cross-user/tenant enrollment negatives PASS.9/44 requirements accepted individually; no production or full recovery/reset/admin acceptance. Existing frontend/private handler reused; runtime closedBackend.

The private SQL08 reset reader/CAS calls are typed and validated; password-reset HTTP still needs the fixed BOOTSTRAP owned-reservation contract described in docs/proposals/b1-consolidated-sql/revisions/09/REVIEW.md. SQL09 is not installed. Trusted device/AUTHZ do not start before this sequential reset dependency is resolved.

## Historical SQL07 prototype and reproduced failure

# Recovery/reset — sequential B1 vertical

EMAIL was validated first and remains accepted4/44. Current independent work uses exact approved SQL07 recover_to_enrollment(text,bytea,bytea,bytea,uuid); no SQL/ACL changes.

POST /auth/recovery/consume accepts only a26-character base32 recovery code after a password-verified PENDING_MFA binding. CSRF, same origin, USER/IP/DEVICE rate limits, strict duplicate JSON detection and one-time owned idempotency remain in the same identity transaction. Context and HMAC scope derive from trusted binding, never client tenant/user/version. Failed code commits safe denial/rate effects; infrastructure failure rolls back.

SQL07 consumes the HMAC code atomically, revokes old tenant MFA/codes/sessions/trusted devices/challenges and old PREAUTH, and rotates to a password-proof-deadline-preserving ENROLLMENT_REQUIRED. It does not authorize ACTIVE or step-up. The HTTP layer independently rejects any attempted ACTIVE result. Only new enrollment/first-factor confirmation can issue a committed session and replacement recovery codes. Browser proof form clears on submit/cancel and uses no persistent storage.

Real tests use a fresh exact07 PG16 environment, actual UI/API/SQL and synthetic accounts. A fixture CSPRNG recovery secret is stored only as the same scoped HMAC produced by actual TOTP enrollment. Positive flow reenrolls through real QR/first-code API and checks the new10-code batch. Negative/expiry/concurrent and terminated-connection COMMIT rollback cases are real; EMAIL suite is the regression. No operational runtime, external SMTP or deployment.

Password reset remains distinct and INCOMPLETE. SQL07 exposes attest_reset/reset_password_cas, but the private identity adapter lacks an approved ticket-bound material reader for tenant/user/current credential generation before computing the scoped recovery HMAC and CAS. It must not obtain those authorities from HTTP, guess a credential version, read tables directly, synthesize a password proof or add an unapproved encrypted ticket format. A minimal consolidated REVIEW ONLY extension will be prepared; no SQL/ACL change may be installed without exact owner approval. No loss-of-all-factors workflow is claimed complete by recovery-code success.

## Mandatory composition failure: recovery INCOMPLETE

Run39109078160/sourcea52c367898eb67fefd51553cd8149a8c3f2c404f demonstrates that a separate password-only browser can enroll its own TOTP and create ACTIVE while the legitimate recovered PREAUTH is pending. See EXECUTION_SECURITY.json. Therefore no recovery requirement is accepted from the earlier passing baseline; the new private controller is experimental only and ordinary runtime remains closedBackend. SQL08 REVIEW ONLY now proposes the durable proof-to-PREAUTH binding plus the separate reset-material reader, without installing it. It changes the affected final function bodies in one consolidated artifact; old07 and history remain intact. No next functionality is opened while recovery/reset is blocked.
