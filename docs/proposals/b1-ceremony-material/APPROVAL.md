# Targeted technical review and approval matrix

Base reviewed: 5ce6575d1e91be72f9d27b221b346b02efd10ef8, PR #7.
Disposition: READY FOR OWNER CONTRACT REVIEW, NOT APPROVED FOR EXECUTION OR ACTIVATION.
Revisions are statically consistent with the dependencies listed below; PostgreSQL
compilation, ACL enforcement, RLS and lock behavior remain unverified.
AUTH-GATE-05 OPEN. closedBackend unchanged. Canonical V4/B1-X sources are unchanged.

## Findings and corrections

| ID | Evidence at reviewed base | Correction | Remaining evidence |
|---|---|---|---|
| F1 | Reader checked expiry before method lock wait | Repeat clock_timestamp check after method locks | Two-connection expiry test |
| F2 | Challenge had no method generation; EMAIL consumer checked digest, not current method state/version | Nullable challenge method_version snapshot; both consumers reject stale/NULL generations under lock | Revoke/rekey race tests |
| F3 | B1-X locks use SELECT-only principals/organizations/users/policy_versions | Four broker column UPDATE grants proposed for locking SELECT; remove redundant user lock upgrade | SET ROLE and column ACL checks |
| F4 | AAD omitted algorithm | Envelope revision 2 authenticates algorithm; reject uninstalled revision 1 | Unit tamper tests |
| F5 | Changing the key label invalidates AAD | Isolated decrypt/reseal with fresh nonce and transient plaintext wipe; retain old read keys | Unit old/new key tests; future persistence CAS |
| F6 | Prepared URI/code were enumerable in JSON/inspect | Non-enumerable secret fields and redacted serialization/inspection | Sink tests needed when wiring |
| F7 | Reader exposed private recipient for unused enrollment/session cases | Recipient returned only for LOGIN/STEP_UP preparation | Future HTTP projection tests |

The challenge column and lock privileges supersede the earlier "no schema/privilege changes"
claim. Nothing is executed. Column UPDATE is not a "locks only" permission: broker-owned code
could also update that column. This residual authority needs explicit D1 approval; it does
not grant callers table access or broker role membership.

## SQL signatures and permission matrix — D1-CONTRACT-ACL

| Exact signature | Result | Change | Caller |
|---|---|---|---|
| auth_api.trusted_mfa_material(text,text,text,uuid) | jsonb | new | cleanops_identity_service EXECUTE |
| auth_api.issue_bound_challenge(text,text,uuid,bigint,bytea,bytea,text,text,uuid,uuid) | uuid | new | cleanops_identity_service EXECUTE |
| auth_api.begin_totp_enrollment_assigned(text,uuid,uuid,uuid,bigint,bytea,text,text,uuid) | jsonb | new | cleanops_identity_service EXECUTE |
| auth_api.totp_material_locked(text,uuid,text) | jsonb | replace body | existing private EXECUTE |
| auth_api.consume_email_otp(text,uuid,bytea,uuid) | boolean | replace body | existing private EXECUTE |

Owner: cleanops_auth_broker, NOLOGIN/NOBYPASSRLS. Every function fixes search_path to
pg_catalog and schema-qualifies non-catalog relations/functions. No dynamic SQL,
caller-controlled identifiers, SET ROLE or exception text containing supplied material.
PUBLIC EXECUTE is explicitly revoked, including replacements.
V4 schema CREATE revocations, FORCE RLS and broker policies are prerequisites to verify,
not evidence of deployed security. Future installation must set owner/ACL atomically.

Only schema change: app.mfa_challenges.method_version bigint NULL CHECK(method_version>0).
No backfill/default/new table/state/session issuer. The wrapper fills the snapshot in the
same transaction; legacy NULL challenges fail closed in both allowed consumers.

Minimum extra privileges derived from PostgreSQL locking SELECT requirements:
- UPDATE(id) ON identity_private.principals TO cleanops_auth_broker
- UPDATE(id) ON app.organizations TO cleanops_auth_broker
- UPDATE(id) ON app.users TO cleanops_auth_broker
- UPDATE(tenant_id) ON app.policy_versions TO cleanops_auth_broker

PostgreSQL row-locking SELECT needs UPDATE privilege on at least one column, including
FOR SHARE. Existing credentials/methods/sessions/PREAUTH rights are reused.
No new table privilege for identity_service/runtime/mail_worker; no CREATE/BYPASSRLS grant.
Revoke identity_service direct EXECUTE on:
auth_api.issue_challenge(text,text,uuid,bytea,bytea,text,text,uuid) and
auth_api.begin_totp_enrollment_explicit(text,bytea,text,text,uuid).
B1-X revocations of generic verify_challenge and legacy APIs remain prerequisites:
a direct caller-accessible bypass would invalidate this review.

