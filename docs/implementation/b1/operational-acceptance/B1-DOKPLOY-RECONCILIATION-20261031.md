# B1 — Dokploy observed Compose reconciliation (2026-10-31)

**Read-only review; NO deployment authorization.** User-supplied Dokploy General screen and Preview Compose are the observed sources, not proof of the effective runtime/container spec.

## Observed Dokploy

Application `cleanops-staging`, GitHub `cleanops-360`, branch `staging`, Compose path `deploy/staging/compose.yaml`; trigger `On Push`, Autodeploy appears off. Do not assume `On Push` can never cause deployment; do not push changes to staging before exact authorization.

Preview includes `compose.openbao.yaml`; `web` on `private`, `dokploy-network` and `default`; Traefik routers `cleanops360-f4fxmd-15-web` / `cleanops360-f4fxmd-15-websecure`, HTTPS certresolver `letsencrypt`, `redirect-to-https@file`, routing `cleanops.nuvurent.com` to port 3000. The preview contains neither B1 private mounts nor ingress listener wiring nor ForwardAuth B1 routers.

Postgres preview includes existing `pgdata`, pinned image **variable** (not verified digest), TLS cert/key/CA and HBA bind mounts, password secret and startup options. This preview alone does NOT prove files, permissions, running image, TLS connection or SQL/ACL installation.

`compose.openbao.yaml` in GitHub is a **synthetic profile** `synthetic-custody`; inclusion alone does not establish that OpenBao is running, trusted, or available to runtime.

## Verified GitHub deltas

Remote `staging` at `d3ea84b38fd1574db1610f03b59c8c4a5050ac72`; preparation at `816ab8c96c571a3dc720b48683a07a37373ddc00` at time of read. GitHub comparison showed 128 commits ahead and zero behind at that time; no wholesale merge intended.

GitHub `staging` `deploy/staging/compose.yaml` blob `255f21e6974dd33c6fcb39d1e18775ad073049df` does NOT include the Traefik labels, `dokploy-network` and `default` web networks shown in Dokploy Preview Compose.

Preparation branch blob `37a198317a1a66fe00bb17211ced5ce01725b167` adds an Agent include, `web` identity volume and `identity_bao`, and required non-root build args. These are NOT present in the observed Dokploy preview and must NOT replace or remove operative networks and routers.

Separately prepared `deploy/staging/compose.b1-web.yaml` is a review overlay, not a replacement: it specifies a prebuilt image, mounts of private identity package and agent sink, and private network. These resources are NOT observed as running.

## Required reconciliation decision

1. **Freeze reference**: preserve the exact observed Dokploy Compose bytes/config, its source (UI overrides, patched checkout, or other) and fingerprint. Read-only evidence of actual container networks, image digest, mounts and TLS remains unknown.
2. **Web preservation**: keep HTTPS/HTTP routers, working `/login`, static content, `redirect-to-https@file`, `dokploy-network`, `default` and port 3000 until a verified diff proves an alternate minimal form.
3. **No silent Agent duplication**: do not include/create a second agent if pre-existing out-of-Compose runtime Agent is the owner of the sink.
4. **No blind network changes**: reconcile `private`, existing operational Bao/Agent network and availability of a dedicated listener network. Do not publish ingress/mTLS publicly.
5. **Only after approval** propose narrow B1 path matching and middlewares; require pinned peer cert, verified single-hop forwarded-header reconstruction, durable source and runtime startup/close coupling, approved SQL ACL and operator channel. This cannot be represented as just one unreviewed Traefik label.
6. Run `docker compose config` against **the effective preserved Compose plus precise approved additions** with redacted variables, then obtain independent security and owner approval before any mutating action.
7. Capture rollback as exact prior UI config, image digest, Compose checksum, volumes/networks and no-op restoration criteria; never recreate PG/OpenBao.

## Gate

Until effective runtime bytes and approvals are observed, `AUTH-GATE-05` stays OPEN. No changes to staging/main, VPS, Dokploy or SQL are approved by this review. Avoid repeated synthetic code changes or automatic merging of 128 commits.
