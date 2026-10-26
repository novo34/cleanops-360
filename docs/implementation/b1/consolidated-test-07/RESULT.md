# SQL07 isolated execution

Source: `59855dd719712b80f11d953558cf6ba956af45f4`. Native run: https://github.com/novo34/cleanops-360/actions/runs/39102962461 . Code CI: https://github.com/novo34/cleanops-360/actions/runs/39102962409 . Both SUCCESS.

Exact authorized blob `099345e43c03a2ee3759fa0c2d5ef875121621fc`; SHA-256 `4c304916a76a700e37a069c947426874d73dace0016f3d2a5d3504ce9ba05456`. Full06→07 diff reproduced; only the five documented roots and two broker column grants. No extra SQL/ACL installed. Originals retained.

Installation PASS. Native battery: **253 PASS, 0 FAIL, 0 BLOCKED, 0 SKIP**. `EXECUTION.json` contains every individual result, exact image digest and approval. Includes prior19 failure regressions, service-role negatives, private-helper denial, forced RLS, cross-tenant denial, password/reset/recovery CAS, EMAIL AEAD with synthetic delivery, two-worker concurrency, claim/finish COMMIT loss, durable quarantine/GC, trusted-device expiry/revocation, PREAUTH rotation and all30-table backup/restore integrity. No provider or production integration claimed.

Native privilege gate ran before functional tests: both grants are column-only to a nonlogin broker; no service membership or direct update, helper execution, security_log read/delete or BYPASSRLS. All30 tables retain forced RLS. Cleanup PASS; inventories of preexisting containers/networks/volumes unchanged.

Code CI: lint, typecheck, build PASS; 182 B1 tests PASS; Vitest13 PASS/3 database tests SKIP; Chromium57 PASS with HTTP fixtures. These browser fixtures are not evidence of new UI→API→PostgreSQL flows. Historical294 baseline checks were not reexecuted in this targeted new-contract run and are not added to253.

B1 **0/44 accepted**, AUTH-GATE-05 OPEN, closedBackend unchanged. Native evidence supplements individual matrix rows without converting partial checks to full acceptance. Existing real-browser evidence remains separate.

Next executable work: complete isolated public HTTP/UI integration for EMAIL, recovery, trusted-device and access management using approved SQL07; execute real Chromium→API→PG paths. Preserve fail-closed where contracts cannot supply authorized method/challenge context; any necessary SQL/ACL extension must be a separately reviewed candidate, never installed under07 authorization. TOTP authenticator compatibility and operational key custody/acceptance remain to be evidenced. No next module started.
