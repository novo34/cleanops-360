# B1 private V4 broker increment

Base: 2aa3de262dbf7ee575153a2586803429d738c651. AUTH-GATE-05 OPEN. Runtime stays closedBackend.

## Implemented transport/repository

- Concrete parameterized calls for 29 existing V4 auth_api functions (plus the explicitly granted identity_private.verified_tenant read helper): identity, sessions, preauth, memberships, challenge/enrollment material and effects, CSRF/bootstrap, idempotency, rate attempts and security events.
- SQL names/casts are a fixed allowlist, never HTTP-derived. No direct table queries, SET ROLE, GUC authority, DDL, grants or seeds.
- Shared BEGIN READ COMMITTED / COMMIT / ROLLBACK runner uses one connection; completion resolves only after COMMIT. Failure discards the connection. Returned failed-factor outcomes may commit attempt counters.
- Scoped repositories reject use after transaction end, concurrent/unawaited calls, invalid result envelopes and further work after SQL failure. Caught SQL errors still prevent commit. Pending work drains before rollback.
- Unit tests check parameter separation, function-name drift against V4, connection lifecycle, poisoned transactions and unawaited work. They do NOT execute PostgreSQL or validate its locks/RLS.

## Implemented private compositions

- Own-session compositions require a separate cleanops_runtime pool: V4 grants them to runtime, not identity_service. They use begin_verified_context + identity_private.verified_tenant; they do not call identity-service-only active_summary or switch roles. EMAIL_OTP uses only the dedicated identity-service pool.
- currentIdentity and listSessions establish the server-token context and read broker-guarded own data on the same connection. Output tenant and session fields are checked and dates normalized.
- revokeSelf/revokeOthers reserve idempotency, invoke the guarded/audited own-session function and complete a safe response in one transaction. Replay validates stored tenant/operation/target. Single revoke counts cannot exceed one; bulk delegates current-session exclusion and tenant/subject locks to V4. Results escape only after commit.
- verifyEmailOtp reads the bound challenge, requires EMAIL_OTP, obtains HMAC32 from the same private provider/domain as issuance, and invokes verify_challenge with no TOTP counter. False commits the failed-attempt state; dependency errors roll back. Invalid code format submits a null proof to count the attempt. No OTP plaintext is passed to SQL, returned or logged. The provider must return a fresh owned digest buffer (zeroed on exit); no key-management/issuer implementation is claimed.
- These factories do not implement Backend.resolve/authorize/stepUp/execute, are not runtime wiring and do not issue real sessions. Other repository calls are concrete transport wrappers, not completed product workflows.
- Eight added composition tests use simulated connections/state for context, tenant output isolation, revocation/idempotent replay, revocation errors, commit failure, OTP attempts and concurrent one-time use, bulk A/u1 vs A/u2/B/u1, and effect+audit+reservation rollback. Simulations do not prove PostgreSQL semantics.

## Concrete contract gaps blocking full adapter completion

V4 login_material returns principal/hash/version but has no FOR UPDATE credential lock, password rehash/CAS function, or atomic expected-credential-version argument to new_preauth. Re-reading material cannot replace an actual lock/CAS; no password success adapter is claimed.

V4 challenge_material returns kind/method/grant/resource/ciphertext/key_version but omits method credential version, last_totp_counter, subject/tenant, challenge purpose and expiry required by verifyTotpFactor. enrollment_material similarly omits trusted context/counter/version. verify_challenge performs a monotonic counter update under its challenge lock, but accepts no expected method version/counter. Its existing definition does not satisfy the verifier callback's full contract. No synthetic metadata or weaker TOTP integration is installed.

active_summary/preauth_summary do not expose all fields needed for Backend.resolve (CSRF digest, idle expiry, complete trusted subject binding). V4 has no public identity-service broker guard for the separate Transaction.authorize/stepUp callbacks and no discard-idempotency function. Existing function-internal guards are used where available; no allow-all adapter is invented.

These gaps need a separately reviewed additive broker contract before safe Argon2id/TOTP CAS integration and a complete HTTP Transaction implementation. The canonical review-only SQL is preserved untouched. No complete adapter, real authentication, PostgreSQL/RLS validation or gate closure is claimed.

## Validation

Use the existing B1 no-database workflow for install, lint, typecheck, Node B1 tests, Vitest (DB cases skipped) and build. Actual SHA/run evidence is recorded in PR #7; no local or PostgreSQL checks claimed.
