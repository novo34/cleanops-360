# B1 private V4 broker increment

Base: 2aa3de262dbf7ee575153a2586803429d738c651. AUTH-GATE-05 OPEN. Runtime stays closedBackend.

## Implemented transport/repository

- Concrete parameterized calls for 29 existing V4 auth_api functions: identity, sessions, preauth, memberships, challenge/enrollment material and effects, CSRF/bootstrap, idempotency, rate attempts and security events.
- SQL names/casts are a fixed allowlist, never HTTP-derived. No direct table queries, SET ROLE, GUC authority, DDL, grants or seeds.
- Shared BEGIN READ COMMITTED / COMMIT / ROLLBACK runner uses one connection; completion resolves only after COMMIT. Failure discards the connection. Returned failed-factor outcomes may commit attempt counters.
- Scoped repositories reject use after transaction end, concurrent/unawaited calls, invalid result envelopes and further work after SQL failure. Caught SQL errors still prevent commit. Pending work drains before rollback.
- Unit tests check parameter separation, function-name drift against V4, connection lifecycle, poisoned transactions and unawaited work. They do NOT execute PostgreSQL or validate its locks/RLS.

## Concrete contract gaps blocking full adapter completion

V4 login_material returns principal/hash/version but has no FOR UPDATE credential lock, password rehash/CAS function, or atomic expected-credential-version argument to new_preauth. Re-reading material cannot replace an actual lock/CAS; no password success adapter is claimed.

V4 challenge_material returns kind/method/grant/resource/ciphertext/key_version but omits method credential version, last_totp_counter, subject/tenant, challenge purpose and expiry required by verifyTotpFactor. enrollment_material similarly omits trusted context/counter/version. verify_challenge performs a monotonic counter update under its challenge lock, but accepts no expected method version/counter. Its existing definition does not satisfy the verifier callback's full contract. No synthetic metadata or weaker TOTP integration is installed.

active_summary/preauth_summary do not expose all fields needed for Backend.resolve (CSRF digest, idle expiry, complete trusted subject binding). V4 has no public identity-service broker guard for the separate Transaction.authorize/stepUp callbacks and no discard-idempotency function. Existing function-internal guards are used where available; no allow-all adapter is invented.

These gaps need a separately reviewed additive broker contract before safe Argon2id/TOTP CAS integration and a complete HTTP Transaction implementation. The canonical review-only SQL is preserved untouched. No complete adapter, real authentication, PostgreSQL/RLS validation or gate closure is claimed.

## Validation

Use the existing B1 no-database workflow for install, lint, typecheck, Node B1 tests, Vitest (DB cases skipped) and build. Actual SHA/run evidence is recorded in PR #7; no local or PostgreSQL checks claimed.
