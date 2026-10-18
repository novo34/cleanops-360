# Current result — COMPLETE in isolated functional scope

REQ-AUTH-046 accepted; B1 **15/44**, AUTH-GATE-05 OPEN and closedBackend. Owner authorized exact SQL10 blob68c0545f79cf15fa780566ebf4aab14b3ccb892b / SHA256d95e9896ebd12f840f00c12c97ffb9e8b17f3cfe28052655d7f4c4e80d3f5e4b. Full diff/hash checked; no ACL/RLS/signature changes; exact complete SQL10 installed in fresh isolated PG16 Docker only.

Source d39220ce/run39117995423:32/32 actual service registrations without23514,8/8 simultaneous registrations, unchanged CHECK accepts exactly30days and rejects +1microsecond/zero duration.7 of8 real UI cases PASS; remaining test incorrectly expected409 after an approved rate budget legitimately returned429. Limits were not changed. Raw failed report retained.

Source bcad01e5/run39118251896:71PASS/0FAIL/0BLOCKED/0SKIP; two independent COMMIT fault cases PASS within ordinary budgets. Genuine termination-before-COMMIT rolls back; durable COMMIT/acknowledgement loss persists exactly one effect, returns503 with no new cookie, then replay409. Separate fixtures keep each fault case independent. Session token and expiry unchanged; client date manipulation rejected.

All9 distinct real Chromium cases are now individually PASS across the two pinned sources: registration/HttpOnly/digest/30days and stolen metadata without MFA bypass; expiry/company disable; one-time concurrency and foreign methods; precise keyset pagination and individual/global revocation; operator revocation with effective RBAC; password-reset and recovery invalidation; rollback/retry; durable COMMIT uncertainty/replay. JSON assessment ../consolidated-test-10/TRUSTED_ACCEPTANCE.json links every selected PASS to its actual raw source/run/case. It does not pretend that one9-test all-green workflow ran. Unaffected passed cases were retained as requested. No HTTP fixtures or injected auth cookies; only a stolen synthetic trust cookie is deliberately copied for its negative security test. Native role/table denial and actor-scoped data checks passed. All31-table dump/restore fingerprints and owned-resource cleanup/preexisting inventories PASS.

Runtime/production remains closed. This is individual isolated requirement acceptance, not B1/phase/production acceptance. Continue AUTHZ within B1.

---

# Historical state before owner SQL10 authorization

# Trusted Device — INCOMPLETE; real SQL09 defect requires SQL10 approval

B1 remains14/44, AUTH-GATE-05 OPEN, closedBackend. No requirement is newly accepted from code, units or a partial browser run. No new SQL/ACL was installed.

## Actual executed results

- Source3a57b5e, run39116850378: lint/typecheck PASS; B1 unit stage FAIL because an existing EMAIL contract test still expected21 rather than27 effective operations. Fixed the additive-operation expectation without changing the original14 operation contracts or canonical bytes. Native/browser tests did not execute on that run.
- Source0a5dd920fcde33b851181eda2e7d4ee85d0d0700, run39116963791/job117644600590: SQL09 installation/hash/diff PASS, targeted ACL/RLS gate PASS.8 actual browser cases executed:3PASS/5FAIL (62PASS/6FAIL checks including the overall process, not6 separate product defects). Administrative revocation with RBAC, reset invalidation and recovery-to-enrollment invalidation passed. No HTTP mocks or auth-cookie injection. One case deliberately copies only synthetic stolen trust metadata, never a session, to test absence of authority. Full E2E result FAIL.
- Source5197c46c99a06cf864042057d5d74ac1dcda6232, run39117274360/job117645498673:59PASS/1FAIL/1BLOCKED. Native repeated registration reproduced1 SQLSTATE23514 among32 calls (31 successfully rolled back); dependent Chromium correctly BLOCKED. Exact authorized SQL09 only. Cleanup and preexisting Docker resource inventories PASS. See raw reports for complete individual results.

Counts overlap and are not summed. Earlier accepted EMAIL/reset/recovery evidence is retained; unaffected historical253/294 suites were not rerun. Do not interpret individual native checks as functional acceptance.

## Causes and corrections

1. **Product SQL defect, installation blocked pending exact approval:** register_trusted_device calls clock_timestamp twice and intermittently violates its strict30-day expiry CHECK. SQL10 REVIEW ONLY captures a single timestamp; keeps the CHECK and every ACL/guard. [Exact artifact, diff and authorization scope](../../../proposals/b1-consolidated-sql/revisions/10/APPROVAL.md).
2. **Test fixture defect corrected:** an expiry fixture used creation31days ago and expiry1second ago, exceeding the same30day bound. It now sets an already-expired29day interval. This is synthetic test setup, not a product SQL change or weakened constraint.
3. **New TypeScript rate classification corrected:** trust revocations had been charged against the OTP-issuance bucket and could return429 instead of the intended authorization result after several actions. Registration retains its explicit existing protected-action budget; security revocations retain authorization, CSRF, step-up and owned reservations without consuming the OTP-send allowance. Limits are not increased or reset to obtain PASS.
4. Preserve PostgreSQL JSON timestamp precision in the new trusted-device keyset cursor, including submillisecond collisions. Cursor signatures remain actor/session-bound. Tests now exercise multiple pages and global revocation over more than page_max rows. These latest changes still await full real browser rerun after SQL10 approval.

## Implemented, not accepted yet

Existing auth panel now manages registration/status/list, individual/all-current-device revocation and administrator revocation with actual guarded SQL calls. Secure HttpOnly trust cookie is post-COMMIT, one-time idempotency keeps tokens out of stored results, safe HTTP projections and immutable context remain enforced. Trust never establishes PREAUTH/ACTIVE, removes mandatory MFA or extends session deadlines. No browser storage/fingerprints/secrets in logs. Runtime routes still use closedBackend.

Independent AUTHZ preparation now includes the five fixed mutation brokers, typed policy CAS and parameterization tests, on top of existing effective/access-detail readers. No public AUTHZ slice is claimed complete. This preparation does not require installing SQL10; AUTHZ remains INCOMPLETE and inside B1.

## Next action

Obtain the exact isolated SQL10 installation approval specified above. Then run the bounded trusted-device regression and correct any remaining TypeScript/UI defects under existing authorization, accept only complete requirements, and continue AUTHZ. No new module, production or runtime activation.
