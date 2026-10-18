# SQL14 review and exact installation decision

Reference649619b; B1 remains41/44. REVIEW ONLY, not installed. Current manifest.json
pins the SQL blob/SHA256 and full SQL13_TO_SQL14.diff SHA256. SQL13 canonical and
its real evidence remain intact; only proposed SQL14 and preparation files changed.

## Root cause and corrected review finding

SQL13 session issuance and D1 factor material consume app.users.risk_class. Approved
role assignment/reactivation never aggregates risk into that field. Therefore an
OPERATIONAL user with a sensitive role could retain the24h/8h profile. Neither role
labels nor client risk/tenant/user fields can be used to repair this authority gap.

The previous uninstalled SQL14 blob e99b1ba7b39e36ce77deb8e0e27c4e57d9256501
also had a generator defect: its globally matched SELECT anchor placed a recheck in
consume_email_v2 instead of binding_authorization. Corrected before authorization:
function-scoped generation, exact four changed-function inventory, authorization
check after its ordered policy SHARE lock, EMAIL body byte-identical to SQL13.
The old hash is superseded; no SQL14 version was installed or functionally accepted.

## Full diff inventory / privileges

- New private identity_private.role_risk_catalogue(tenant_id uuid,role_id uuid,
  risk_class text), composite PK/FK, owner cleanops_ddl_owner, ENABLE/FORCE RLS.
  Exactly `GRANT SELECT ... TO cleanops_auth_broker`; SELECT-only broker policy.
  PUBLIC/runtime/identity/mail have no direct privileges. No broker DML, no new
  service writer, no new role/membership, no change to existing table RLS policies.
  Broker's internal read policy is broad; external safety depends on absence of
  executable/direct-access bypass and the private helper's strict tenant/user
  predicates. These require actual negative tests, not a documentation-only PASS.
- One private identity_private.effective_risk(uuid,uuid) RETURNS text, VOLATILE,
  SECURITY DEFINER, search_path=pg_catalog; existing owner pass assigns broker and
  revokes PUBLIC. No application-role EXECUTE grant. Materialized current clock and
  active membership classifications avoid stale statement-start time after waits.
- Exactly four existing bodies change: identity_private.valid_session,
  auth_api.issue_active_session, auth_api.trusted_mfa_material,
  auth_api.binding_authorization. Public signatures stay identical.
- Two existing role/membership definitions move byte-identically before the new
  SQL helper dependency; no duplicate override. One timestamp defines session
  creation/idle/absolute expiry without adding a cap tolerance.
- No MFA requirement, idle/absolute value, recovery, EMAIL body or trusted-device
  duration is relaxed. No SQL14 executes in current workflows: only offline parse,
  generator checks and TypeScript analysis apply.

## Expected multi-role behavior

|Trusted server data|Effective policy|
|---|---|
|Sensitive user baseline, with any roles|Sensitive12h absolute /30min idle; baseline cannot be relaxed.|
|Operational baseline, exclusively classified active operational roles or none|Operational24h /8h.|
|Operational baseline and at least one classified active sensitive role, all active roles classified|Sensitive12h /30min, independent of assignment order.|
|Operational baseline and any active unclassified role|Fail closed, including mixed known-sensitive/unknown roles; no guessed risk.|
|Foreign user/tenant, revoked/future/expired membership or revoked role|Cannot add authority or change this user's effective risk.|
|Previously issued24h/8h session becomes too permissive|Reject; require fresh valid authentication under restrictive policy. No silent renewal.|
|Risk becomes less restrictive|Previously issued expiry and idle allowance remain unchanged.|

Role catalogue values must come from the designated server/security policy owner,
not labels/permissions or HTTP. Real UUID classification and an attributable
provisioning/change procedure (exclusive tenant policy lock, audit, invalidation)
are operating dependencies; this proposal creates no unapproved metadata writer.

## Prepared tests and acceptance boundaries

TEST_PLAN.json names20 native policy/ACL/transaction tests implemented as an inert
export in scripts/pg14-role-risk-tests.ts, and8 additional mandatory real UI/temporal/
security/cleanup scenarios requiring the authorized harness. None ran against SQL14.
Native VERIFIED PREAUTH is explicitly synthetic setup, not password/MFA evidence.
The future harness must verify exact approval/hash/isolation before invoking tests.
No module connects, installs SQL or starts a database upon import.

Independent current work completed: exact function-scope regression checks,
prepared native tests, unchanged41-row evidence provenance inventory, and the full
manual PO dossier at docs/implementation/b1/remaining/PO_MANUAL_DEMONSTRATION.md.
No historical PostgreSQL/Chromium battery needs repetition unless SQL14 affects it.
Reuse SQL13 evidence; target session/material/authorization/role/ACL regression.

## Remaining acceptance, actual responsible parties and evidence

|Criterion|Missing action/evidence|Responsible|
|---|---|---|
|SEC021|Approve exact current SQL14/ACL, fresh isolated PG16 installation and actual mixed-role/negative/concurrency/UI evidence; Security accepts effective policy and owner records acceptance. Numeric12h/24h decision is already approved, not reopened.|Owner authorizes; engineer/QA executes; designated Security reviewer validates.|
|PR006|Actual independent review of final build; actual manual PO outcomes; Swiss OpenBao/custodian/workload identity, tenant/key isolation, rotation/old-key reads and recovery/restore, Swiss storage/backups/support boundary and required RPO≤15min/RTO≤4h evidence.|Owner designates real custodian/infrastructure/reviewer/tester. DevOps/Security supply actual operating evidence. PO performs manual acceptance. None is fictitiously assigned.|
|PR007|Every mandatory requirement/gate satisfied and phase decision signed via PHASE_ACCEPTANCE_TEMPLATE; no successor module before acceptance.|Product Owner.|

No actual Swiss OpenBao infrastructure, named custodian or external SMTP evidence
has been supplied by this review. Their absence blocks operating/formal acceptance;
it does not prevent the authorized synthetic isolated SQL14 test after artifact
approval. A fresh isolated Actions PG16 runner can reuse the established test
transport; local Docker access is not a prerequisite. No real infrastructure,
production, deployment, merge, SMTP or runtime activation is authorized. closedBackend,
B1 and AUTH-GATE-05 remain unchanged/OPEN. No approval from this reviewer is a PO sign-off.
