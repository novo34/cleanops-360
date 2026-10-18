# SQL14 — most-restrictive server role risk — REVIEW ONLY

Not authorized or installed. SQL13 remains the only new executable authorization.
Exact bytes, Git blob, SHA-256 and complete SQL13 diff are in manifest.json and
SQL13_TO_SQL14.diff. Regenerate with `python3 scripts/consolidate-b1-role-risk.py --check`.
No original, approved SQL or frozen historical manifest is overwritten.

## Demonstrable contract gap

SQL13 issue_active_session and trusted_mfa_material read app.users.risk_class.
The approved AUTHZ writer assigns/reactivates role memberships without changing that
field; neither roles nor memberships carry an authoritative risk classification.
Consequently numeric 12h/24h tests cannot establish the newly required most-restrictive
multi-role policy. Role names/permissions and a client riskClass are not authority.

## Minimal proposed contract and ACL

- New private table identity_private.role_risk_catalogue(tenant_id uuid,role_id uuid,
  risk_class text), composite PK/FK to the existing tenant/role, exactly SENSITIVE or
  OPERATIONAL. DDL owner owns it, ENABLE/FORCE RLS. Only the existing nonlogin broker
  gets SELECT via its SELECT-only policy. PUBLIC, runtime, identity and mail have
  no direct privileges. No service/broker INSERT/UPDATE/DELETE or new role/grantee.
- New private identity_private.effective_risk(uuid,uuid) RETURNS text, SQL VOLATILE,
  SECURITY DEFINER, search_path=pg_catalog. Existing ownership pass sets broker owner
  and revokes PUBLIC. No application role receives EXECUTE. All reads filter tenant
  AND user; membership start/expiry/revocation and role revocation are checked at one materialized clock_timestamp instant taken
  on invocation after any caller policy wait; no stale statement-start time is reused.
- Existing reviewed SENSITIVE user classification is always the restrictive floor.
  An OPERATIONAL user plus any active SENSITIVE role becomes SENSITIVE. An active
  unclassified role on an OPERATIONAL user returns NULL and denies, never defaults.
  Pure operational roles remain OPERATIONAL. No label-based classifier or fictitious
  production UUID catalogue is supplied.
- Existing D1 material and session issuance consume the same function. Issuance takes
  policy SHARE before risk evaluation. Existing-session validation rejects a lifetime
  or idle allowance above current effective risk; it never extends an existing cap.
  Authorization revalidates after its existing SHARE wait. No SHARE is added to
  initial context(), avoiding AUTHZ SHARE→exclusive lock-upgrade cycles.
- One issuance timestamp governs created_at, last activity and both expiries. This
  prevents microsecond differences from violating a strict creation-time ceiling;
  no expiry tolerance is added. No public signature, role or existing RLS policy changes.
- The two existing role/membership table definitions move byte-identically before
  the new SQL-language helper's dependencies. No duplicate override/patch chain.

## Residual decisions and tests before installation/acceptance

Owner must approve the exact SQL14/ACL bytes before any installation. The reviewed
real tenant/role UUID→risk inventory must be supplied by the actual security policy
owner, never by client input. Its operational provisioning/change procedure must
lock the tenant policy row exclusively, record attributable change evidence and
invalidate affected sessions in the same transaction. No new operational writer or
permission to run such SQL is implicitly approved here.

After exact approval, install fresh in isolated PG16 and test actual mixed roles in
both orders; no-role, unknown/foreign/revoked/future/expired memberships; role
reactivation and membership changes against concurrent issuance/ACTIVE requests;
12h/24h and idle exact boundaries; no downgrade/renewal/trust/step-up extension;
all new direct SELECT/DML/EXECUTE/SET ROLE negatives; private helper tenant filters;
RLS ownership; authorization-lock waits, no upgrades/deadlocks; rollback/failed and
uncertain COMMIT; unchanged public signatures and legacy AUTHZ reactivation guard.
SQL-language/PLpgSQL static parsing is preventive evidence, not PG compilation or
proof of these races. SQL14 stays REVIEW ONLY until owner authorization and these
real results. B1/AUTH-GATE-05 OPEN; closedBackend unchanged.
