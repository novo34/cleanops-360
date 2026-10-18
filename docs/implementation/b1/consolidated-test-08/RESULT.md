# SQL08 authorized execution — PASS; B1 remains OPEN

Functional source **80a193b0ea8ead58e999e669826f979c6a0b11b1**. Native PG16/Chromium [run39111607391 SUCCESS](https://github.com/novo34/cleanops-360/actions/runs/39111607391); [code CI39111607353 SUCCESS](https://github.com/novo34/cleanops-360/actions/runs/39111607353).

**134 checks PASS /0 FAIL/BLOCKED/SKIP**, including **23 real UI/API/PostgreSQL Chromium cases**:8 recovery,11 EMAIL,4 prior TOTP/session/step-up/enrollment/method-selection regressions. Exact approved08 blob **a585147fa19452de0f28d9c1d7542b3d77b058f7**, SHA-256 **566777536442e5ebe40a0fe7022eceb412c6089c23dfb9094611f934006780a2**. Original four blobs, full07→08 diff and exact ACL verified; fresh complete installation with function body validation enabled. No additional SQL/ACL installed. Backup/restore of all31 tables, cleanup and unchanged preexisting inventories PASS.

## Real security evidence

- Independent password-only browser is denied during recovery; no unauthorized enrollment/session. The actual SQL07 takeover from run39109078160 remains a historical FAIL, now covered by the passing08 regression.
- Every separated service/verifier login is denied direct SELECT/INSERT/DELETE, broker/owner role assumption and inherited private-table access. The broker remains NOLOGIN/NOBYPASSRLS, table owned by the DDL owner with forced RLS. Its internal broad policy is not claimed to filter tenants: isolation comes from private functions, subject predicates, locking and denial of direct role/table access.
- Authorized PREAUTH survives only with matching tenant/user/principal/cookie/generation. Cross-user/tenant enrollment arguments, forged/revoked/expired contexts and consumed proof denied. Other authorized memberships remain independent. Expiration/GC retains the marker and never reopens password-only enrollment.
- Recovery and first-factor races each have exactly one winner. Actual PostgreSQL connection termination at COMMIT produces503/57P01, zero ACTIVE and retained binding; only the legitimate bound retry creates one committed session,10 HMAC recovery codes and clears the marker. No session/cookie before COMMIT.
- New private reset reader: exact six-field projection, malformed/unknown/MFA_RESET/consumed tickets denied, invalid recovery/stale CAS rejected, valid private reader+CAS share one transaction and consume proof/increment generation. These native fixtures use explicitly synthetic PHC strings, not password-reset UI or policy acceptance. Code CI: lint/typecheck/build PASS,38 static tests PASS,192 B1 PASS,Vitest13 PASS/3 separate DB SKIP and57 fixture Chromium PASS. Typed parameterized reader/CAS calls and strict/redacted projections are implemented and unit-tested; public reset remains incomplete.

## Preserved attempts and correction

ATTEMPT_1.json:109PASS/16 real browser cases, before additional coverage. ATTEMPT_2.json:127PASS/2FAIL and ATTEMPT_3.json:132PASS/2FAIL, including aggregate process failure. The added first-factor COMMIT test used getByRole('status'), which matched both the polite error paragraph and the OTPAuth output's implicit status role. Final execution records STATUS_MATCHES_2, native503/57P01, ACTIVE_0_BINDINGS_1 and successful BOUND_FIRST_FACTOR_RETRY. The selector now specifically checks the error paragraph; all rollback/security assertions remain. No SQL or security control was weakened. Historical FAIL reports are unchanged.

## Individual requirement acceptance

New accepted rows: **REQ-AUTH-021,030,031,032,033** — first-factor activation, recovery generation on activation, one-time display, HMAC storage and single use. Each cites the exact successful source/run/cases in closure/requirements.json and e1-consolidation/REQUIREMENTS.json. Together with the4 EMAIL rows: **9/44**, in authorized isolated functional scope. The raw harness intentionally retains b1RequirementsAccepted=0; acceptance is a separate evidence assessment, not a count inferred by the runner. No production or formal phase acceptance.

## Remaining concrete dependency

Password reset from BOOTSTRAP cannot use existing reserve_owned, which requires ACTIVE or checked PREAUTH; V4 requires owned idempotency on mutations except login/verifyMfa. New SQL09 REVIEW ONLY adds one fixed resetPassword BOOTSTRAP/CSRF owned reservation, reusing existing completion/discard and tables, with no new table/role/RLS privilege. Exact diff/hash/request: ../../../proposals/b1-consolidated-sql/revisions/09/. It has not been installed and needs separate exact owner authorization. This is a missing reset integration contract, not another SQL08 repair.

Recovery-code vertical is complete in the isolated environment; full recovery/reset/admin-loss-of-all-factors remains OPEN. Trusted-device and AUTHZ public verticals follow sequentially after reset. Real authenticator-app compatibility and operational Swiss custody/proof/delivery responsibilities remain within B1. Runtime closedBackend; B1/AUTH-GATE-05 OPEN. No external SMTP, production, infrastructure activation, deployment or merge.
