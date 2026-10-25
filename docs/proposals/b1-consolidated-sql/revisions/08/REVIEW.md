# SQL08 — recovery-binding root correction and password-reset material

REVIEW ONLY, NOT INSTALLED. Replaces the earlier reader-only08 proposal, which was never authorized or installed. All V4/B1-X/D1/SQL07 originals are intact. SQL07 remains the only SQL executed by these tests.

## Demonstrated blockers

1. Real Chromium/API/PG16 run39109078160, source a52c367898eb67fefd51553cd8149a8c3f2c404f, reproduced an authentication race: after recovery-code consumption revokes old MFA, a second clean browser using only the password receives ENROLLMENT_REQUIRED, creates its own TOTP and obtains ACTIVE. Redacted phases: UNBOUND_ENROLLMENT_OFFERED, UNBOUND_CONFIRM_200, UNBOUND_ACTIVE_1. Positive recovery flows passing individually do not make this safe. Mandatory negative remains FAIL; B1/AUTH-GATE05 stay OPEN and runtime closedBackend.
2. Existing reset_password_cas needs ticket-bound tenant/user/current credential generation for scoped recovery HMAC/CAS, but the identity adapter has no approved context reader. Client authority fields, guessed generation1, direct tables or an invented encrypted-ticket protocol are not substitutes.

## One clean fresh-install candidate, exact bounded changes

The generator starts from exact approved07 and changes only five final function bodies in place, adds one private state table/policy and one private reader. It does not accumulate executable patches or redefine unrelated functions. Complete diff and hashes are in APPROVED_07_TO_08.diff / manifest.json / EXECUTION_REQUEST.json.

|Change|Exact scope|
|---|---|
|identity_private.recovery_enrollments|One row per tenant/user: principal, authorized PREAUTH cookie SHA256 digest, credential generation, creation time. No plaintext token/code/secret; no expiry that could reopen password-only enrollment. FK to existing tenant/user/principal. Owner cleanops_ddl_owner; enabled+FORCED RLS; broker_internal policy; broker only SELECT,INSERT,DELETE. No UPDATE, caller table rights, new roles or memberships.|
|identity_private.checked_preauth(text)|After existing principal/credential/membership/origin/expiry checks, reject a pending recovery whose tenant/user/principal/cookie digest/credential generation do not match this PREAUTH. Covers new password login, tenant selection/rotation and MFA material consumers through the existing shared guard.|
|auth_api.recover_to_enrollment(text,bytea,bytea,bytea,uuid)|Insert the durable binding to the newly rotated PREAUTH after actual code consumption and existing revocations, in the same transaction. Concurrent attempts still serialize under the principal and code consumption.|
|auth_api.issue_active_session(text,bytea,bytea,integer,integer,text,text,uuid)|Remove only the matching binding after VERIFIED/factor prerequisites and session insert, before PREAUTH consumption, in the same commit. A failed COMMIT retains the pending recovery and rolls back factor/session effects.|
|auth_api.admin_reset_mfa(uuid,bytea,text,uuid)|Clear only the target tenant/user binding after the existing independent attestation, RBAC, fresh06 and receipt checks. Preserve all current signatures and authorized reset behavior.|
|auth_api.reset_password_cas(bytea,bigint,bytea,text,uuid)|A successful independently proven password CAS clears pending bindings for the same principal together with current global credential/session/PREAUTH/trusted-device revocation. Failed proof/version/policy checks do not clear anything.|
|auth_api.password_reset_material(bytea) RETURNS jsonb|One new private reader returning only tenantId,userId,principalId,credentialVersion,expiresAt,requiresRecovery or NULL. Owner broker, pg_catalog search_path; PUBLIC revoked; EXECUTE only cleanops_identity_service. No password hash, recipient, recovery digest, token, code or session returned.|

Exact table/function ownership, policy and grants are in ACL.delta.sql. Existing callable SQL signatures/ACL are unchanged; the new reader is the only new callable signature. Expected final inventory:31 forced-RLS tables,45 policies,97 final functions; existing trigger/procedure behavior unchanged. Native inventory remains to be verified after approval.

## Locks, lifecycle and errors

All binding operations occur after existing principal/credential locks, membership locks and PREAUTH authorization. No second connection or new global advisory lock. The marker has no timer/GC/password-only fallback: an abandoned or expired recovered PREAUTH requires the already independently attested/admin-authorized reset path (or proven credential reset); expiration cannot become authority. This availability consequence requires explicit owner approval, not a hidden operational default. Other tenants are unaffected unless an already-approved global credential reset succeeds.

The reader uses the same order as reset_password_cas: ticket discovery without authority; subject/optional admin principal+credential locks (sorted NOWAIT pair where required); sorted subject memberships; ticket FOR UPDATE; current generation; optional admin policy SHARE/session/fresh06 evidence. Re-read immutable identity/admin/token fields after locks; reject consumed/expired/stale/wrong-purpose tickets. Return NULL for ineligible material; existing helper denials42501, lock contention55P03 or infrastructure errors roll back. Never log/project private material. Final CAS revalidation remains mandatory on the same transaction; no ACTIVE result from password reset.

## Required approval and executable validation

Approve the exact complete08 blob/SHA256, its one new private table/policy/broker grant, five restrictive/lifecycle body changes and reader EXECUTE for isolated synthetic PG16 only.07 authorization does not cover these changes. No native08 installation is wired or performed; offline grammar/static checks are not native security proof. No production, deployment, merge, external SMTP or runtime activation.

After approval: fresh exact08 installation/compilation; native role/owner/search_path/RLS negatives (including no service table access and no broker UPDATE on marker); the currently failing independent-browser takeover case must PASS; bound recovery positive/concurrent/rollback/COMMIT/deadline tests; expiry+GC must not reopen enrollment; forged and stale bindings/versions and two tenants; authorized admin/global password reset lifecycle; valid/wrong/expired/consumed/MFA_RESET/stale ticket material; actual UI/API/PG password reset with synthetic independent proof transport and scoped recovery HMAC; CAS one winner; all31-table backup/restore; EMAIL/TOTP/regression and full cleanup inventories. No security controls may be weakened to obtain PASS.
