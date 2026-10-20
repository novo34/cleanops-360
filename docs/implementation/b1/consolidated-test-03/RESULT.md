# CONSOLIDATED-03 — installation PASS, PostgreSQL battery FAIL

Source `d84dd8b8d73ec9c6f9e066a08f6c54c4e35f17d5`; [run 39046545296](https://github.com/novo34/cleanops-360/actions/runs/39046545296), job `117436301073`. Redacted exact-run checks/provenance are in `EXECUTION_REPORT.json`; prior harness defects remain in ATTEMPT_1/2, not erased or classified as successful SQL tests.

Approved blob `7290c09ab32b74fecc4c39dc5d91a3bbc7f2723e`; SHA-256 `07e6637d1d39b50962bc2a034416f8e43bdbb0ec775234a20d12998bf58ec779`. Hashes/originals, full diff, ACL/signature invariance verified. All executions submitted identical approved SQL; no extra SQL definitions or privileges were installed.

## Real results

**253 PASS / 1 FAIL / 0 BLOCKED / 0 SKIP** in the final PG run. The count includes prerequisites, negative controls and planning probes, not 254 accepted B1 requirements.

- Complete native PG16 installation PASS: 65 final functions, 0 procedures, 12 triggers, 33 RLS policies; original 73 declarations compiled including replacements. Approved dynamic installer loops executed. Native function-body checking enabled.
- Service-role ACL, no broker/DDL membership or superuser/bypass, all 21 forced-RLS tables, safe SECURITY DEFINER owner/search_path, trusted contexts, positive/negative two-tenant isolation PASS.
- Real credential CAS race, stale credentials, PREAUTH, locked method generation, global TOTP counter race/replay, MFA→ACTIVE issuance, consumed PREAUTH denial, session ownership/revocation/audit PASS.
- Owned reserve/completion concurrency, no stealing committed PENDING ownership, replay/mismatch, CSRF/bootstrap and trusted binding checks PASS.
- STEP_UP challenge/CAS/policy-bound evidence; assigned-UUID enrolment, recovery batch and version trigger; local synthetic EMAIL outbox/worker/OTP valid/invalid/replay PASS. No SMTP or real key/crypto acceptance is claimed.
- Expiry, stale/revoked method, changed credential version and disabled tenant denials PASS. Fixtures preserve the second tenant and restore baseline lifecycle state where needed.
- Row-lock timeout, explicit/error rollback, actual service transaction termination before COMMIT and no persisted reservation, legacy COMMIT failure, session/audit effects PASS.
- pg_dump/restore, persisted session-state fingerprint and all 21 restored RLS tables PASS. Scope is same owned cluster/second DB, not complete disaster/key recovery; see RUNBOOK limits.
- New container network none/no ports/no bound/shared volumes; removal and matching pre/post container/network/volume inventories PASS. Existing resources were not modified. Complete image digest is in the report.

Offline PostgreSQL-16 parser validated all 73 declarations; regression catches historical 02 and multiple unrelated syntax errors. Its explicit RETURNS TABLE parser adaptation is documented in RUNBOOK and is never installed. Native untouched declarations compiled successfully. No syntax error remains demonstrated in 03.

## One demonstrated SQL/ACL defect

`API-plan-probe-gc_ephemeral`: **42501 permission denied for table security_log** under the non-superuser maintenance service account. This is **not** an expected business rejection, despite the initial outcome label in raw attempt-3 evidence; its status is FAIL, and the reporter's future label has been corrected.

Cause: V4 grants broker INSERT and DELETE on `identity_private.security_log`, but no SELECT on `expires_at`; existing `DELETE ... WHERE expires_at<=statement_timestamp()` requires column SELECT. Installation succeeds because this PL/pgSQL query's privileges are checked on execution.

The expanded review covered all 73 declarations/65 final definitions and their qualified-reference inventory, 51 auth_api functions (37 exposed service planning probes, 14 deliberately private/retired APIs), native dynamic installers and positive flows above. Private helpers are reached through brokers/triggers, never granted to services for testing. Planning probes do not prove every branch, and business-rejection probes do not replace positive-flow tests. No further demonstrated SQL failure appeared in this run; this is not a claim that all future operational branches are accepted.

## Single consolidated resolution — not installed

Revision 04 regenerates from the unchanged originals and adds exactly:

```sql
GRANT SELECT(expires_at) ON identity_private.security_log TO cleanops_auth_broker;
```

No function body/signature, role membership, table access for service roles, RLS, search_path or other ACL changes. Broker remains NOLOGIN/NOBYPASSRLS. Residual privilege is reading expiry timestamps through a compromised broker-owned function; no log payload/principal/network/device fields are granted. This is an explicit **security ACL change requiring owner approval**.

Candidate blob `f2c3c7c1f0859b9a6e0e2ed2c701f3c5d060774c`; SHA-256 `81538c713e7e031a5acdc0b374f36a55e34ded733d9d08c99bc363c606d61083`. Exact diff, inventory and request: `docs/proposals/b1-consolidated-sql/revisions/04/`. It has not been installed. Existing `gc_ephemeral` probe remains a hard failure until the authorized candidate passes real execution; it is not disabled/marked expected or skipped to obtain PASS.

B1 accepted end-to-end rows **0/44**. B1, PG-TEST-01 and AUTH-GATE-05 OPEN, closedBackend unchanged. Next executable installation requires exact revision-04 approval; subsequent E1/E3–E9 obligations remain in the closure matrix and are not moved to another module.
