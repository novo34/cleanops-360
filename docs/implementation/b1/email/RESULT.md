# EMAIL functional vertical — isolated real execution PASS

Verified source `b54d7562f1b9326d2acfadd6d8a707b9f0e4a226`. [Real PostgreSQL/Chromium run39106575063 SUCCESS](https://github.com/novo34/cleanops-360/actions/runs/39106575063); [code CI39106574954 SUCCESS](https://github.com/novo34/cleanops-360/actions/runs/39106574954).

**45 checks PASS,0 FAIL/BLOCKED/SKIP**, including14 real Chromium flows:10 EMAIL and4 prior TOTP/session/enrollment/multiple-method regressions. Exact SQL07 hash reverified; no SQL/ACL modification. New isolated PG16, service-role functional calls, encrypted outbox and real worker. Delivery is explicitly synthetic; no external SMTP or production integration. All30-table backup/restore and cleanup/inventory checks PASS.

EMAIL implements initial first-code enrollment, additional ACTIVE enrollment with independent05/06 step-ups, login, step-up, strict requests/projections, CSRF, rate/cooldown, resend invalidation, expiry, recipient revocation, definitive transient retry with stable delivery identity, quarantine on uncertain outcome, real concurrent200/401 single winner and terminated-connection COMMIT rollback followed by valid retry. Plain OTP or unkeyed proof-request fingerprints do not persist in the proof/idempotency tables. Post-COMMIT cookies only. No browser storage of factors or private metadata.

Individual isolated functional acceptance under the owner's instruction, without waiting for all44:

|Requirement|Complete evidence|
|---|---|
|REQ-AUTH-011|Native TTL≤300s; real expired challenge rejection; concurrent one winner; consumed/revoked challenge denial; reissued challenge only accepts current code|
|REQ-AUTH-012|Real32-byte HMAC proof, AEAD ciphertext until dispatch; ciphertext cleared on SENT; private idempotency request fingerprints keyed with HMAC; safe HTTP projections|
|REQ-AUTH-013|Original challenge+original proof explicitly rejected after resend; old code rejected against replacement; replacement code succeeds|
|REQ-AUTH-014|Immediate actual resend429; retry after aging only the synthetic challenge timestamp succeeds; policy/cooldown values unchanged|

**4/44 accepted**, B1/AUTH-GATE-05 OPEN, closedBackend unchanged. Acceptance is functional in the authorized isolated environment, not production or phase acceptance. Matrix JSON and readable views updated individually; historical results retained.

Demonstrated corrections: CSRF missing required header is400 before the CSRF comparison; the forged valid-format token is403. Rate limiting can precede per-challenge exhaustion; tests now verify the actual stronger denial instead of requiring an unreachable state. Independent test ingress dimensions replaced shared synthetic buckets. Expiry fixtures age issued_at before expires_at to preserve constraints. IPC now correlates replies and allows actual concurrent identity connections. Native negative failures remain visible in ATTEMPT_1/2/3.json, never relabeled PASS. Proof-bearing request SHA fingerprints were replaced by private domain-separated HMAC without SQL/ACL changes.

No pending SQL/ACL blocker for the next authorized code/test work. Next B1 vertical: recovery/reset, using approved SQL07 and existing trusted-proof/custody boundaries. Trusted device and AUTHZ follow only after that vertical passes. Operational custodians/infrastructure and actual authenticator-app compatibility remain separate B1 obligations; not silently accepted here.

Reproduce on a fresh isolated runner: npm ci --ignore-scripts; npm run lint; npm run typecheck; npm run test:b1; npm run build; npx playwright install --with-deps chromium; python3 scripts/pg-email-browser.py. Last executed noDB CI:188 B1 PASS, Vitest13 PASS/3 separate DB SKIP, build and57 fixture Chromium PASS. These fixture tests are not counted as real PostgreSQL flows.
