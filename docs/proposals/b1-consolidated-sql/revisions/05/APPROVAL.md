# Restricted security-log purge — CONSOLIDATED-05, REVIEW ONLY

Reference HEAD: `97515fb26c4ccdd8593de1b090b24b771d7e4ecb`. No installation or runtime activation is authorized. Original sources and consolidations 01–04 remain intact. 04 was stopped before installation because its broker column SELECT combined with `broker_private USING(true)` exposed every principal's expiration timestamps.

## Exact candidate and deltas

- Git blob: `62cec23e534fe15888ddba98cf76add7e857cfef`.
- SHA-256: `3f3c22e0bbdd5798806ed0810b1710fb2d55c34994cb5087652d4ce683d0258c`.
- Complete file: `schema.review.sql`; not an incremental deployment patch.
- `PARENT_04_TO_05.diff` compares against the blocked candidate; `NATIVE_03_TO_05.diff` compares against the last native-tested baseline.
- Generator pins all four original sources, incorporates only the prior syntax corrections, revokes broker security_log DELETE instead of granting it, replaces the one GC DELETE with PERFORM helper, and appends the exact versioned fragment `purge-boundary.review.sql` before COMMIT. No new retention interval, tenant filter assumption or production setting.

## Exact security contract for approval

| Object | Final authority | Allowed | Denied / boundary |
| --- | --- | --- | --- |
| `auth_api.gc_ephemeral() RETURNS void` | Existing broker owner / existing maintenance API EXECUTE | All existing maintenance actions, with security_log cleanup delegated in the same transaction | No public signature change, additional service caller or connection/commit |
| `identity_private.purge_expired_security_log() RETURNS void` | New `cleanops_security_log_purger` owner; LANGUAGE sql SECURITY DEFINER; search_path=pg_catalog | One qualified static DELETE, `expires_at<=statement_timestamp()` | No arguments, dynamic SQL, RETURNING, row count or returned log data |
| `cleanops_security_log_purger` | New NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOINHERIT, NOBYPASSRLS role | USAGE(identity_private), DELETE(security_log), SELECT(expires_at); owns only the helper | No memberships, CREATE, other table/column reads, INSERT or UPDATE; not the table owner |
| `security_log_purger_read_expired` | New SELECT RLS policy, purger only | `expires_at<=statement_timestamp()` | Unexpired rows hidden; no broker membership in this policy |
| `security_log_purger_delete_expired` | New DELETE RLS policy, purger only | Same expired-row predicate | Unexpired rows cannot be deleted |
| Broker | Existing NOLOGIN/NOBYPASSRLS role | Existing security_log INSERT; helper EXECUTE | No SELECT on any security_log column; DELETE explicitly revoked; cannot assume purger |
| Runtime, identity, mail, maintenance and PUBLIC | Existing approved API boundary only | Maintenance calls existing gc_ephemeral | No direct helper EXECUTE, log table reads/DML or purger membership |

The table's ENABLE/FORCE RLS and existing policies remain unchanged. The two new policies apply only to the separate purger, which does not inherit broker or DDL-owner privileges. The existing all-row broker policy does not grant table rights absent the ACL. Removing broker DELETE also prevents a compromised broker-owned function from deleting arbitrary security_log rows directly. All other function bodies, public signatures, service grants and application tables remain unchanged.

Install dependencies: V4 table/security-log INSERT and existing FORCE RLS; B1-X/D1 unchanged; then new role, schema/table/column privileges, two policies, helper, explicit helper ownership/REVOKE/GRANT, and the single outer COMMIT. The installer needs its already-authorized isolated administrative DDL authority to assign the new owner. The new role receives no temporary CREATE grant. Earlier PL/pgSQL GC definition resolves the helper when executed, after the full transaction installs it; this dependency needs native validation.

## Scope and residual risk

Purge remains global across principals by design, because security_log has no tenant_id and the existing job removes globally expired records. The new role can read expiry timestamps **only for expired rows**, not log payload/digests; this purpose-specific cross-principal capability is explicit, not an assertion of tenant-scoped ownership. The broker cannot retrieve timestamps through the void helper. A caller with valid existing maintenance authority can trigger cleanup and observe timing/errors; timing side channels are not claimed eliminated. Trusted DB administrators can still administer roles/tables. Role-membership drift, helper replacement and new permissive purger policies must be audited.

No claim of native SQL compilation, RLS enforcement or acceptance is made from static/parser tests. Canonical SQL, ACL and installed behavior are not silently changed. D2/D3/D4, closedBackend, EMAIL and enrolment runtime restrictions, B1 and AUTH-GATE-05 OPEN remain unchanged.

## Required real PG16 acceptance after exact-hash authorization

1. Fresh isolated synthetic install; 74 declarations/66 final functions, original 21 FORCE-RLS tables, existing triggers plus two added policies; no procedures introduced. Validate actual object owners, ACL/search_path and all qualified dependencies.
2. Catalogs: broker has INSERT only on security_log, no SELECT column or DELETE; purger has DELETE + SELECT(expires_at) only, no CREATE/LOGIN/BYPASS, memberships or table ownership. All service accounts remain non-superuser/NOBYPASSRLS and cannot assume either role.
3. At least two synthetic principal digests with expired and future rows. Broker SELECT of expires_at, other columns, COUNT(*) and direct DELETE must all fail. All service direct reads and helper calls fail. Test membership denial through SET ROLE, not by granting a role to obtain PASS.
4. Privilege-test-only administrative SET ROLE purger (never a functional caller): unexpired rows invisible; other columns/INSERT/UPDATE denied; attempts to delete unexpired rows leave them intact. Verify the table is FORCE RLS and purger not owner. No caller bypass disables RLS.
5. Functional maintenance LOGIN calls gc_ephemeral: expired rows across both principals removed, future rows preserved, no data or counts returned. Broker-owned helper delegation validated without superuser functional calls.
6. Repeat within BEGIN/ROLLBACK and terminated service transaction before COMMIT; no expired-row deletion persists after failure. Concurrent jobs remain safe and do not change future rows; fixed statement_timestamp cutoff, not browser-controlled time.
7. Repeat all 254 prior PG checks plus these new negatives; full backup/restore and original cleanup/inventory controls. Actual crypto/key custody and real UI/API/DB E2E acceptance remain separately evidenced and must not be inferred from SQL PASS.

## Decision requested

Approve this exact full candidate and the explicit new internal role/helper, restricted expiry policies and broker DELETE revocation for NEW isolated PG16 synthetic validation only. Approval of 04 does not cover these changes. No installation workflow is added or enabled in this proposal.
