# PG-TEST-01 — execution authorization and harness

Owner explicitly authorizes the exact PG-TEST-01 in closure/PLAN.md in this work session.
B1 OPEN; AUTH-GATE-05 OPEN; runtime closedBackend. This is not D4/staging/production,
SMTP, real key, migration-of-existing-data, merge or backend activation authorization.

The runner verifies all four Git blob hashes before Docker/SQL. It pulls the official
PostgreSQL16 image, resolves its immutable RepoDigest, then runs only that digest.
A UUID-labelled new container uses network=none, no published ports, tmpfs PGDATA/tmp,
no bind/named/anonymous volume. Cleanup checks its exact ownership label before removal.
Preexisting container/network/volume sets must remain unchanged. No daemon restart/prune.

SQL is submitted byte-for-byte in order V4 -> B1-X -> D1. No review guard is stripped.
A rejected package blocks dependent installation and CAS tests, but independent V4
ACL/RLS/binding/tenant/lock/transaction/restore tests continue when V4 exists.
Fixtures use only synthetic A/B data and separated LOGIN mappings to the authorized
technical roles, never broker/DDL membership. No secrets/raw SQL input are printed.
The report contains PASS/FAIL/BLOCKED, SQLSTATE, installation diagnostics and image digest.

COMMIT failure test attempts COMMIT after server termination of its own transaction;
state is then checked on a separate connection. This is a real transport failure with
rollback, not a claim to reproduce committed-but-response-lost or durable-storage faults.
RLS catalog checks cover all21 tables; service accounts have zero table privileges.
Positive tenant filtering is tested through granted broker functions, not by granting
runtime extra DML to force a row-filter demonstration.

Local Docker socket access is denied by the execution sandbox (operation not permitted).
The authorized run therefore uses a new GitHub Actions runner, not a modified local daemon.
Install errors require a REVIEW ONLY correction and new owner authorization before any
changed SQL is installed. Artifact failures cannot be solved by deleting guards, adding
unapproved privileges, or replacing functions in this harness.
