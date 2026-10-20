# B2 directory — execution pending authorization

Candidate: `001-directory.review.sql`, based on exact B1 SQL14. This file has not been executed and is outside the trusted migration allowlist. No workflow installs it.

Adds only two SECURITY DEFINER functions owned by the existing NOLOGIN/NOBYPASSRLS broker, executable by the existing identity-service role. No new tables, roles, RLS policies, seed permissions, global grants, or changes to existing functions.

- `administration_users(text,text,uuid,integer)` searches display names literally, filters ACTIVE/DISABLED, and paginates by UUID with a maximum of 50. Both collection eligibility and every returned user use B1 `effective_access`; scoped DENY filters tenant-wide ALLOW. The tenant comes from B1's locked session context.
- `administration_user(uuid)` returns the existing user profile and current organization only. Absent, forbidden, and foreign records return the same 404. Principal IDs, credentials, recipients, and session material are never selected.

Specific authorization is needed before installing this candidate, including in ephemeral PostgreSQL 16 CI. Proposed execution: GitHub-hosted isolated job, no persistent database URLs or Hostinger connections, synthetic users and resources only, teardown after the run. Validate no-grant denial, resource grants, explicit DENY, foreign tenant, revoked session, temporary grant expiry, pagination, and literal search. Synthetic fixture SQL/ACL must be prepared and included in the authorization scope before execution.

Current status: backend/contract preparation only; UI, PostgreSQL integration and browser acceptance pending. B2 is not TECH-READY, STAGING-READY, or ACCEPTED. B1 runtime remains closed.
