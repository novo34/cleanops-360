# B1 approved extension — code-only implementation

Base d3a63b9fbe6c99dbbbd7e4ae4d339293faa7a25f. Owner authorizes B1-X-CREDENTIAL/TOTP/BINDING for code and no-database tests in this session. No SQL execution, grants, seeds, deployment, merge or runtime wiring is authorized. AUTH-GATE-05 OPEN; runtime remains closedBackend. Historical proposal artifacts/canonical SQL are untouched.

## Implemented

- Fourteen parameterized extension calls added to the scoped V4 broker. Stable AUTH_INVALID/CREDENTIAL_CHANGED/reservation errors are sanitized. Existing old calls remain for legacy test/facade compatibility; the new factory uses approved calls.
- Transaction-local credential material and real Argon2id proof; version/hash CAS rehash; exact current-hash preauth issuance through a one-shot in-process proof capability. Absent account uses a real, explicitly supplied trial-profile dummy hash. No browser password_verified field or mutable proof is trusted.
- Real TOTP verification against complete, tenant/user/method/purpose/ceremony-bound broker material. Authenticated decryption is an explicitly required private key-provider dependency. Expected version/global counter are passed to atomic consumption; malformed/wrong codes count failed proofs with NULL validated counter. Infrastructure/CAS errors cannot yield success. EMAIL_OTP uses the restricted HMAC32-only contract, not the retired generic attestation call.
- createApprovedPrivateBackend implements Backend/Transaction: SQL-resolved Binding and CSRF, transaction-scoped actor identity, fresh rule/step-up checks, keyed rate dimensions, owned reserve/complete/discard, safe failure outcomes, lifecycle closure and commit-before-result. HTTP correlation is forwarded to the same transaction/audit calls.
- Identity, signed-cursor tenant/session listing, own logout/individual/bulk revocation and idempotency are composed on the same connection. Cross-tenant response rows and cursor context mismatch fail closed. SQL remains responsible for locks, current credential/membership state and audited mutations.
- ACTIVE step-up TOTP/EMAIL_OTP preserves session/tenant/absolute expiry and never emits a new session. Binding now distinguishes operational min(idle,absolute) expiry from absoluteExpiresAt so step-up cannot extend either lifetime or fail merely because the idle deadline is earlier.
- ACTIVE pending TOTP confirmation verifies the real code, atomically submits ten recovery HMACs, returns plaintext recovery codes once after commit and stores only an idempotent one-time marker. Private keys are injected; no key discovery/production secrets are installed.
- Login verifies password and emits version-conditioned preauth, enumerates owned memberships and selects a unique/hinted UUID tenant when possible. TENANT_SELECTION_REQUIRED and ENROLLMENT_REQUIRED are emitted only from broker-confirmed state. Switch composition preserves source authority until SQL can complete destination issuance.

## Genuine remaining material/protocol gaps

This is NOT claimed as a complete operational authentication adapter:
1. Neither V4 nor the approved overlay exposes the enabled-method set, eligible method UUIDs or delivery recipient/policy. PENDING_MFA cannot be given a real challenge_id, nor can startStepUp/resendOtp safely choose a factor without guessing/downgrading. Those branches throw 503 and roll back rather than delegate authorization to an unimplemented callback.
2. issue_active_session validates risk_class, but no granted material function returns it. The factory refuses to guess absolute/idle lifetimes from identity/tenant selectors. PREAUTH factor success currently rolls back with 503 instead of consuming a factor without atomically issuing a valid destination session.
3. begin_totp_enrollment_explicit allocates the method UUID and version in PostgreSQL AFTER accepting ciphertext. The approved key-provider contract requires method/tenant/user/version AAD. Code cannot construct that binding before allocation, and no allocate-then-finalize/re-encrypt function exists. enrollTotp therefore fails closed; existing pending ACTIVE enrollments can be confirmed.
4. SELECTION select_tenant does not supply a new binding/CSRF rotation primitive. Pending selection retains its proof cookie; completed switch/session issuance is still blocked by (1)/(2). No completed switch is claimed.

Completing these branches needs a minimal additional material/allocation contract, plus a real authenticated key provider, trusted ingress dimensions and provisioning-consistent email normalization. No SQL or contract expansion was silently applied in this code-only increment. Existing readers can use the factories for isolated synthetic tests; no runtime setter/flag is provided.

## Evidence limits

Tests exercise real Argon2id/TOTP/CSPRNG/HMAC with simulated PostgreSQL connections/results, version races, tenant checks, RBAC/step-up, idempotency, HTTP correlation, commit failures, absolute/idle deadlines and one-time recovery output. They do not execute SQL, prove RLS or certify concurrency locks. Actual SHA and no-database CI evidence are recorded on PR #7.
