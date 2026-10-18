# SQL12 — exact owner approval required, REVIEW ONLY

Not installed. Current B127/44; SQL11 remains the only installed/authorized candidate for current tests. B1/AUTH-GATE-05 OPEN, runtime closedBackend.

- Candidate PG-TEST-01-CONSOLIDATED-12, blob `9246692e8306100a25c402857f1273e5ee10c7ae`.
- SHA256 `78c222c842c63da80eb7f967cbae6a93dad7306f366787f3a9f5c7016b4d05da`, 209135 bytes.
- Base exact owner-approved SQL11 blob3f13bb1132c5b1ffdd35d4993bb9aa2ca3c75f06, SHA25654f9c0d94441ed3f72f6dc1c3d4d9bca1b9f0072a7d0f7c6059debe80eea9d6e.
- [Complete diff](SQL11_TO_SQL12.diff), SHA256 `e485d9f340de8c449b436065f8c5ba8fa5ec42494f9bd3cb775a5bae6f0d0a90`.
- Reproduce: `python3 scripts/consolidate-b1-preauth-selection.py --check`. Static PostgreSQL grammar parsing is not an installation/security PASS.

## Existing functional blocker, not a new product feature

The approved V4 HTTP company selector requires PREAUTH cookie/CSRF rotation. Current private switchTenant intentionally rejects password-verified TENANT_SELECTION_REQUIRED with503 because select_tenant selects a membership but does not rotate either digest. Reusing that cookie or disabling mustRotate would break the approved contract. begin_switch requires ACTIVE+source step-up and cannot safely stand in for an unbound password-only ceremony. The current closed path stays closed until exact approval and real validation; no unavailable operation is marked complete.

## Exact minimal addition

`auth_api.select_tenant_rotated_owned(raw_preauth text,new_cookie_hash bytea,new_csrf_hash bytea,target_tenant uuid,key_hash bytea,request_hash bytea,corr uuid) RETURNS jsonb`

One new fixed function. No existing body/signature, role, table, RLS or direct table privilege changes. SECURITY DEFINER, owner cleanops_auth_broker, exact search_path=pg_catalog, revoke all PUBLIC, EXECUTE only cleanops_identity_service (owner implicit privileges retained). Existing select_tenant stays byte-identical and retains its current ACL because the already approved fresh-password single-company login uses it before emitting any cookie. It is not a fallback for the public PREAUTH selection route and never authenticates/issues a session by itself.

Only checked, password-verified, unbound SELECTION with no factor/origin is eligible. Requires32-byte different new cookie/CSRF digests, pending unexpired one-time switchTenant marker for the old digest, exact request/key, current backend/xid. Revalidates the marker after target/policy lock waits. Reuses sorted membership locks, target policy SHARE and approved select_tenant for active tenant/membership/B1-SELF-08. Rechecks credential version/expiry. Rotates the SAME preauth row/digests with old digest CAS; expiry and password proof are never extended and no factor/session is granted.

Existing checked_preauth lock sequence is retained; owned marker is held before target membership/policy locks. The principal lock serializes this principal's ceremonies; no policy SHARE→exclusive upgrade is introduced. Successful subtransaction merges locks into the outer transaction. Expected target denials roll back the complete inner selection/rotation and return only selected=false/POLICY_DENIED; missing ownership/unexpected SQL errors abort the entire unit. Success returns selected=true/binding_id only, never cookie/digests/recipients/method material.

The TypeScript caller must retain one outer transaction: rate charge → one-time old-binding reservation → selection/rotation → trusted versioned MFA preparation → server audit → existing finish_owned on the OLD binding digest → COMMIT → new cookie/CSRF HTTP. Existing finish_owned intentionally validates the owned marker without requiring the revoked/rotated old cookie to remain usable. No marker transfer or change to finish_owned. Expected denials must commit bounded rate/security-denial accounting and discard the old marker. Any preparation/SQL/COMMIT failure rolls back rotation, challenge, audit and marker; the caller must not emit a cookie. Challenge/preparation failures need an enclosing service savepoint where required to preserve accounting without partial selection effects. No silent compatibility fallback.

## Required isolated execution after approval

Verify exact bytes/diff/ACL, clean PG16 installation and runtime SQL body/privilege checks. Test two real member companies with distinct tenant TOTP keys: initial password login produces SELECTION with no session; allowed choice rotates both cookies, invalidates old binding, preserves expiry and requires destination MFA; actual UI→API→PG session only after proof/COMMIT. Test unknown/foreign/disabled/revoked membership, policy deny, stale credential, expiry during lock wait, wrong/foreign/missing/expired owner marker, backend/xid mismatch, unchanged digests, factor/origin-bound preauth rejection, concurrency and replay, proof/method generation revalidation, late MFA preparation denial, rollback, failed COMMIT/ack loss, durable successful audit and safe denied accounting,31-table restore and cleanup/preexisting inventories. No production/SMTP/deployment/merge or runtime activation.

## Owner authorization requested

Approve this exact function contract/ACL and complete identified blob for installation/tests only in a NEW isolated PostgreSQL16 Docker with synthetic data, no public ports/shared volumes. No extra SQL/ACL. No authorization is inferred from static tests, general B1 work or the earlier SQL11 approval. Other independently authorized B1 tasks continue while this decision is pending.
