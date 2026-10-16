# B1 HTTP/UI increment — implementation evidence

Source: original V4 contracts in `docs/canonical/auth-review/v4/`, published and reviewed in PR #6 (bd0de506d033f4c617d23c3be42fd325f21225f5). Owner authorization: PR #5 / 6198116976. No normative contract changes. AUTH-GATE-05 remains OPEN.

## Implemented

- Versioned 60-value trial configuration, five approved values preserved, 55 proposals clearly distinguished. Exact V4 profile enforced; missing/unreviewed values fail closed. Argon2id cost is trial-only, not production approval.
- Deterministically derived JSON OpenAPI and values; source SHA-256 and generator `--check`. Closed V4 schema vocabulary, strict input/output validation, Unicode lengths, UUIDs, enums, conditional step-up resource, all four auth states, generic errors and server correlation IDs.
- Thirteen Next route handlers at the exact V4 paths/methods, connected to one transactional HTTP service. Request streams capped at 16 KiB, no compressed bodies, strict JSON/UTF-8, query/path/header validation and default pagination limit. No implicit coercion of body fields or foreign actor selectors.
- Trusted HTTPS origin, same-origin browser metadata, digest-bound CSRF, duplicate-cookie rejection, Host/Secure/HttpOnly/SameSite cookies. Bootstrap digests must persist before cookies; authenticated cookies only after confirmed commit. Pending switch keeps source session but purges UI records. No browser-provided verified identity/counter/role.
- Transaction boundary for authorization/step-up, rate limits, idempotency reservation/effect/audit/completion. Scope includes verified binding/tenant/user/operation/key. Concurrency and rollback exercised with a serialized synthetic adapter. One-time enrollment/recovery output never stored as replayable plaintext. Failure counters commit via explicit typed outcomes; failed scoped reservations are discarded in the same transaction.
- Progressive rate/backoff policy kernel for user/IP/device dimensions (atomic HMAC-keyed shared storage is still the private adapter's responsibility).
- React login UI at `/login`: login, MFA/resend, tenant selection, TOTP URI/first-code flow, recovery-code display/dismissal, identity, own sessions, individual/bulk revocation, tenant-switch step-up and logout. All actions call the actual HTTP paths, with no mock routes or built-in identities.

## Coverage and actual execution

`npm run test:b1` (Node 24, native TypeScript, `--test-isolation=none`): 20 PASS, 0 FAIL. Includes positive dispatch/validated responses and unauthenticated denial for all 13 operations, contract bounds, fixture login→selection→MFA→ACTIVE, tenant-scoped idempotency, pending-switch source cookie, retry/one-time secret handling, CSRF, denied policy/step-up, byte/encoding limits, commit failure and safe dependency errors.

`python scripts/generate-b1-contracts.py --check`: PASS. These are no-database tests with explicit mock transactions/private verifier outcomes. They do not prove real password/TOTP verification, database locking, RLS or browser rendering.

Local lint, TypeScript check, Vitest and Next build were attempted: blocked because eslint/tsc/vitest/next are absent. Dependency installation cannot reach the configured proxy in this workspace. No repeated installation loop. Next's installed guide directory is also unavailable. New framework glue is limited to Request/Response route handlers, a page and the existing proxy; framework compilation/rendering remains unverified locally. CI `B1 no database` prepares these checks with Node 24 and empty DB variables. The inherited PostgreSQL workflow is skipped for B1 implementation PRs to avoid starting unauthorized PostgreSQL even as a CI service. No migration command appears in B1 CI.

Remote CI evidence on 397127b2c16af0fdf4b7d0a8d31d1e983b2cb512: [B1 no database run 38847777350](https://github.com/novo34/cleanops-360/actions/runs/38847777350) completed SUCCESS: dependency install, lint, typecheck, 19 B1 tests, 13 Vitest tests and Next production build. Three PostgreSQL cases skipped; inherited PostgreSQL job skipped. Build enumerated all 13 auth routes plus `/login`. This removes the compilation blocker using GitHub CI while the local proxy limitation remains. Browser rendering/E2E is still not certified.

## Material limits / next adapter

Production runtime is deliberately wired to `closedBackend`: 503, no bootstrap/session cookies, no identities/grants/seeds or enable flag. This increment is HTTP orchestration + UI with mock integration tests, not working integrated authentication. `CLEANOPS_AUTH_ORIGIN` must be the exact trusted HTTPS origin; absence/invalid configuration fails closed.

Next: implement the reviewed private password/TOTP verifier using mature libraries (Argon2id, compromised-password corpus, AEAD/HMAC), transactional broker adapter, shared rate buckets, signed cursor validation and persistence of ceremonies/idempotency/audits. The adapter must revalidate active memberships/credential version/revocation/expiry under ordered locks, bind step-up to rule/resource, verify requested factor/method/challenge and replay, and commit destination issuance + source revocation atomically. QR rendering via a mature local library, pagination UI and browser/E2E validation remain pending; currently enrollment displays the one-time provisioning URI, not a QR image. Do not treat the mock adapter as a runtime fallback.

PostgreSQL/migration/role/grant execution, even ephemeral, still needs separate authorization. This increment executes none of them. No administrative/System Status routes, deployment or merge. Review/acceptance of code and AUTH-GATE-05 closure are not claimed.
