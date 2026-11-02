# B1 ingress SQL hardening (local, 2026-11-02)

Status: LOCAL DEVELOPMENT ONLY. Nothing applied to any VPS, PostgreSQL, OpenBao, Agent, Dokploy or Traefik. AUTH-GATE-05 remains OPEN.

Candidate: `db/migrations/0003_ingress_persistence.review.sql` (moved from `docs/proposals/`; `proposed:true` in `scripts/trusted-migrations.mjs`, sha256 pinned, cannot enter the apply queue).

| Finding | Resolution |
|---|---|
| S-1 unbounded claim growth | `auth_api.ingress_gc(max_rows)`: batch 1..10000, deletes only claims expired > 60 s on server time, no UPDATE privilege needed. EXECUTE only for existing `cleanops_auth_maintenance`; denied to runtime and PUBLIC. A purged claim cannot be replayed because `ingress_claim` rejects non-future expiries. Scheduler/cadence (D2) still needs owner decision. |
| S-2 function owner | All six functions are owned by `cleanops_auth_broker` (SQL14 pattern), tables stay with `cleanops_ddl_owner`; broker holds only the table privileges its functions use. `RESET ROLE` precedes the ownership transfer. |
| S-3 runner | No BEGIN/COMMIT; verified under an outer BEGIN/ROLLBACK/COMMIT like `scripts/migrate-postgres.mjs`; session role is restored for the journal write. |

Retention procedure (pending approved schedule): maintenance login calls `SELECT auth_api.ingress_gc(10000)` repeatedly until it returns 0.

Evidence (disposable PG16, fresh cluster per file): `tests/b1/pg-ingress-repositories.test.ts` 15/15, `tests/b1/pg-durable-e2e.test.ts` 1/1, `tests/trusted-migrations.test.ts` 20/20. Covers ownership/privilege matrix, gc batching and limits, gc-versus-32-way-claim concurrency, replay of purged claims, runner transaction rollback and commit.

Not covered: Semgrep CLI is not installed in this sandbox (the static Semgrep tests pass; the guard binary was not run). `tests/static/test_b1_agent_cert.py::..._node24` fails on a Dockerfile `USER` assertion unrelated to this change.
