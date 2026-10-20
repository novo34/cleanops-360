# PG-TEST-01 execution result — FAIL

Execution head d4f02d453aa1bdc72950faab03b49f9b28f2c4f4.
GitHub Actions run https://github.com/novo34/cleanops-360/actions/runs/38957446332
Job 117163764450; evidence in execution-report.json, extracted from actual job logs.

Executed on a NEW Ubuntu runner using official PostgreSQL16 image pinned at runtime:
postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea.
Only a new labelled container, network=none, zero published ports, tmpfs PGDATA/tmp and
no shared/bind/named/anonymous volumes. No existing resources altered; cleanup PASS.
No deployment of application or operational backend, SMTP, real keys or merge.

Results: 6 checks PASS, 1 FAIL, 12 BLOCKED; cleanup additionally PASS.
PASS: all4 authorized Git blobs, container isolation, PostgreSQL16 readiness,
failed-install schema rollback, failed-install role rollback, preexisting resource sets.
FAIL: V4 exact-source compilation SQLSTATE42601 in issue_active_session CASE comparisons.
V4 transaction rolled back: zero app/auth_api/identity_private/crypto schemas and zero
cleanops_* roles remained. No synthetic business fixtures were installed after that failure.

BLOCKED / NOT EXECUTED, not passed:
B1-X and D1 installation; service ACL/SECURITY DEFINER and21-table RLS tests; multi-tenant
binding; row locks/concurrency; credential/TOTP CAS; owned reservation effects; deliberate
COMMIT failure; B1 dataset backup/restore. No substitute table/function/privilege was
installed to produce green tests. No claim of live auth validation or full harness coverage.

Original SQL artifacts unchanged. A targeted source correction and the explicit B1-X/D1
review guards' execution copies are prepared at docs/proposals/pg-test-01-fix/, REVIEW ONLY,
with exact candidate hashes. They have NOT been installed or PostgreSQL-validated.
No SQL defect is declared corrected in a running database. Further semantic/ACL defects
may be found once compilation succeeds; current results cannot exclude them.

Next: E2 remains FAIL/BLOCKED. Request only PG-TEST-01-PATCH-01 for the exact proposed
derived artifacts within the existing ephemeral-only boundary, then resume ALL remaining
PG-TEST-01 obligations. B1 and AUTH-GATE-05 OPEN, runtime still closedBackend.
