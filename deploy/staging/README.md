# CleanOps 360 — staging preparation (NOT DEPLOYED)

GitHub branch: `staging`; Dokploy project `cleanops-360`, environment `staging`, Compose service `cleanops-staging`, app name `cleanops360`. Compose path: `deploy/staging/compose.yaml`. Keep **Autodeploy OFF**. Nothing here authorizes a Hostinger change.

## Current executable boundary
The Next.js server and isolated PostgreSQL 16 are described by Compose. **B1 runtime is still `closedBackend`**, so auth APIs intentionally return safe unavailable responses. There is no approved production PostgreSQL bootstrap/identity adapter, no active Redis/BullMQ worker, no general-purpose API container, and no approved operational OpenBao unseal/quorum. These are not disguised as working services. Do not expose the app to real customer data or mark B1/PR006/PR007 complete.

The entire Compose network is internal and no host ports are published. **External Traefik routing is deliberately absent**. Dokploy needs a separately reviewed ingress-network attachment + TLS domain configuration before any public entrypoint can work. A 200 healthcheck on `/login` proves the UI responds, not that backend authentication works.

## Before any authorized deployment
1. Confirm a suitable Swiss staging region and data processing boundary, primary/backup disks and support location. Inventory other projects and available capacity without altering them.
2. Obtain explicit approval to modify Dokploy and allocate staging resources. Do not enable Autodeploy, install SQL/ACL, initialize a real secret store or expose routes under this preparation authorization.
3. Set `CLEANOPS_AUTH_ORIGIN` to the exact approved HTTPS origin and `CLEANOPS_PG_PASSWORD_FILE` to an absolute, root-controlled private file on the target (never in Git or Dokploy logs). The file must exist before `docker compose config`.
4. Run `docker compose --env-file /private/path/staging.env -f deploy/staging/compose.yaml config -q`. Validate image build, memory headroom, storage/backup and absence of conflicts before provisioning.
5. Keep PostgreSQL closed on the internal network. The initialized bootstrap superuser is **not an app runtime identity**. No automatic SQL migration, role grants, database restore or synthetic fixture data are run by Compose.
6. Supply separately approved TLS ingress and route configuration only after identity backend, custodians, isolation and operational security review are approved. The present Compose does not publish port 3000.
7. OpenBao 2.7.1: use the pinned candidate and existing reviewed template under `docs/implementation/b1/operational-acceptance/openbao/`. This package does not initialize/unseal an operational OpenBao, and cannot pretend the isolated 144 checks establish Swiss custody. Real workload certificates, Raft durability, audit sink and recovery require owner-approved specific resources and secondary custodian/quorum.
8. Execute owner-authorized isolated DB SQL14 and migrations using approved artifacts only; perform witnessed encrypted backup/restore, independent review, ten manual PO steps and formal signoff. Require measured operational RPO <=15 min / RTO <=4h; frozen CI restore duration is not that proof.

## Promotion and portability
Never point Dokploy to `feat/*`. Create `staging` once from the latest B1 feature head to preserve all history. Subsequent approved modules land on `staging` only through reviewed integration, without switching the Dokploy branch. `main` remains untouched until separate merge authorization. No force push.

This compose uses project-scoped named volumes/network and no provider-specific binds, making relocation possible to owned Swiss home hardware, VPS or dedicated hosts. Export independently encrypted database+roles and approved OpenBao Raft snapshots, confirm hashes and restoration on **new** targets, then re-point approved DNS/ingress after testing. Host metadata, users, backups and keys must never be assumed portable without migration checks.

## Resource envelope (planning only)
Web: up to 0.65 vCPU/768MiB; PostgreSQL: up to 0.6 vCPU/1GiB; Docker, backups, OpenBao and any future Redis/workers require additional measured headroom. Existing VPS figures dated 18 October 2026 are historical, not a current capacity check. Storage consumption and startup behavior not yet measured.

## Evidence boundaries
Configuration files are published and require Compose syntax validation, isolated build and a real preflight before declaring **STAGING READY FOR DEPLOYMENT**. No staging deployment, live TLS, operational PostgreSQL integration or OpenBao readiness is claimed.
