# SQL09 — reset-password owned reservation from bootstrap

REVIEW ONLY, NOT INSTALLED. Separate exact authorization required. This is a missing reset HTTP contract, not a repair to SQL08. All SQL08 bytes and existing function bodies remain unchanged in the full fresh-install candidate.

## Demonstrated contract dependency

V4 HTTP_CONTRACT.md, Idempotencia y concurrencia, requires Idempotency-Key on mutations except login/verifyMfa, a request digest, and reserve/effect/audit/complete in one transaction. SQL08 reserve_owned accepts only an authenticated ACTIVE context or checked_preauth. Neither is available to a password-reset claimant who has only bootstrap CSRF, an independently attested reset ticket and recovery proof. The TypeScript adapter explicitly rejects BOOTSTRAP reservations. Omitting idempotency, fabricating password-verified PREAUTH, or granting table access would change that contract or weaken security.

## Minimal extension and exact ACL

One new function: auth_api.reserve_reset_owned(text,text,bytea,bytea) RETURNS jsonb. Its arguments are the opaque bootstrap cookie, CSRF, key digest and keyed request digest. It locks and validates existing BOOTSTRAP/CSRF, then reserves existing ceremony_idempotency under the fixed operation resetPassword, one_time=true, expiry bounded by bootstrap. Only the owning backend/xid can finish/discard. Mismatch, expiration, completed replay and foreign transaction ownership remain errors. No response/password/ticket/recovery plaintext is stored.

Owner cleanops_auth_broker; SECURITY DEFINER SET search_path=pg_catalog; PUBLIC revoked; EXECUTE only cleanops_identity_service. No table/role/RLS grants, new tables, existing signatures or existing bodies changed. Existing complete_owned/discard_owned already delegate to finish_owned, which validates the exact digest/operation/key/hash/owner_backend/owner_xid, even after a ceremony ends. Reuse those functions; do not duplicate completion code.

Bootstrap is never identity, tenant, MFA, reset proof or session authority. The separate approved password_reset_material/reset_password_cas must still validate the independently attested ticket, current credential generation and recovery proof or current authorized administrator. No ACTIVE session is issued. The later HTTP controller must not accept tenant/user/version/permission from the client.

## Lock order and validation after approval

One connection/transaction: bootstrap and CSRF lock; fixed-operation reservation; ticket discovery and approved sorted principal/credential/membership locks; ticket lock/revalidation; private password policy and Argon2id; scoped recovery HMAC; CAS plus current revocations/audit; existing owned completion; COMMIT; safe HTTP projection/cookie clearing. No production configuration or SMTP provider selected.

Required native negatives after separate approval: missing/wrong/expired/consumed CSRF/bootstrap; ACTIVE/PREAUTH tokens cannot enter this function; no direct table/role access for any service; foreign connection/xid cannot complete or discard; wrong operation/key/hash; same key/different body; expiry; simultaneous requests and one CAS winner; invalid ticket/recovery/policy does not reset; no account enumeration; rollback and terminated-connection COMMIT; no session before COMMIT; all-table restore and cleanup. Existing SQL08 recovery/EMAIL regressions stay mandatory. Offline parsing is not native security evidence.

Full exact diff, manifest and request are adjacent. No SQL09 native workflow is wired. Approval, if granted, must name the complete candidate blob/SHA-256 and its one new function EXECUTE, exclusively for new isolated synthetic PG16.
