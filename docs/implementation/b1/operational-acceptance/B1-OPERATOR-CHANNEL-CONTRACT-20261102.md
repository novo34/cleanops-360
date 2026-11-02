# B1 operator channel: minimal contract for approval (NOT implemented)

Reason for stopping: no accredited operator identity, connection or signing-key custody exists to reuse. The runtime key is readable by the runtime group and the runtime pool must never receive enroll/revoke/recover. The only separate-pool precedent is `firstActor(manifest, operatorPool, keyVersion)` in `lib/b1/private-runtime.ts`. Nothing insecure was added; `createPgIngressRepositories` still blocks those writes with 503.

Decisions required from the owner (D1):
1. Operator identity: a nominal NOLOGIN role plus a dedicated login (first-actor pattern), with EXECUTE on `ingress_enroll`, `ingress_revoke`, `ingress_recover` only. Name and credential custody to be assigned by the owner.
2. Connection: a separate operator pool, never the runtime pool, using an approved path (no new network listener).
3. Signing-key custody: where the Ed25519 ingress signing key lives for issuing credentials outside the runtime group, and who may read it.
4. Audit: record `session_user` and the authorization reference for every call; the reference is metadata, not authority.
5. Rollback: revoke EXECUTE and drop the operator login; no effect on runtime claim/read.

Once approved, implementation is: one incremental migration adding the grants, an operator CLI built on a separate pool, and tests for least privilege, CAS revocation and atomic recovery (the SQL functions and their tests already exist).
