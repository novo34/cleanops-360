# B1 ingress SQL hardening (local, 2026-11-02)

Status: LOCAL DEVELOPMENT ONLY. Nothing applied to any VPS, PostgreSQL, OpenBao, Agent, Dokploy or Traefik. AUTH-GATE-05 remains OPEN.

Candidate: `db/migrations/0003_ingress_persistence.review.sql` (moved from `docs/proposals/`; `proposed:true` in `scripts/trusted-migrations.mjs`, sha256 pinned, cannot enter the apply queue).

| Finding | Resolution |
|---|---|
| S-1 unbounded claim growth | `auth_api.ingress_gc(max_rows)`: batch 1..10000, deletes only claims expired > 60 s on server time, no UPDATE privilege needed. EXECUTE only for existing `cleanops_auth_maintenance`; denied to runtime and PUBLIC. A purged claim cannot be replayed because `ingress_claim` rejects non-future expiries. Scheduler/cadence (D2) still needs owner decision. |
| S-2 function owner | All six functions are owned by `cleanops_auth_broker` (SQL14 pattern), tables stay with `cleanops_ddl_owner`; broker holds only the table privileges its functions use. `RESET ROLE` precedes the ownership transfer. |
| S-3 runner | No BEGIN/COMMIT; verified under an outer BEGIN/ROLLBACK/COMMIT like `scripts/migrate-postgres.mjs`; session role is restored for the journal write. |

## D2 maintenance strategy (prepared, not scheduled)

`0003` stays a non-executable proposal. Retention is `createPgIngressMaintenance(maintenancePool, runtimePool).gc(limits)` (`lib/b1/pg-ingress-repositories.ts`), run only with a `cleanops_auth_maintenance` login:
- Limits: batch 1..10000 (SQL enforces it), at most 1000 batches, wall-clock cap, per-batch `SET LOCAL statement_timeout`/`lock_timeout`; each batch is its own short transaction. Recommended start: batch 5000, 20 batches, 60 s, statement 5 s, lock 1 s.
- Concurrency: session advisory lock `cleanops.ingress_gc`; an overlapping run returns `busy` instead of queueing. Against 32-way claims gc never blocks or loses a live claim (tests above).
- Failure/recovery: partial progress is committed and idempotent; the recovery is running it again. A connection whose lock state is unknown is destroyed, not pooled.
- Manual equivalent (no code): `SELECT auth_api.ingress_gc(5000)` repeated by the maintenance login until it returns less than the batch.
- Cadence/scheduler: BLOCKED BY AUTHORIZATION (owner picks Dokploy schedule or equivalent; none is created).

## D3 listener on a dynamic overlay address (implemented; delta prepared, not active)

`ingress.binding` in the reviewed manifest may now be a private CIDR (the `dokploy-network` subnet) instead of a literal IP; `resolveIngressBinding` (`lib/b1/ingress-listener.ts`) selects the process's single non-loopback IPv4 address inside it and fails closed on 0 or several matches, wildcard, non-RFC1918 or prefix < 16. No manifest schema change (the Semgrep-pinned loader is untouched; existing literal-IP manifests behave as before). mTLS, proxy pin and path allowlist are unchanged. Traefik reaches the listener through a stable DNS alias, not an IP. Exact Traefik/Compose delta: `deploy/staging/traefik/b1-forward-auth.delta.example.yaml` (adds one router and two middlewares; existing routers on port 3000, `/login` and `redirect-to-https@file` untouched). Optional extra isolation is described there and requires a separate owner decision.

## D4 SIGTERM (prepared; limit NOT removed)

Next 16.4.3 `start-server` handles SIGTERM with `server.close()` then `process.exit(143)` and does not await B1. B1 now logs `B1_SHUTDOWN_COMPLETE` only after listener drain, pool close and key zeroing (`B1_SHUTDOWN_INCOMPLETE` on failure), so staging can verify instead of assuming: an exit without the completion line means B1 shutdown was cut. `stop_grace_period: 40s` is prepared in the delta file (kept out of `compose.b1-web.yaml` because its offline test requires the merged web to equal the base). Next's `process.exit` is not modified. Candidate if staging shows cut drains: `NEXT_MANUAL_SIG_HANDLE=true` with B1 owning the exit, which changes Next's own HTTP drain and needs its own review; not applied.

## D5 passwords (no change)

Uses only the already communicated approved policy: corpus `xato-minlen12-20261031` (1008 entries, SHA-256 `24e7aa5e3c9df388ee36d5c729cffd010158da55c43463547cac140b6f8c1c84`), `password_min=12`, `password_max=128` (`lib/b1/security-values.json` verified identical). The corpus bytes live only in the private manifest; nothing was generated or added.

Evidence (disposable PG16, fresh cluster per file; re-run after the D1/D2 changes): `tests/b1/pg-ingress-repositories.test.ts` 17/17, `tests/b1/pg-durable-e2e.test.ts` 1/1, `tests/trusted-migrations.test.ts` 20/20 (new sha256 pin `40c9a316…90f4ca`). Covers ownership/privilege matrix, gc batching and limits, gc-versus-32-way-claim concurrency, replay of purged claims, runner transaction rollback and commit, operator channel and maintenance runner.

Not covered: Semgrep CLI is not installed in this sandbox (the static Semgrep tests pass; the guard binary was not run). `tests/static/test_b1_agent_cert.py::..._node24` fails on a Dockerfile `USER` assertion unrelated to this change.
