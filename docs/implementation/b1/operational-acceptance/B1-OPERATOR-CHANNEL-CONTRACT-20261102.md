# B1 operator channel (D1): implemented in the repository, NOT applied, NOT activated

Status: code and SQL are in `db/migrations/0003_ingress_persistence.review.sql` (still `proposed:true`, hash re-pinned in `scripts/trusted-migrations.mjs`) and `lib/b1/pg-ingress-repositories.ts` (`createPgIngressOperator`), exposed beside `firstActor` as `selectAuthBackend(...).ingressOperator(operatorPool)`. The runtime pool still gets 503 for enroll/revoke/recover from `createPgIngressRepositories`. AUTH-GATE-05 stays OPEN.

Design (reuses the first-actor pattern of 0002 and `session_user` auditing):
- Role `cleanops_ingress_operator` NOLOGIN, EXECUTE only on `ingress_enroll`, `ingress_revoke`, `ingress_recover` (+ USAGE on `auth_api`). No table access, no claim/read/gc, no membership in runtime or maintenance roles.
- The migration creates no LOGIN and no password. The owner creates the dedicated login out of band: `CREATE ROLE <operator_login> LOGIN IN ROLE cleanops_ingress_operator` (credential custody is the owner decision below).
- Separate pool: the factory refuses the runtime pool, and every write first checks inside its own transaction that `session_user` holds the operator role and none of `cleanops_identity_service`, `cleanops_auth_maintenance`, `cleanops_runtime` (a mixed login fails closed with no write and no audit row).
- Every enroll/revoke/recover appends to `identity_private.ingress_operator_audit` in the same transaction (`operator = session_user`, action, scope, credential ids, mandatory authorization reference). The reference is metadata, not authority. Revoke is revision-CAS; recover is one atomic revoke+enroll with a single audit row.
- Functions keep broker ownership (S-2) and SECURITY DEFINER with `search_path=pg_catalog`.

Evidence (disposable PG16, fresh cluster per file): `tests/b1/pg-ingress-repositories.test.ts` 17/17 (new: operator least privilege, audit by session_user, CAS, atomic recovery, mixed-login refusal; ACL matrix extended), `tests/b1/pg-durable-e2e.test.ts` 1/1.

BLOCKED BY AUTHORIZATION (owner decisions, not code):
1. Name and credential custody of the operator login (and who may hold it).
2. Custody of the Ed25519 ingress signing key for credential issuance outside the runtime group. Today it is a runtime-group-readable private file; issuing device credentials from an operator CLI needs a second, operator-only copy or an OpenBao transit path. No CLI is shipped until this is decided (a CLI without key custody would be inventing it).
3. Approval of the migration (including the new role) by the independent reviewer.

Rollback (after a future approved apply): `REVOKE EXECUTE` on the three functions from the role, `DROP ROLE <operator_login>`; runtime claim/read is unaffected. The audit table is retained.
