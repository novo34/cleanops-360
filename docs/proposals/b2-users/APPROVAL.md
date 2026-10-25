# B2 directory — execution pending authorization

Candidate: `001-directory.review.sql`, based on exact B1 SQL14. This file has not been executed and is outside the trusted migration allowlist. No workflow installs it.

Adds only two SECURITY DEFINER functions owned by the existing NOLOGIN/NOBYPASSRLS broker, executable by the existing identity-service role. No new tables, roles, RLS policies, seed permissions, global grants, or changes to existing functions.

- `administration_users(text,text,uuid,integer)` searches display names literally, filters ACTIVE/DISABLED, and paginates by UUID with a maximum of 50. Both collection eligibility and every returned user use B1 `effective_access`; scoped DENY filters tenant-wide ALLOW. The tenant comes from B1's locked session context.
- `administration_user(uuid)` returns the existing user profile and current organization only. Absent, forbidden, and foreign records return the same 404. Principal IDs, credentials, recipients, and session material are never selected.

Specific authorization is needed before installing this candidate, including in ephemeral PostgreSQL 16 CI. Proposed execution: GitHub-hosted isolated job, no persistent database URLs or Hostinger connections, synthetic users and resources only, teardown after the run. Validate no-grant denial, resource grants, explicit DENY, foreign tenant, revoked session, temporary grant expiry, pagination, and literal search. Synthetic fixture SQL/ACL must be prepared and included in the authorization scope before execution.

Exact execution bundle (not executed):

- `001-directory.review.sql`: SHA-256 `8a380379b392536bb986136c997833c57ca4e482de3c418b389b898245e8e31f`.
- `directory-tests.review.py`: SHA-256 `b5d669aad3c61935b89d90fad8ad845cd1fc048125d866d37563ac40123a78fe`. Contains the complete new B2 synthetic grants, fixture updates and assertions, using existing B1 users and service roles. No entry point, connection or import-time execution.

Requested authorization covers only installing these two functions/EXECUTE grants and running these exact synthetic fixtures/assertions in B1's verified isolated PostgreSQL 16 harness, against the already authorized exact SQL14 base. It does not authorize persistent SQL, Hostinger infrastructure changes, runtime activation, productive grants, staging/main merges, or other B2 SQL. The harness must verify an owned ephemeral container, isolation and cleanup before execution.

Current status: UI directory/profile connected to shared HTTP routes and existing B1 Manage Access; PostgreSQL integration and functional browser acceptance pending. At `2f09f7`, B2 no-db Actions 39505249886 passes lint, typecheck, 243 B1 tests, four B2 Node tests, 13 Vitest tests, build, dependency audit, B2 Semgrep, inherited exact-reviewed shared-boundary Semgrep, and Gitleaks. Three database-dependent Vitest tests SKIP because database URLs are empty. Quality remains FAIL on 17 inherited raw Semgrep findings; no security rule is relaxed. The new closed-boundary/dashboard Chromium suite is prepared, not yet run. B2 is not TECH-READY, STAGING-READY, or ACCEPTED. B1 runtime remains closed.
