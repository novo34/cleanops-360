# AUTHZ — INCOMPLETE; exact SQL11 approval required

B1 **15/44**. REQ-AUTH-046 Trusted Device COMPLETE in isolated functional scope; its9 distinct real Chromium cases/native boundary/concurrency evidence are retained in ../consolidated-test-10/TRUSTED_ACCEPTANCE.json. No AUTHZ requirement is accepted from preparatory code, mocks, a partial UI or native function counts. B1/AUTH-GATE-05 OPEN; runtime closedBackend. SQL10 PASS; SQL11 not installed.

## Actual real runs

| Source | Actions run | Result | Scope |
|---|---|---|---|
| 9f479c975468c3a2e11f440b9544f143cfa3d103 |39119281493|FAIL|Broad7-case Chromium attempt exceeded the bounded480s process limit; raw BROWSER_TIMEOUT.json retained. No individual completed E2E case is invented from that timeout. Cleanup PASS.|
| c27dbc68e23867d20a552da14c589d2d1f572568 |39119733531|89PASS/4FAIL|Actual identity-role AUTHZ acceptance negatives, ACL/RLS checks,31-table backup/restore, cleanup/preexisting inventories PASS. Four failures reveal two grouped SQL causes, below.|
| 89214ad9e67a161cbadc504a5f7e89055e860088 |39120467924|86PASS/0FAIL/0BLOCKED/0SKIP|3 real Chromium read-only/fail-closed flows, real service-role PG10, scoped access and PREAUTH denials, backup/restore and cleanup. Retains the known native failures; does not rerun or erase them.|

Counts overlap; do not sum them. Exact raw reports carry source/run/job. The86PASS run proves only its explicitly selected safe scope, not complete AUTHZ or all44 requirements. [Code CI39120467981](https://github.com/novo34/cleanops-360/actions/runs/39120467981) is SUCCESS: lint/typecheck,47 static tests including SQL11 PostgreSQL grammar/reproducibility,207 B1 tests, Vitest13PASS/3separateDBSKIP, build,57 fixture Chromium PASS. Fixture Chromium is not real PostgreSQL acceptance.

## Implemented and validated independently

The existing auth panel hosts Administration → Users → User Detail → Manage Access. Authorized read projection includes roles/rules/dates and current server can_manage flags; a read-only actor sees disabled mutations. Own-session effective access is checked by the API, never inferred from role labels, client tenant/actor values or UI visibility. Real tests prove cross-tenant detail denial, foreign-resource=false, preserved ACTIVE on errors and no authority from password PREAUTH even with operator role fixtures. No browser storage or auth-cookie injection.

Mutation forms and strict HTTP input cover user/role rules, role creation/editing, membership and revocation with explicit dates, reason and policy CAS. They are **not accepted as functional writes**. The HTTP writer now calls only change_access_owned with its exact current owned marker and has no legacy fallback. SQL10 does not contain that proposed capability: the actual private SQL call fails42883, HTTP returns generic503, the transaction/reservation rolls back and policy/audit counts remain unchanged. This fail-closed restriction prevents the known role-reactivation path through the current HTTP writer. Runtime remains closed; no operational authentication is activated.

## Reproduced acceptance/security causes

1. Existing permission primitives append only a count-only SUCCESS audit. They cannot persist required before/after/reason through their existing signatures, and denied changes leave no durable DENY audit. Mandatory assertions fail against actual stored audit rows. Normative references: REQ-AUD-001 and canonical RBAC_PERMISSIONS audit-trail criteria; not a newly invented requirement.
2. A manage_permissions/access operator without export/finance can call set_access_role to clear revoked_at on an existing privileged role. An existing member then gains export/finance. Tests demonstrate operator=false, target=false before, forbidden primitive success, target=true after. This bypasses the no-overdelegation boundary already enforced by the approved role membership/rule primitives (REQ-AUTHZ-007). Tests use synthetic data; caller is the real non-superuser identity service, not the fixture owner.

Both are addressed together by one complete SQL11 REVIEW ONLY proposal. It reuses the five approved primitive bodies, adds one owned audited dispatcher/role-reactivation guard and revokes the five legacy service EXECUTE grants to prevent bypass. No direct table privilege, role, table or RLS change; all exact deltas are in the manifest/full diff. It has **not** been PostgreSQL-installed or declared functionally fixed. [Exact contract/ACL and approval request](../../../proposals/b1-consolidated-sql/revisions/11/APPROVAL.md).

## Timeout status and remaining functional work

The broad timeout is not declared solved by three different safe tests. Absolute URLs for manually created browser contexts, bounded15s action deadlines and redacted HTTP-status/setup SQLSTATE diagnostics are now present; the selected three tests terminate and pass. The complete five mutation flows and broad timeout reproduction remain mandatory inside B1 after the audited SQL capability is approved/installed. Do not mark the old7-case attempt PASS, extrapolate all mutations from reads or move these obligations to another phase.

Next exact action: owner approval of SQL11 contract/ACL/blob for fresh isolated PG16 synthetic validation. Then install only that artifact, test positive/negative audited mutations and role reactivation, all7 actions/required scopes/role/temporary/override cases, actual concurrent CAS/owned/COMMIT failures and complete Chromium mutation flows. Accept requirements individually only on complete evidence. No other module, production, deployment, merge or external service.
