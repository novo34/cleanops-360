# B2 profile and membership-state changes — exact execution request

Prepared, not executed. Independent approval is required for this new SQL/ACL and
synthetic fixture package. The previously authorized directory files are unchanged.

| Artifact | SHA-256 |
|---|---|
| `003-user-changes.review.sql` | `961837f5f50ef3a5484927776c3343e8491018c9cc93b985e2dddb8aacbf49dc` |
| `user-change-tests.review.py` | `dcf477a07b324b7ea2aa5d68cf4356a195116a4322e1bd0b088fb5da1fcc234c` |

## Concrete scope

Extend the existing tenant membership in `app.users` with one monotonic
`profile_version` column and its trigger/private hash helper. The existing profile
read gains an opaque concurrency version and a server-evaluated edit capability.
One new owned mutation handles display-name edits and ACTIVE/DISABLED membership
state, using existing view/edit authorization, B1 step-up, principal and membership
locks, owned idempotency journal, and audit tables. No new users, roles, tenant
context, permission evaluator, session issuer or password flow is introduced.

Disabling a membership revokes its existing sessions, device trust, pending
challenges and selected preauthentication in that tenant. The shared principal,
credentials and other tenant memberships stay intact. Reenabling does not restore
old sessions. A collision rolls back the complete unit; stale versions return a
safe conflict. Sensitive denials have redacted audit metadata; successful changes
have trusted actor, reason, before/after values and versions.

The new function receives EXECUTE only for the existing identity service; the
existing broker gets column-limited UPDATE(display_name,state). Private helpers
have no application-role EXECUTE. No direct identity-service table UPDATE is added.

## Proposed isolated validation

Only PostgreSQL16 in a new owned GitHub-hosted, networkless, tmpfs container, with
no host ports, persistent mounts, external bindings or database credentials. Before
installation verify these exact hashes and the existing SQL14 plus directory
authorizations/hashes. This package depends on SQL14 and directory package1;
package2 is unnecessary for its validation and is not implicitly authorized.

The immutable synthetic fixture includes ordinary identity-role writes, missing
permission/MFA/ownership denials, tenant isolation, stale versions, rollback,
two real concurrent connections, lifecycle revocation, other-tenant continuity,
monotonic versions across a state cycle, self-disable completion and one-time
journals with no stored response. A prepared real Chromium scenario edits a name,
disables and reenables the membership, then checks persisted state, revoked old
sessions and the other tenant. The fixture verifies its three durable UI audits.
Browser tests use synthetic authenticated sessions and explicitly seeded fresh
step-up evidence; they do not claim to exercise factor login itself.

Static grammar parsing and application unit tests do not execute this SQL or its
fixtures and are not PostgreSQL acceptance. No execution runner for this package
is enabled before approval. Persistent migrations, Hostinger, Swiss infrastructure,
B1 activation, staging/main updates and merges remain excluded. User invitation
and first-password behavior await the canonical approved onboarding procedure.