## State, authority and effects

| Entry | Trusted state | Authority | Effects |
|---|---|---|---|
| reader LOGIN | checked PREAUTH PENDING_MFA | current principal/credential/member/org | None |
| reader STEP_UP | ACTIVE session | guard/current binding_authorization grant 04/05/06/08; resource iff 08; target membership for 08 | None |
| reader ENROLLMENT ACTIVE | ACTIVE plus step-up 05 | guard 05(true), current policy generation | None |
| reader ENROLLMENT PREAUTH | PENDING_MFA or ENROLLMENT_REQUIRED | rule 05, zero ACTIVE methods | None |
| reader ISSUE_SESSION | VERIFIED plus factor_verified_at | locked membership/risk, existing issuer independently revalidates | None |
| challenge | reader LOGIN/STEP_UP | exact ACTIVE method UUID/kind/version locked | Existing cooldown/revoke/insert/outbox plus version snapshot/audit |
| assigned enrollment | reader ENROLLMENT | rederived tenant/user equals supplied AAD assertions; UUID and initial generation 1 | Revoke prior PENDING, insert PENDING TOTP, bind ceremony/audit |
| EMAIL consume | pending LOGIN or ACTIVE STEP_UP | locked challenge/context and current ACTIVE method/version | Existing attempts/single consume/evidence/audit |
| TOTP material | existing LOGIN/STEP_UP/ENROLLMENT | added issued generation equality; enrollment lifecycle CAS remains | Read only; consume_totp_cas owns counter CAS |

SELECTION/CONSUMED/REVOKED cannot become successful ceremonies. Pending enrollment is
not session issuance. Address existence never enables EMAIL_OTP. Missing risk/method
never defaults. Ambiguous methods require explicit eligible selection, not factor preference.
Expected tenant/user are equality assertions, not selectors. Every lookup uses derived
tenant+user and composite FKs. PRIVATE recipient JSON is never an HTTP AuthResult.

The private identity service remains trusted: SQL cannot attest caller CSPRNG, Argon2/TOTP
crypto, actual encrypted mail recipient, or AEAD key possession. SECURITY DEFINER narrows
operations for callers; it cannot defend against compromise of that trusted verifier.

## Transactions, locks, idempotency and errors

Integration protocol: resolve Binding/CSRF -> authorize/rate -> reserve_owned with exact
operation/key/request hash -> locked material -> local crypto -> effects -> complete_owned ->
COMMIT -> explicit safe HTTP projection. No network delivery inside the transaction.
Reservation locks precede factor/method locks, not effects. Context resolution may already
hold principal/credential/member locks before reservation.

Concrete inherited sequence: principal -> credential -> origin session -> PREAUTH if any ->
organization/user SHARE (sorted helper order) -> policy SHARE -> methods UUID order ->
challenge -> effects/audit. Reader avoids user lock upgrade after policy lock.
Reentrant calls keep existing locks. Principal serializes its ceremonies, not administrator/
maintenance work; test target-tenant B1-X authorization order and deadlocks independently.
Expiry is rechecked after lock waits. Invalid material throws generic AUTH_INVALID/42501;
constraint/dependency/audit errors abort the transaction and must map to generic errors.
Do not print SQL parameters or exception detail/hints/row dumps to application logs/clients.

These signatures do not include idempotency keys or enforce owned reservation in SQL.
As with B1-X, the trusted backend must require its owned reservation before effects and
reject abandoned PENDING reservations before COMMIT. This is an explicit integration
obligation, not an independently idempotent public API. Duplicate assigned UUID aborts;
no upsert overwrites a secret. Pending revocations, challenge snapshot, outbox, audit and
reservation completion roll back together on failure. Failed proof attempts commit only via
the existing typed denial path. No URI/cookie/OTP may escape before COMMIT succeeds.

Enrollment URI needs one_time reservation semantics: store safe completion metadata only.
On lost response, start a fresh enrollment/key; do not cache/replay the URI. Challenge
responses omit OTP/digest/recipient. No automatic lock retry policy is invented: absent an
approved bounded whole-transaction retry policy, fail generically and discard old material.

## Envelope, lifecycle and key rotation — D2-ENVELOPE-KEYS

Format: byte 2 || random 12-byte nonce || 16-byte tag || ciphertext.
AES-256-GCM key is 32 bytes, tag length explicit. Canonical AAD:
[cleanops-totp-envelope-2, keyVersion, tenantId, userId, methodId, "1", algorithm].
Method UUID and initial generation precede encryption; "1" is immutable envelope generation,
not mutable method_version. Confirmation/revocation/rewrap bump lifecycle version; counter
consumption preserves it and advances the global monotonic counter. No algorithm guessing.
Changing period/digits is outside this versioned V4 profile and requires separate review.

