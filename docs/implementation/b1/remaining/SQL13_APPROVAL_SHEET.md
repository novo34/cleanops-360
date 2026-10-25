> Current execution update (2026-10-18): owner authorization is recorded in ../consolidated-test-13/AUTHORIZATION.json and the append-only canonical SESSION-OWNER-RESOLUTION-2026-10-18.md. SQL13 exact bytes are installed/tested,24 directed cases PASS. Numeric12h/24h, expiry and no-extension tests PASS. Most-restrictive multi-role integration remains OPEN pending the separate uninstalled SQL14 candidate. The original review below is historical, not a renewed approval request.

# SQL13 approval sheet — unchanged REVIEW ONLY artifact

Verified against reference HEAD4b8c43a and its Git tree, with reproducible local full-content checks. Neither SQL12 nor SQL13 has been installed.

- Candidate blob: `7a2df8463e6c1a45b2a2c9005187c0269d2cf423`.
- SHA-256: `a052d028206d004b17c375bc56868d86c4014fc4dd72e0d78d8fdb49b741b279` (209170 bytes).
- Last authorized consolidated base: **SQL11**, blob `3f13bb1132c5b1ffdd35d4993bb9aa2ca3c75f06`, SHA-256 `54f9c0d94441ed3f72f6dc1c3d4d9bca1b9f0072a7d0f7c6059debe80eea9d6e`.
- [Complete exact SQL11→SQL13 diff](../../../proposals/b1-consolidated-sql/revisions/13/SQL11_TO_SQL13.diff), SHA-256 `e8d56b63f6c39f9dccbd4f49328bbc2a9c3d67447f12e19496e67a8dc3bf453e`.
- [Original full approval contract/risk explanation](../../../proposals/b1-consolidated-sql/revisions/13/APPROVAL.md) and machine manifest are unchanged.

## Only changes from the authorized base

1. New `auth_api.select_tenant_rotated_owned(text,bytea,bytea,uuid,bytea,bytea,uuid) RETURNS jsonb`. Parameters: current PREAUTH token, new cookie digest, new CSRF digest, target company, owned key/request digests, correlation. Owner cleanops_auth_broker; SECURITY DEFINER; exact search_path=pg_catalog; REVOKE ALL FROM PUBLIC; GRANT EXECUTE only to cleanops_identity_service (owner privileges remain implicit).
2. Existing `auth_api.record_security_event(text,bytea,bytea,bytea,uuid) RETURNS void`: append only POLICY_DENIED and STEP_UP_REQUIRED to the existing five-code allowlist. No signature/ACL/retention/body insertion change.

No table, column, role, RLS, direct table GRANT, existing signature or existing function-body change beyond that single allowlist. No SELECT/DELETE on security_log is granted. SQL12's exact previously uninstalled function is folded into one complete installable proposal, not an installed patch chain.

## Root causes

- Password-verified unbound SELECTION needs both PREAUTH and CSRF rotation under the approved V4 HTTP contract. Existing select_tenant only chooses a membership; begin_switch requires ACTIVE/source step-up. Current service safely returns503 rather than reuse a token or weaken the rotation requirement. New function couples owned reservation, current credential/membership/policy and digest CAS on the same PREAUTH row, preserving expiry and requiring destination MFA; it cannot issue a session.
- Generic authorization/step-up guards currently throw before durable failure accounting. Throwing aborts the transaction, and record_security_event rejects the two missing codes. SQL13 only allows those codes: TypeScript must still return a safe denial outcome after journaling so COMMIT persists only that denial/accounting, with no business effect, owned success, factor, cookie rotation or loss of ACTIVE. SQL installation alone does not complete AUD001.

## Risks and prepared negative validation

[Executable-case specification](SQL13_VALIDATION_PLAN.json): stale/revoked/foreign/expired bindings; forged tenant/user context; inactive memberships; wrong/foreign/expired/backend-or-xid-mismatched owned markers; equal/malformed new digests; simultaneous selection and replay; expiry/version changes during lock waits; failed/late factor preparation; sorted lock acquisition and rollback; pre-COMMIT failure versus uncertain acknowledgement; service-only function execution and no direct table access/role inheritance/BYPASSRLS escape; rejected arbitrary failure codes; keyed server-derived actor/operation without secret or cross-company exposure; denial COMMIT and preserved ACTIVE. All SQL13 cases are NOT_EXECUTED_APPROVAL_REQUIRED.

After exact approval: new isolated PG16 synthetic Docker, verify these bytes/diff/ACL, clean installation, directed native/security tests, connect existing broker/owned transaction path, directed UI/API/PG and affected regression, then delete owned resources and compare preexisting inventories. No new SQL/ACL, SMTP, production, deployment, merge or runtime activation is included.
