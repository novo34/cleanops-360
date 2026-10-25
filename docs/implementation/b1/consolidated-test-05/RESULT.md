# CONSOLIDATED-05 — isolated SQL and private HTTP integration PASS; B1 OPEN

Exact source `56ebab0d824b7bece15167f0600d3fea03cf59bf`, [run39068144839](https://github.com/novo34/cleanops-360/actions/runs/39068144839), job117499979503. **294 PASS / 0 FAIL / 0 BLOCKED / 0 SKIP** in the final execution. Raw redacted individual checks, hashes, catalog/image/provenance and cleanup are in EXECUTION_REPORT.json; acceptance scopes are separated in SUMMARY.json.

## Integrity and native installation — PASS

Authorized SQL blob `62cec23e534fe15888ddba98cf76add7e857cfef`; SHA-256 `3f3c22e0bbdd5798806ed0810b1710fb2d55c34994cb5087652d4ce683d0258c`. Four originals and full approved role/helper/ACL/policy diff verified before submission. Same exact full SQL in every run; no supplementary SQL/ACL correction installed. Native PG16 installation with check_function_bodies=on compiled all74 declarations/66 final functions, 0 procedures, 12 triggers and35 policies. Approved dynamic installer loops executed. Image `postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4` (official16-bookworm).

## Real PostgreSQL — PASS

281 non-HTTP prerequisite/security/protocol checks preserve the254-case baseline (with only exact approved inventory/owner adaptations) and add27 purge negatives. Direct broker log SELECT/COUNT/DELETE denied; INSERT retained. Purger NOLOGIN/NOBYPASSRLS/no memberships/no schema CREATE/no table ownership, expiry-only column read/delete rights and FORCE RLS confirmed. Other log columns/UPDATE and future-row deletion denied or filtered as required. Helper no-args/void/SECURITY DEFINER/pg_catalog search_path/owner/EXECUTE ACL verified; all four service LOGINs denied direct helper execution and purger-role assumption. Two-principal expired/future data, actual maintenance-role rollback/concurrency, expired deletion/future preservation passed.

Prior real credential and global TOTP CAS races, versions/revocation, PREAUTH/MFA/session issuance, step-up, assigned enrolment/recovery batch, owned reservations/completion/replay, synthetic EMAIL outbox/claim/consume, tenant isolation/foreign negatives, row locks, functional rollback, failed COMMIT and backup/restore all passed. These are synthetic isolated protocol tests, not production permission grants, real external key custody, SMTP or final feature acceptance.

## Real private HTTP / Argon2id / TOTP / PG — PASS

10 cases exercise the **existing** HTTP handler, approved private backend, typed pg transport, mature Argon2id and OTPAuth, and canonical envelope seal/open helpers, with real PG service-role queries and committed data:

- Native61-byte envelope base64 lines[76,8].
- Known wrong and unknown passwords both rejected generically without session cookies.
- Correct password produces PENDING_MFA, not ACTIVE.
- Malformed TOTP cannot produce a session.
- Real TOTP proof → committed ACTIVE cookie/session and persisted global counter.
- Current identity and sessions list match server-authorized subject/tenant.
- Real step-up permits revoking other sessions while preserving current and foreign-tenant sessions.
- Logout revokes the current session, clears cookies, and subsequent identity access is denied.

A further3 checks create/restore a second post-HTTP snapshot and compare fingerprints of **all21 tables** after the HTTP mutations. Baseline restore and FORCE RLS checks remain. Source and restored data match. Same-cluster/ephemeral-key limits are explicit in RUNBOOK; this is not operational cold/key recovery.

The test uses a local Unix socket inside the owned container, without a public API port, network listener, browser stub, database mocks or superuser functional fallback. Fixture admin queries seed data/inspect persistence; HTTP backend receives only the identity-service pool. The production route still uses closedBackend. **Browser UI and the operative application route composition were not exercised with PostgreSQL.** Passing simulated Chromium tests is not credited as real UI E2E.

## Defect corrected from its cause

Actual HTTP verification initially returned503 because PostgreSQL RFC2045 base64 wrapping was rejected by a Node unwrapped-canonical-only check. Fixed **TypeScript transport validation only**, accepting exact canonical or PG76-column forms, still rejecting malformed whitespace before decrypt/CAS and preserving authenticated decryption/context/version checks. The new regression and real PG line-layout check demonstrate the correction. No SQL or security-contract modification was required.

Prior results are preserved: ATTEMPT_1 transport failed before HTTP; ATTEMPT_2 exposed real TOTP503; ATTEMPT_3 confirmed286 PASS after the code fix; ATTEMPT_4 exercised canonical helpers and added lifecycle tests but omitted the HTTP-required reason body for bulk revocation (400 INVALID_JSON, confirmed locally against the closed handler). The final harness sends the canonical Reason input. None of these failures was reclassified as a PASS or deleted. Scratch transport moved out of bounded PG /tmp into the owned container overlay; no shared volume or existing resource was touched.

## Cleanup and acceptance

Every owned container was removed; final before/after container/network/volume inventories match. No preexisting service/container/network/volume was modified. No production data, SMTP, deployment, merge or operative-backend activation.

**B1 accepted full requirements: 0/44.** REQUIREMENTS.json/md individually trace every canonical row, its actual partial checks, code/contract references and current missing acceptance obligation. The successful isolated PG/HTTP scope does not auto-accept UI, enrolment/keys, EMAIL delivery, recovery/admin/access, operating-profile or PO criteria. B1 and AUTH-GATE-05 remain OPEN, and the next module remains blocked.

Next milestone: finish E1 decisions/contracts D2/D3/D4 and C-SCOPE/C-LOGIN already specified in closure/PLAN.md, then complete the remaining real UI/operational acceptance paths within B1. Do not request another approval for unchanged05 tests. New SQL/ACL for unapproved recipient/recovery/admin contracts still needs its own exact authorization; no operational activation or providers are inferred from this successful run.
