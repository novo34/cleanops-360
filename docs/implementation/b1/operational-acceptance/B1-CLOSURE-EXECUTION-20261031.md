# B1 — Consolidated closure execution, 2026-10-31

State: **PREPARED FOR CONTROLLED ACCEPTANCE; AUTH-GATE-05 OPEN**.
This is an execution handoff, NOT a deployment authorization or an acceptance certificate.

**Evidence register (read before asking for any repeated VPS test):** [B1-VPS-EVIDENCE-REGISTER-20261031.md](./B1-VPS-EVIDENCE-REGISTER-20261031.md). Do not repeat recorded PASS checks unless the relevant input bytes or running topology changed.

**Code state:** the reviewed v2 private manifest now carries the complete `ingress` block (bind address, port, allowed paths, issuer, pinned proxy certificate SHA-256, TLS/CA/signing/pseudonym sources). `startTrustedB1Server` builds the durable assertion issuer, the ForwardAuth handler and the mTLS listener from it, and owns their ordered shutdown. `instrumentation.ts` is unchanged. Tests of this delta are recorded under *Local verification of the wiring* below; they use local OpenSSL certificates and no real SQL, VPS or secrets. `AUTH-GATE-05` stays OPEN.

## Proven against preparation branch

Repository: `novo34/cleanops-360`, branch `prep/b1-persistence-recovered-20261031`.
Owner-reported Windows results at `3f4c6824d5aebe4da059010bfdd7e139c1e66912`: TypeScript PASS, ESLint PASS, private-runtime 6/6 PASS. Earlier owner-reported focused tests: private v2 2/2 PASS, PostgreSQL 16 ingress ACL proposal 10/10 PASS on disposable database, issuer/ForwardAuth/mTLS focused PASS. These do NOT certify the actual staging topology, permissions or TLS deployment.

Existing B1 SQL14/OpenBao/Agent preparatory work must be inventoried, not reinstalled. Existing Docker/Dokploy Compose and PG/TLS/HBA local changes must be reconciled rather than overwritten. The original full B1 16 failures documented in the older gate must not be considered cleared by the targeted tests.

## Remaining gates (one sequence, not three recurring development tasks)

### A. Read-only evidence bundle — no modification
Record current remote staging SHA, exact Dokploy running Compose location/hash/diff, active image digest, mounts/network, existing reverse-proxy routers and middleware, B1 private manifest version and hash/uid/gid/mode, private module hash, ingress TLS source permissions, Agent/OpenBao status and PostgreSQL identity-role privileges (metadata only). Compare against deployed references before proposing changes. Do not expose private file bytes, secrets or credentials. Abort if actual state diverges or is inaccessible.

### B. Single independent approval package
Submit a combined immutable diff and rollback plan covering:
1. `docs/proposals/b1-ingress-persistence.review.sql` (PROPOSAL ONLY), review schema, SECURITY DEFINER search_path and function owner, immutable nonce claims, expiry/retention and exact runtime read/claim EXECUTE permissions. No direct table access. No SQL14 rerun or silent SQL install.
2. An independently authorized **operator-only** credential enrollment/revocation/recovery channel. Current `createPgIngressRepositories` deliberately rejects these writes in the runtime; enrollment cannot be conjured from the web listener. Separate operator identity, auditable approval and least privilege are required. Never grant enrollment to the runtime identity.
3. A version 2 reviewed private manifest and immutable module bytes, email normalization approval and real snapshot, verifier public key/issuer/audience, and ingress signer key custody. `renderDurablePrivateIntegration` and the canonical-pool binder are prepared; no legacy process-local replay fallback.
4. Real ingress material in the private package (values, not code): listener cert/key, trusted proxy client CA, pinned Traefik proxy certificate SHA-256, Ed25519 signing key and 32-byte pseudonym key. The lifecycle itself is wired in code (manifest `ingress` -> `startTrustedB1Server` -> listener; shutdown: deny new ingress, drain listener, close canonical PG pool, zero TLS and key buffers). Known limit: Next's own SIGTERM handler calls `process.exit` after `server.close` without awaiting B1, so a slow drain can be cut short; the shutdown is bounded by `drainTimeoutMs` and must be observed in the staging window.
5. Traefik TLS proxy wiring/ForwardAuth header sanitation: original untrusted forwarded/assertion headers must be discarded and recreated once by the trusted proxy. Preserve existing web router, `/login`, static assets and `redirect-to-https@file`; narrow B1 paths only. Validate on effective Compose, never replace it wholesale.
6. Required actual credentials, certificate fingerprints, trusted client CA and operator/owner assignments with verifiable metadata only. The implementation cannot manufacture approvals.

### C. One explicitly authorized staging window
After independent security review and owner authorization of the exact operations: back up/reconcile the live configuration; deploy only approved changes; apply separately approved SQL; verify role permissions and negative cases; perform controlled credential enrollment through independent operator channel; test real mTLS, replay/revoke, login/TOTP/sessions, recovery, shutdown/fail-closed and rollback. Do not recreate PG/OpenBao volumes or rotate unapproved keys. Capture redacted dated evidence including source/Compose/SQL hashes.

