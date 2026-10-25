# B2 Manage Access — exact SQL execution request

Prepared, not executed. The current directory package remains authorized separately and byte-identical.

| Artifact | SHA-256 |
|---|---|
| `002-effective-access.review.sql` | `d11842d50959ea6e2e90afe8d90d7c327bcbc8ca45685e893c436baae3549efe` |
| `access-tests.review.py` | `a5fe0da1cc46276992c3e9d53671cd2597ff349dfa776b6c4f06b393171c5a42` |

## Necessary compatibility with B1

B1's `effective_access` evaluates only the authenticated caller. The required User Detail must show the selected user's effective permissions. Duplicating that evaluator or replacing the trusted session context would violate the B2 authorization constraints.

This candidate mechanically extracts the existing SQL14 evaluator body into broker-private `identity_private.evaluate_user_access`. Existing `auth_api.effective_access` delegates to that same body with the authenticated actor; new `auth_api.user_effective_access` delegates with a same-tenant target only after authorizing the caller's `view/access` scope. Tenant still comes exclusively from B1 context. The only added evaluator condition denies inactive/nonmember subjects; the existing caller already passes that check through B1 context. The helper has no EXECUTE privilege for the identity service, runtime, mail worker or PUBLIC.

One additional read, `assignable_role_catalogue`, returns up to 20 current-tenant role names and uses the exact existing membership no-overdelegation test. Its caller needs view/access and manage_permissions/access for the target. The existing audited changeAccess writer revalidates assignment authority, step-up, scope and policy CAS; this read grants no permissions.

No new tables, roles, RLS policies, default business grants, alternative auth context, mutation functions or changes to existing write policies. Two new public EXECUTE grants go only to the existing identity-service role. The existing evaluator signature and its ACL are preserved.

## Exact proposed validation

Use only a new owned, networkless PostgreSQL16 container with tmpfs, no host ports/bind mounts/volumes, on GitHub-hosted CI. Verify both hashes, prior exact SQL14 authorization, the prior directory package hashes/authorization, no external/persistent DB bindings, and the unchanged B1 matrix Git blob `45c144c9640388b22cf9a62dab96f30bd329fd86` before installation.

The fixture contains all new synthetic grants and writes: distinct actor/target, role scope, denied overdelegation, successful audited assignment, fresh B1 step-up evidence for the synthetic UI scenario, an audited explicit DENY from Chromium, expiry/revocation, inactive target, cross-tenant invisibility, private-helper ACL and the unchanged canonical B1 role/resource/action matrix. Browser evidence explicitly starts with a synthetic authenticated session and fresh server-side step-up fixture; it does not claim to retest factor enrollment/login itself. No fixture runs at import time.

Current preparation tests: 50 focused Node tests and 14 exact-review guard tests PASS. These are not PostgreSQL acceptance for this new package. Functional UI/backend consumers and a real Chromium scenario are prepared. Only this exact new package requires authorization; production B1, persistent SQL, Hostinger, Swiss infrastructure, staging/main changes and merges remain excluded. No B2 readiness or acceptance is declared.
