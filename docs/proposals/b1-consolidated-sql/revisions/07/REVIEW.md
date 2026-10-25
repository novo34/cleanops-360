# Consolidated07 — complete fresh-install candidate, REVIEW ONLY

No07 SQL/ACL installed or authorized. Exact approved06 remains unchanged. Generator
assembles a complete snapshot from pinned05 plus full E1 source with lifecycle fixes;
it does not send repair statements to a database. Full diff from05 and exact delta
from approved06,30new-function inventory/ACL, Git blob and SHA256 are published.

## Five root causes from actual06 tests

Native run39101669219, source496ad213fbc72173edc076ca2dbdcd74355fda09:
210PASS/19FAIL, cleanup PASS. These are NOT19independent product bugs:

1. GC overwrites an uncertain expired outbox's QUARANTINED state with CANCELLED.
   Observed CANCELLED in real test.07 preserves Q and its encrypted payload; expired
   CLAIMED/DISPATCHING transitions to Q. Retention/disposal requires operational policy.
2. GC sets ciphertext/key on PENDING EMAIL, violating mfa_methods_check (23514).
  07 preserves NULL/NULL for EMAIL; only TOTP uses empty cipher/PURGED marker.
3. Broker lacks UPDATE(version) on app.policy_versions; role/override mutations42501.
  07 proposes precisely that column privilege, no caller/table grants.
4. Broker lacks UPDATE(credential_version) on identity_private.credentials; password
   reset42501.07 proposes precisely that column privilege. Subsequent expected-version2
   recovery tests were blocked by the failed reset; raw failures preserved, not accepted.
5. Concurrent ACTIVE operations produce40P01. tx_context's FK takes KEY SHARE on
   the session before context() acquires principal and then FOR UPDATE on session.
   One request can hold principal while waiting for another's FK; the other waits
   for principal.07 changes all FIVE explicit session row locks to FOR NO KEY UPDATE.
   This STILL excludes competing writes/deletes/key changes, but permits FK references.
   No session PK is mutated by these brokers. Principal/credential serialization and
   post-lock validity checks stay intact. Exact affected functions: issue_active_session,
   revoke_own_session,revoke_other_own_sessions,context,checked_preauth.

Reciprocal administrative calls may already own an actor principal from middleware;
sorting later is insufficient. New PRIVATE lock_pair_nowait(uuid,uuid) takes both
principal/credential locks in UUID order with NOWAIT. Contention55P03 rolls back the
whole transaction; no continuation with partial locks/effects. Used by admin reset,
admin password authorization and approved-admin password-reset consumption. No public
or service EXECUTE; broker-owned with pg_catalog path. This additional defensive lock
change requires approval and native reciprocal-concurrency tests too.

## Scope of new authorization needed

- The two exact broker COLUMN UPDATE grants above.
- GC lifecycle behavior, five session lock-mode replacements and private pair helper.
- No new PUBLIC/service execution privileges, memberships, BYPASSRLS, table owner,
  direct service table grants or public function signatures beyond approved06.
- No runtime/SMTP/provider/key activation, deployments or merges.

## Already proven on06, not re-credited to07

Actual non-superuser calls pass verified EMAIL enrollment/first-code/replay denial,
AEAD worker delivery and quarantine, credential CAS, owned identities, trusted-device
registration/expiry/admin revocation, privileged MFA reset with independent proof,
PREAUTH tenant rotation preserving password proof, real worker claim-COMMIT failure,
concurrent one-send, finish-COMMIT loss/no-redelivery and EMAIL step-up. Backup/restore
all30tables and cleanup pass. No new UI/API routes were implemented by those private
SQL tests; those B1 obligations remain open.

##07 validation status

12static regressions and PostgreSQL16 offline grammar are required in CI. Native
compilation/plans/ACL/RLS/CAS/concurrency/COMMIT/restore NOT executed for07. Existing
06installation PASS does not certify07. Native harness must prove these fixes and
run every dependent failed/blocked scenario after exact approval. Every mandatory
new UI/API/PG flow and external app/custody acceptance remains within B1, no deferrals.
B1/AUTH-GATE-05 OPEN, closedBackend. Source history and both06attempts preserved.