Rewrap decrypts with exact old key/version, reseals with fresh nonce/new key-version AAD,
then wipes transient plaintext. Future writer MUST CAS old lifecycle version+ciphertext+
key_version, preserve UUID/algorithm/counter/created_at, and let the existing trigger bump
method_version. Concurrent proofs/challenges become stale. Failed CAS discards candidate;
old ciphertext remains. No database rewrap writer is proposed/installed here.
Secret replacement requires a fresh UUID/enrollment, not rewrap of different secret bytes.

Retain old read keys until live ciphertext AND retained backups have a tested recovery path.
Never change bytes behind an existing immutable key ID, relabel ciphertext, try arbitrary
fallback keys, or delete old keys merely because new writes changed key. Missing key fails
closed. Key catalog, custody, nonce/usage budget and retention are owner decisions.
Revision 1 was uninstalled: reject it, do not silently migrate/reinterpret old ciphertext.

## Explicit owner decisions (no production defaults)

| ID | Required decision | Not selected |
|---|---|---|
| D1-CONTRACT-ACL | Exact matrix, challenge column, four lock grants, two removed EXECUTEs, challenge audit action and explicit eligible selection | No caller table privileges |
| D2-ENVELOPE-KEYS | Revision 2/AAD lifecycle; custodian/provider, Switzerland residency, access roles, immutable IDs, rotation/nonce budget, old-key/backup retention/recovery; separate OTP HMAC/mail AEAD custody | No provider, aliases, key bytes, rotation interval, per-key volume |
| D3-TOTP-POLICY | Algorithm from SHA1/SHA256/SHA512, entropy in bytes, server issuer and non-sensitive label | No preferred algorithm/production entropy/brand; helper 16..128-byte bounds are resource bounds; SHA256/20-byte tests synthetic |
| D4-EMAIL-DELIVERY | EMAIL enable/provision/recipient-verification lifecycle; encrypted payload schema/AAD; provider/residency, worker key access, dedup/cancel/expiry/retry/failure UX | No provider/destination override/plaintext queue/resend bypass |

Existing V4 period/digits/window, OTP TTL/cooldown/rate and session durations are unchanged.
Default JSON/inspect/spread redaction is defense in depth, not full sink certification.
Explicit property access, loggers exposing non-enumerable fields, SQL bind/error logs,
tracing and mail providers need explicit redaction/tests on integration. JS cannot promise
erasure of URI strings or every library copy; keep private data short-lived and uncached.

## Future PostgreSQL plan — separate execution authorization required

1. Compile canonical V4 -> approved B1-X -> reviewed overlay in disposable fixture-only
   database; test installation rollback. No deployment/runtime activation.
2. SET ROLE broker/identity/runtime/worker; inspect exact ACLs, column lock grants,
   forbidden legacy EXECUTE, no caller table/sequence/schema CREATE or inherited broker
   membership, NOLOGIN/NOBYPASSRLS and FORCE RLS/policies. Exercise actual locking SELECT.
3. Exercise all state rows, NULL/malformed/foreign tenant/user/method, disabled principal/
   org/member, stale credential/policy/session, wrong step-up grant/target and expiry.
   Capture synthetic secret canaries in application/SQL logs and HTTP projection tests.
4. Two connections: hold method lock and revoke/rekey concurrently; issuer serializes.
   Revoke/rewrap between issue/consume: EMAIL/TOTP reject old generation and legacy NULL.
   Two correct consumes yield one proof/counter advance/session/evidence.
5. Hold locks past expiry; test sorted target memberships, two tenants/one principal,
   administrator/maintenance lock inversions, deadlock and lock-timeout rollback.
6. Inject failures after pending revocation, snapshot, outbox/audit insert, reservation
   completion and COMMIT; assert no partial rows/precommit secrets. Concurrent identical
   keys, mismatches/discard and lost one-time enrollment response must not replay secrets.
7. Race future rewrap CAS against counter/confirmation/revocation; preserve counter,
   identity and old recovery path. Missing old key/crash before CAS leaves old ciphertext.
8. Fake EMAIL worker (no external mail): trusted recipient/context, cancel/expiry/cooldown,
   dedup and encrypted payload; then separately authorized database/no-database suites.

Contract approval alone authorizes none of those database steps. The next executable
code-only action after approval is typed broker/backend integration with simulated
transaction failures, preserving closedBackend until separate gates are satisfied.
