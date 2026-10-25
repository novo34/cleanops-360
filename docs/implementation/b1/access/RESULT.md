# AUTHZ — complete in isolated functional scope

B1 **22/44** individually accepted; AUTH-GATE-05 OPEN, runtime `closedBackend`. This is not production/phase activation. No productive role policy, SMTP, deployment or merge was performed.

## Exact installation and executable evidence

Owner-approved SQL11 blob `3f13bb1132c5b1ffdd35d4993bb9aa2ca3c75f06`, SHA256 `54f9c0d94441ed3f72f6dc1c3d4d9bca1b9f0072a7d0f7c6059debe80eea9d6e`. SQL10/originals remain byte-identical. Exact full diff/generator and four historical canonical blobs verified before Docker. Only the approved consolidated SQL was installed, from scratch, with function body validation enabled. No additional SQL/ACL candidate was installed.

Source `38e385e9cbf33d2030d8b924d747eaf057bb92c2`, [Actions 39124915880](https://github.com/novo34/cleanops-360/actions/runs/39124915880): **333 checks PASS,0 FAIL/BLOCKED/SKIP**,9 real Chromium UI/API/PG cases PASS. [Raw redacted report](../consolidated-test-11/EXECUTION.json). The327-check/eight-browser core run39124614341 remains separately recorded; do not sum counts across reruns. The10,150 matrix evaluations are decision cells, not10,150 end-to-end tests.

New PG16 Docker: network=none, no public ports/binds/shared volumes, temporary tmpfs and synthetic fixtures. Functional calls use ordinary non-superuser/non-BYPASS identity-service credentials. Fixture owner only prepares synthetic data, observes locks/audit and injects test faults.31-table backup/restore integrity, owned resource removal and unchanged preexisting container/network/volume inventories PASS.

## Completed AUTHZ behavior

Existing auth panel: Administration → Users → User Detail → Manage Access. Real authorized reads/effective checks and five mutation types: individual overrides, role create/edit/reactivation, membership, role rules and revocation. Explicit dates, reason and policy CAS. No client tenant/actor/risk/label authority. All seven basic actions are checked through the real HTTP effective-access endpoint; missing grants deny.

SQL11 is the only writer capability. Exact SECURITY DEFINER owner/search_path/PUBLIC restrictions and identity-service EXECUTE verified. All five legacy EXECUTE grants revoked effectively; direct legacy role mutation actually fails42501. No direct service table privilege, owner membership, BYPASSRLS or productive grant is introduced. The existing runtime remains closed; only the isolated private composition uses the installed capability.

Reactivation above the actor's effective permission is blocked; target never gains that permission. Legitimate reactivation with the actor's explicit power passes. Current tenant/user/method/context are server-resolved. Missing, foreign, expired or different-backend/xid owned markers deny. Stale policy CAS denies. Row-lock overlap is observed between **two PostgreSQL connections**, with exactly one CAS winner and one durable denial, separate from concurrent HTTP requests serialized through the fixture IPC.

Canonical RBAC decision matrix:10 role labels ×145 valid action/resource cells across23 resources ×7 states =10,150 real effective_access evaluations. Role names alone confer nothing; explicit scoped grants, peers, cross-tenant, individual deny precedence, expiry and revoked membership are checked in an existing ACTIVE session. Resource lineage/move, cross-tenant parent FK and cycle fail-closed cases pass. Synthetic grant fixtures are not productive permission defaults.

Detailed SUCCESS audit derives actor/before/after from locked server state plus validated bounded reason; denied business changes with a valid owned reservation persist a redacted DENY in the outer committed transaction. No audit snapshots are returned by HTTP. Real forbidden HTTP change records DENY, returns only the canonical safe error envelope and preserves ACTIVE. SQL/protocol errors that abort the transaction and failed COMMIT do not falsely claim a persisted audit; whole-B1 security-event acceptance remains open.

Nine Chromium cases cover all five mutation types, temporal activation/expiry, scoped/foreign access, default/explicit deny, stale CAS, owned retry/duplicate handling, actual pre-COMMIT backend termination and rollback, password PREAUTH denial, durable denied HTTP audit, and directed login/TOTP/persisted-session/step-up/revocation/logout regression. The failure test preserves a previously committed DENY while rolling back the later mutation/audit/owned result.

## Demonstrated defects corrected without additional SQL/ACL

- Wrapped select labels included option text and blocked exact label navigation. Explicit label/htmlFor/id associations resolve the reproduced pre-submit failures and the complete Chromium paths now pass.
- Test-only digest calculation initially attempted inaccessible crypto schema calls from the service login. Digests now use standard client-side SHA256; no privilege expansion.
- Test fixtures needed fresh step-up evidence after policy CAS changes. They now exercise the actual current version instead of expecting stale evidence to authorize a write.
- The old COMMIT injector recognized legacy primitives only. It now recognizes the new approved dispatcher and actually terminates the connection before COMMIT; no successful write is mislabeled as a rollback.

Historical failed attempts remain ATTEMPT_1/2/3.json. SQL10 native89PASS/4FAIL and the earlier broad timeout remain historical failures, not rewritten PASS. Current full SQL11 paths terminate and pass; no new SQL patch was required.

## Acceptance and remaining B1

REQ-AUTHZ-001..007 individually accepted using the real report, not UI screenshots/unit mocks or a test-count percentage. The raw runner automatically accepts0 requirements; the separate criterion-by-criterion assessment adds7 to the previously accepted15. REQ-AUD-001 and whole-module isolation/security/operational obligations are not inferred complete from this AUTHZ slice.

[Every remaining requirement classified](../consolidated-test-11/REMAINING.md):22 remaining rows distinguish uncovered/unevaluated acceptance evidence from operational custody/compatibility/delivery/session-profile decisions and formal Product Owner acceptance. No known critical SQL11/AUTHZ functional defect remains in the executed scope. No next module is started.
