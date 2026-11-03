# B1 operator channel (D1): implemented in the repository, NOT applied, NOT activated

> **Actualización operativa 03/11/2026:** El encabezado histórico «NOT applied» refleja el momento de redacción, no el estado posterior. El propietario reportó SQL0002/0003 instalados y primer actor `COMMITTED`; consultar [registro operativo 03/11](./B1-STAGING-OPERATIONS-20261103.md). La funcionalidad de enrolamiento de dispositivos/ingress **no** está probada en producción ni en la web desplegada. AUTH-GATE-05 sigue OPEN.


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

Rollback (only after a future independently approved apply; no operational steps are authorized by this document):
- Removing the operator login **does not disable ingress** and **does not revoke already-enrolled credentials**. Do not describe operator-only rollback as a complete B1/ingress rollback.
- The approved rollback plan must explicitly choose whether ingress is disabled. For a full B1 rollback, first disable ingress and verify it is fail-closed. Keep the private operator channel available until every credential enrolled through it that must be retired has been revoked with its required authorization reference and durable audit record; verify no such credential remains `active`. If this cannot be verified, STOP and retain the operator login, with ingress disabled.
- Only after audited revocations and independent approval may the owner `REVOKE EXECUTE` on the three operator functions and `DROP ROLE <operator_login>`. Preserve `identity_private.ingress_operator_audit`, credential records and rollback evidence; never drop these tables as a shortcut. Runtime claim/read is otherwise unaffected by the operator role removal.
- The exact revocation scope, ingress shutdown and restoration conditions, verification evidence and operator-login retirement order require explicit independent approval **before** any SQL0003 or ingress activation.
