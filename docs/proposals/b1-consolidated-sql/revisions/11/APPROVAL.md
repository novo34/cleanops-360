# Subsequent owner authorization and isolated execution

The owner approved exactly the blob/hash and documented ACL below. [Auditable authorization](../../../../implementation/b1/consolidated-test-11/AUTHORIZATION.json); [real execution](../../../../implementation/b1/consolidated-test-11/EXECUTION.json): Actions 39124915880,333 checks and9 real Chromium cases PASS, cleanup PASS. No additional SQL/ACL was installed. The original request and REVIEW ONLY generator/manifest below are retained as proposal history; they are not a current pending approval. Production/runtime activation is not authorized.

# SQL11 — exact contract/ACL approval request, REVIEW ONLY

**Not installed.** No additional PostgreSQL schema/ACL has been executed beyond exact authorized SQL10. B1 remains15/44 and AUTH-GATE-05 OPEN; closedBackend stays connected.

- Candidate: PG-TEST-01-CONSOLIDATED-11.
- Blob: `3f13bb1132c5b1ffdd35d4993bb9aa2ca3c75f06`.
- SHA-256: `54f9c0d94441ed3f72f6dc1c3d4d9bca1b9f0072a7d0f7c6059debe80eea9d6e`.
- Size:205225 bytes.
- Base: exact authorized SQL10 blob68c0545f79cf15fa780566ebf4aab14b3ccb892b, SHA256d95e9896ebd12f840f00c12c97ffb9e8b17f3cfe28052655d7f4c4e80d3f5e4b.
- Full diff: [SQL10_TO_SQL11.diff](SQL10_TO_SQL11.diff), SHA256 `bacb95c11fae79a8fe2031e942995eb35cf5e5695c8088a08cd744334d9f4d5a`.
- Reproduce without a database: `python3 scripts/consolidate-b1-access-audit.py --check`; `python3 scripts/parse-b1-sql.py docs/proposals/b1-consolidated-sql/revisions/11/schema.review.sql`.

## Two grouped, reproduced AUTHZ causes

Source c27dbc68e23867d20a552da14c589d2d1f572568, Actions39119733531:89PASS/4FAIL, complete resource cleanup/preexisting inventories and31-table backup/restore PASS. Real identity-service role; fixture owner is used only to create synthetic test data and inspect outcomes.

1. Canonical RBAC_PERMISSIONS requires before/after/actor/reason and audit of relevant security/permission decisions (REQ-AUD-001, REQ-AUTHZ-007). Existing primitives record only `{count:1}` for success; denied changes are not persisted. Both mandatory audit assertions fail. The existing signatures have no reason input. This is not fixed by UI text or storing short-lived idempotency responses.
2. `set_access_role` always sets revoked_at=NULL. An operator with manage_permissions/access but without export/finance can reactivate a previously revoked role carrying that permission; an existing member then receives the permission. Real tests confirm operator permission=false, target permission=false before reactivation, primitive succeeds and target permission becomes=true. This bypasses the no-overdelegation boundary already enforced by set_role_membership/set_role_access_rule. Two negative assertions fail. No real data or productive permissions are involved.

## Minimal proposed contract and ACL

One new fixed-dispatch broker function:

`auth_api.change_access_owned(payload jsonb, key_hash bytea, request_hash bytea, corr uuid) RETURNS jsonb`

- Payload is a closed object for exactly USER_RULE, ROLE, ROLE_RULE, MEMBERSHIP or REVOKE, with the existing locators/values/expected_policy plus mandatory bounded reason. No tenant, actor, role authority, risk, arbitrary SQL or caller-supplied before/after.
- Reuses all five approved mutation primitives; their bodies/signatures are byte-identical. Adds the same no-overdelegation check before reactivating a revoked role's existing ALLOW rules.
- Requires the pending one-time changeAccess reservation for current tenant/user, exact key/request digest, backend PID and transaction ID, unexpired. Context/identity are server-resolved, never supplied by payload.
- Lock order: existing principal/session/membership context → owned reservation → exclusive tenant policy/CAS → effective authorization/fresh06 step-up → existing effect → server-derived before/after audit → caller owned completion/discard → COMMIT → HTTP. No SHARE-to-exclusive upgrade.
- Success returns only `{changed:true}`. Denial returns `{changed:false,error:<fixed enum>}` (STEP_UP_REQUIRED/POLICY_DENIED/ACCESS_CHANGE_REJECTED/INVALID_INPUT). No snapshots, SQL diagnostics or private context in HTTP. Denied target snapshots/resource are redacted to NULL.
- Known authorization failures are caught in a PL/pgSQL subtransaction: its partial work is rolled back, then a DENY audit is inserted in the outer transaction. Unexpected errors roll back the whole unit. The TypeScript caller commits an AuthError outcome only after owned discard; COMMIT uncertainty never produces success.
- Successful detailed audit is immutable `auth.access.change.detail`, correlated to the existing legacy success marker; no UPDATE/DELETE of historical audit rows. Both records together form the audit trail. Denials use `auth.access.denied`. Before/after come from tenant-filtered locked database state, not the request. Only permission metadata is captured; no password, MFA secret, recipient, ciphertext or cookie.

ACL delta: owner cleanops_auth_broker, SECURITY DEFINER, exact search_path=pg_catalog; revoke PUBLIC and grant the new function only to cleanops_identity_service. Revoke identity-service EXECUTE on set_user_access_rule, set_access_role, set_role_membership, set_role_access_rule and revoke_access_assignment. The owner can still invoke them inside the wrapper; ordinary service callers cannot bypass audit/reactivation checks. No direct table privileges, table/role/RLS changes or other new functions. No productive role assignments/defaults are introduced.

## Required owner decision and validation scope

Approve this **exact contract/ACL and identified complete artifact**, for fresh isolated PostgreSQL16 Docker installation with synthetic data, no public ports/shared volumes. No production, deployment, merge, external services or runtime activation.

After approval, validate exact bytes/diff and clean installation, private owner/search_path/EXECUTE matrix, denial of all five legacy entrypoints, no direct table access/BYPASSRLS/escalation, missing/foreign/expired/wrong-backend owned reservations, unsafe/unknown payload fields, policy CAS and cross-tenant targets, all five real UI→API→PG mutations, temporal role/user grants, explicit deny, no-overdelegation including legitimate/denied reactivation, immutable before/after/reason/actor and DENY audit, failed COMMIT, durable COMMIT/ack loss, one-time replay and backup/restore/cleanup. Keep B1/AUTH-GATE-05 OPEN. Static checks do not establish PostgreSQL compilation or functional/security PASS for SQL11.

The HTTP writer now calls only the audited capability and has no legacy fallback. On SQL10 that capability is absent and mutations fail closed; read-only/scoped access can still be validated independently. Thus the known reactivation path is not exposed through the current HTTP writer while approval is pending.
