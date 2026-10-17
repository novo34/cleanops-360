# CONSOLIDATED-04 — BLOCKED before installation by owner condition 3

Reference HEAD `49c3b0ff90fd47b4d141ed1b9db75506d889ac7e` verified through GitHub. Exact authorized blob `f2c3c7c1f0859b9a6e0e2ed2c701f3c5d060774c`, SHA-256 `81538c713e7e031a5acdc0b374f36a55e34ded733d9d08c99bc363c606d61083`. Reproducible generator and full parent-delta review pass. The sole delta from 03 is broker SELECT(expires_at) on identity_private.security_log.

## Conditional authorization does not permit this installation

Owner condition 3 requires that the new privilege not allow the broker to read other subjects' records, and explicitly requires stopping if the exposure is broader. V4's `$private_policies$` loop includes security_log and creates `broker_private ... TO cleanops_auth_broker USING (true) WITH CHECK (true)`. The table has principal/network/device digests and no tenant discriminator. Thus column SELECT(expires_at) authorizes reading that column across **all rows**, not only rows being deleted or already expired. It also enables aggregate counts over visible rows. The broker does not need or receive BYPASSRLS: the existing permissive policy itself authorizes those rows.

Witness query, **not executed**: `SET ROLE cleanops_auth_broker; SELECT expires_at FROM identity_private.security_log;`. The catalog/source semantics imply unrestricted row visibility for that column. Other columns and direct service accounts remain protected, but this does not satisfy the owner's narrower broker condition. The previous proposal documented global timestamp visibility as residual risk; the current conditional authorization does not accept that risk.

No Docker resources were created, no SQL/ACL installed and no tests were passed by temporarily granting privileges or changing RLS. No new resources require cleanup; no preexisting Docker/network/volume resources were touched. This is an artifact/contract precondition failure, not a PostgreSQL compilation failure. Prior 03 results remain historical (253 PASS/1 FAIL), not rerun or credited to 04.

- Installation: BLOCKED, not executed.
- PostgreSQL 254 checks and new negative tests: BLOCKED, not executed.
- Real UI/API/PostgreSQL E2E: BLOCKED, not executed. `lib/b1/runtime.ts` still calls `createAuthHandler(closedBackend, origin)`; no private driver is wired into the HTTP runtime. Simulated Chromium tests cannot establish real authentication acceptance. Keeping that binding is an explicit restriction. A separate isolated test-only app composition would need to be implemented and all required dependencies supplied; no production/runtime activation is inferred from the E2E request.
- B1 accepted complete end-to-end requirements: 0/44. B1 and AUTH-GATE-05 OPEN.

## More restrictive proposed boundary — REVIEW ONLY, no SQL installed

Remove the proposed broker SELECT(expires_at). Also retire broker DELETE on security_log, because leaving it permits deletion without an expiration filter through a compromised broker-owned function. Replace only the existing security_log DELETE statement in gc_ephemeral with a fixed no-result purge helper:

`identity_private.purge_expired_security_log() RETURNS void`, SECURITY DEFINER, search_path=pg_catalog, qualified static DELETE with `expires_at <= statement_timestamp()`, no arguments, dynamic SQL, RETURNING or row count. The rest of gc_ephemeral remains unchanged.

Own the helper with a distinct proposed NOLOGIN/NOSUPERUSER/NOBYPASSRLS role, `cleanops_security_log_purger`, with no role memberships and no CREATE rights. Minimum privileges: schema USAGE, DELETE on security_log and SELECT(expires_at) only. A dedicated RLS policy for this role permits only expired rows, with no INSERT/UPDATE policy. It does not inherit the broker's all-rows policy. Grant helper EXECUTE only to the broker; revoke PUBLIC and all service direct execution. No caller-provided subject, tenant, time or predicate may broaden the fixed deletion.

The broker and technical callers cannot query any log column or assume the purger role. The helper still performs global expiry cleanup, as the existing maintenance contract intends, without returning cross-subject data. The dedicated role necessarily has metadata access to expired rows for its purge purpose; this capability and new definer boundary require explicit approval. SQL errors/diagnostics must not return log contents. Potential timing side channels are not claimed eliminated.

This is an alternative contract design, **not an approved replacement artifact or a new executable consolidated candidate**. It needs a new exact full-file diff and ACL review before installation authorization. Do not install 04 while building that alternative.

Required negative/positive tests for the replacement: distinct synthetic principal digests and past/future expirations; broker/each service denied all column reads and role assumption; purger cannot read unexpired rows or other columns and cannot INSERT/UPDATE; PUBLIC/direct service helper EXECUTE denied; helper deletes expired rows only, returns no data; gc_ephemeral succeeds; rollback restores deleted fixtures; full 254-case baseline repeats on the exact approved consolidation. Native RLS/ACL tests must establish these claims before acceptance.
