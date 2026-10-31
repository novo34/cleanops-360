# B1 — Consolidated closure execution, 2026-10-31

State: **PREPARED FOR CONTROLLED ACCEPTANCE; AUTH-GATE-05 OPEN**.
This is an execution handoff, NOT a deployment authorization or an acceptance certificate.

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
4. Listener lifecycle actually wired to the server owner with explicit IP/port, peer CA, pinned proxy fingerprint, ready/close and shutdown ordering (deny new ingress; drain listener; drain HTTP/runtime; close canonical PG pool; zero TLS). This is NOT presently wired by instrumentation.
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
- Trusted pool binder is optional in the current bootstrap API; staging must require v2 with successful binding, not silently accept v1, before relying on durable ingress.
- The listener is an explicit separate component and does not yet participate in trusted startup/shutdown. Do not label it deployed.
- PostgreSQL proposal is not installed or independently authorized. Owner-only credential writes remain a design/operation gate.