### D. Formal closure
An independent reviewer signs the security findings; the Product Owner performs the manual PR006/PR007 acceptance and reconciles the 44 original requirements. Only with complete evidence and explicit PO decision may AUTH-GATE-05 be closed and the successor module opened. Preparation-branch tests or a green CI check cannot replace these steps.

## Hard stop
Do not change `main`, `staging`, Dokploy, VPS, Traefik, OpenBao, productive PostgreSQL, runtime private files or operator credentials under this handoff. Do not open PR or deploy by inference. A future authorization must name the exact environment, files, execution steps and rollback.

## Known implementation caveats to review before any rollout
- V2 private renderer verifies a reviewed public key, but its generated module and exact allowed imports must be bundled/reviewed for the actual Node private loader; isolated `data:` import tests are not proof of production bundler compatibility.
- The ingress binder and the `ingress` manifest block are mandatory at startup (`B1_INGRESS_BINDING_REQUIRED`, `B1_INGRESS_LISTENER_REQUIRED`); a v1 manifest is rejected.
- The listener now participates in trusted startup/shutdown but is NOT deployed: no real certificates, proxy pin or Traefik ForwardAuth exist yet. Do not label it deployed.
- PostgreSQL proposal is not installed or independently authorized. Owner-only credential writes remain a design/operation gate.


## Targeted deployment delta — derived from actual VPS inventory (2026-10-31)

Observed: running web `cleanops360-f4fxmd-web-1` uses image digest `sha256:ad632f802c2d0992166f2db7ba7242c2c5b401144244b42fe72a1a8d7b20b290`, connects to `cleanops360-f4fxmd_default`, `cleanops360_staging_private`, `dokploy-network`, and has **zero Docker mounts**. Agent is running and owns volume `cleanops360-f4fxmd_identity_agent_sink`. PostgreSQL and OpenBao healthy. Host `/run/cleanops-b1-private` absent when checked. Operational Dokploy Compose contains live HTTPS routers/redirect absent from GitHub's staging Compose. Preserve the operative Compose before preparing a diff.

**Existing candidate to reuse:** `deploy/staging/compose.b1-web.yaml`, not an alternative full Compose. Do not apply it verbatim: its `image`/network additions must be reconciled with current operative web settings. No second Agent, PG, Bao or network.

| Element | Exact intended delta | Prerequisite / stop |
|---|---|---|
| Web image | Build/pin reviewed B1 image as an immutable digest, retaining existing web ports, labels, restart, identity and healthcheck | Actual current Compose source/hash and image/runtime UID:GID confirmed; never replace image merely to add mounts |
| Agent sink | Read-only mount of **existing** `cleanops360-f4fxmd_identity_agent_sink` at `/run/cleanops-agent` in web | Confirm token read permitted for actual non-root web UID/GID, without revealing token |
| Private B1 package | Read-only mount of reviewed, root-owned private files at `/run/cleanops-b1-private`; use existing owner file contract and manifest v2 | Real package does not yet exist at checked path; must obtain approved bytes, SHA, metadata and certificate identity before creation |
| Networking | Keep three observed web networks and Traefik service/router bindings; add only a proven missing private peer route | No public mTLS listener or unverified Agent network include |
| Identity SQL | Apply **only** an independently approved ingress SQL candidate, not SQL14 and not operator enrollment via runtime pool | Metadata check whether candidate functions are already installed; independent operator authorization required |
| Ingress/TLS | Wire listener, bounded shutdown and audited Traefik ForwardAuth only on B1 routes | Code listener wired through the manifest (this branch); actual proxy pin/CA and forwarded-header proof must be reviewed |
| Verification | One staged release and functional gate; verify login, TOTP, sessions, replay, revocation, failure behavior and rollback | Named Security reviewer and owner authorization of exact diff/SQL and downtime scope |

**Exact no-op rollback state**: record previous operative Compose bytes/hash, current web image digest above, web networks, Traefik labels, web mount list (empty), preexisting PG/OpenBao/Agent IDs and volume names. For web-only failure, return to prior web image/mounts/routers after verified preconditions; do not roll back or recreate persistent PG/Bao volumes. SQL rollback, if separately approved and applied, requires its own reviewed forward recovery rather than blind DROP.

No operation in this section is authorized merely by documenting it. Do not expose approval tokens or private material.

## Local verification of the wiring (no VPS, no SQL)

- `tests/b1/server-startup.test.ts`: real mTLS lifecycle (pinned proxy reaches the repository; CA-signed but unpinned peer is denied before any DB access; wrong path 403; no client certificate rejected), startup-failure cleanup, SIGTERM-driven shutdown restoring the signal-handler count, runtime answering 503 after stop.
- `tests/b1/reviewed-site-installation.test.ts`, `tests/b1/installation-bootstrap.test.ts`: manifest v2 with `ingress`, Ed25519 signer / 32-byte pseudonym validation before any runtime is composed.
- `scripts/check-semgrep-reviewed.py` must be re-pinned by the owner after independent review of the changed loader: apply `B1-RUNTIME-PIN-PENDING.patch` (runtime blob, loader hash, import entry line 50). Until then the Semgrep guard fails by design.
- Known non-blocking: 30 Edge-runtime build warnings from the existing Node-only imports under `instrumentation.ts`.
