# SQL13 — consolidated proposal, REVIEW ONLY

Not installed or authorized. SQL11 remains the only installed candidate. This complete proposal supersedes uninstalled SQL12 so the two known SQL-dependent B1 gaps can be approved together; originals and SQL12 history are preserved. The earlier pending SQL12 request does not authorize SQL13.

- Blob `7a2df8463e6c1a45b2a2c9005187c0269d2cf423`.
- SHA-256 `a052d028206d004b17c375bc56868d86c4014fc4dd72e0d78d8fdb49b741b279`, 209170 bytes.
- Full [SQL11 diff](SQL11_TO_SQL13.diff), SHA-256 `e8d56b63f6c39f9dccbd4f49328bbc2a9c3d67447f12e19496e67a8dc3bf453e`.
- Reproduce: `python3 scripts/consolidate-b1-denial-events.py --check`.

## Exact changes

1. Retains the exact SQL12 new function `auth_api.select_tenant_rotated_owned(text,bytea,bytea,uuid,bytea,bytea,uuid) RETURNS jsonb`, byte-identical, with its documented ownership, SECURITY DEFINER, pg_catalog search_path and identity-service-only EXECUTE. [Contract, locks, errors and negative tests](../12/APPROVAL.md).
2. In existing `auth_api.record_security_event(text,bytea,bytea,bytea,uuid) RETURNS void`, extends ONLY its event-code allowlist with `POLICY_DENIED` and `STEP_UP_REQUIRED`. Signature, body insertion, owner, search_path, role EXECUTE ACL, retention, purge and RLS remain unchanged. Existing accepted codes remain unchanged. No direct SELECT/DELETE, table, role, policy or existing signature changes.

The event-code change addresses a demonstrated service path: `createAuthHandler` currently throws POLICY_DENIED/STEP_UP_REQUIRED before any journal call, which rolls back the transaction. The approved private event helper rejects either code as INVALID_EVENT. The existing success-only append_audit helper cannot represent a failure and must not be used to fabricate a successful audit. AUTHZ's approved change_access_owned already persists its own detailed server-derived success/denial audit; it is not replaced.

V4 POSTGRESQL_RLS.md and SESSION_REVOCATION_CONTRACT.md explicitly separate failed security events from successful business audit. Existing private event records carry HMAC subject/network/device, fixed code, server timestamp and correlation. The future caller must derive the subject HMAC from the trusted binding kind/tenant/user or pretenant binding, fixed operation and reason; no client subject, raw cookie, CSRF, credentials, OTP or authorization detail may be stored or returned. The event is a pseudonymous security-failure journal, not an assertion of a successful business change. Unknown actor/invalid ingress cannot be given an invented user/tenant.

## Caller changes after exact approval and real SQL validation

Reuse Transaction.auditFailure and the typed securityEvent broker. For a successfully resolved binding whose guard returns false, append the correct fixed denial event and return the generic403 as an outcome so the outer COMMIT confirms only permitted accounting/journaling. Never reserve/finish an owned success marker, execute business effects, consume a factor, rotate a cookie, clear ACTIVE or grant a session. Unknown SQL errors, event insertion failure or COMMIT failure must fail closed and roll back. Do not turn an aborted SQL transaction into a successful journal write or claim durable evidence for lost COMMIT acknowledgement. Existing AUTHZ durable denial remains handled by its own function.

No guard handling is activated against SQL11, which would reject these new codes. No runtime flag/backend activation or HTTP contract expansion is proposed.

## Required tests after approval

Fresh isolated PG16 exact-hash installation; compare every ACL/signature/RLS to11, allowing only the new SQL12 function ACL. Verify the original five and two new codes; reject unlisted or client-injected codes; no direct table/helper execution by unauthorized roles; no cross-tenant/private-event reads; role inheritance/owner/BYPASSRLS negatives unchanged. Real UI/API denies missing authorization and missing step-up while preserving ACTIVE and making zero business changes, with trusted keyed subject, correct reason/correlation and durable event after COMMIT. Test rollback, failed COMMIT, event failure, retry and concurrent denial/success; no false success or duplicate one-time result. Run all SQL12 PREAUTH/CAS/rotation/isolation tests and directed regression. These are planned tests, not executed results.

## Exact authorization requested

Approve the identified complete blob, its single new function contract/ACL and two failure-event codes for installation/testing only in a NEW isolated PostgreSQL16 Docker with synthetic data, no public ports or shared volumes. No additional SQL/ACL, production, SMTP, infrastructure activation, deployment or merge. B1/AUTH-GATE-05 stay OPEN and runtime stays closedBackend.
