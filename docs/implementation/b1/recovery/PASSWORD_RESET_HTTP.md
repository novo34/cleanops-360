# Password reset — additive B1 HTTP contract

Canonical V4 bytes and existing operations are unchanged. Effective schemas: lib/b1/reset-http.json. Runtime remains closedBackend. Implemented for isolated execution; no productive issuer, corpus selection or external SMTP configured.

## POST /auth/password/reset

Requires valid BOOTSTRAP/CSRF, same HTTPS origin/fetch metadata and Idempotency-Key. Only ticket (opaque43-character receipt), new_password and optional recovery_code are accepted; all are write-only. Unknown/duplicate keys, tenant/user/version/risk/permission assertions are rejected. The caller must supply recovery proof unless an independently attested receipt has separately received current administrative authorization. No client flag selects that policy.

One private connection/transaction: resolve BOOTSTRAP; trusted USER/IP/DEVICE limits; SQL09 fixed-operation owned reservation with keyed request fingerprint; approved ticket material and principal/credential/membership/ticket locks; stable principal limit; explicit local password admission; real Argon2id replacement; scoped recovery HMAC if required; version CAS; global credential-related session/PREAUTH/trust revocations, proof/ticket consumption and audit; owned one-time completion; COMMIT. Only after confirmed COMMIT return {data:{state:"PASSWORD_RESET"},meta} and clear authentication/CSRF cookies. No session is issued. A new password login still requires MFA.

The password checker uses a private versioned local SHA256 membership corpus, verifies its full content checksum and format, snapshots explicit bounds and refuses missing/corrupt/unavailable policy. It never transmits submitted passwords. Credential storage remains salted Argon2id, not the corpus index algorithm. Isolated tests use a synthetic compromised-password corpus and explicit existing trial bounds; no production dataset/version/resource budget is selected by these fixtures.

Invalid/expired/consumed/stale ticket gives generic401; invalid recovery/password admission gives generic422; CSRF/authorization403; replay/mismatch409; limits429; unavailable policy/custody/transaction503. Failed domain attempts discard owned reservation and commit safe denial/rate records; infrastructure failures roll back and discard the connection. No raw proof/password/ciphertext/recipient/private authorization detail is an HTTP result or log.

## POST /auth/password/reset/authorize

Requires ACTIVE session, CSRF, Idempotency-Key, current B1-SELF-06 step-up and actual SQL RBAC. Body contains only target_user_id (locator), ticket and reason. Existing authorize_password_reset validates current tenant, non-self subject, independently attested PASSWORD receipt, edit/users and manage_permissions/access, credential generation and current policy. It binds the receipt to the approving session/policy; it does not accept, choose or reveal the subject password and does not issue a session. Response is only {data:{authorized:true},meta}. Cross-tenant/absent/unauthorized targets share generic denial.

The existing auth panel reuses its step-up/pending-action machinery. Denial preserves the operator's valid ACTIVE context; it never grants the denied action. The target consumes the receipt from a separate BOOTSTRAP context. The reader/CAS revalidate approving session, policy and factor expiry; stale approval cannot reset credentials. Receipt issuance is a private externally authorized identity procedure, represented by the real verifier SQL role plus disclosed synthetic attestation transport in tests, never a client identity_verified checkbox or public fixture endpoint.

## Boundaries and remaining B1

Forms clear secrets on submit/cancel, hold no credentials/tickets in browser storage or logs, use loading/disabled and live error states, and offer a fresh GET /login after expiration/uncertainty. Normal and operator-authorized password reset are covered; administrative MFA reset is a distinct remaining B1 capability (REQ-AUTH-034), not claimed by a password reset. Trusted-device and full AUTHZ public verticals follow sequentially. B1/AUTH-GATE-05 stay OPEN and no phase/production acceptance is inferred.
