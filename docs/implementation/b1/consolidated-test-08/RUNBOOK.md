# Authorized SQL08 isolated execution

Only SQL08 blob a585147fa19452de0f28d9c1d7542b3d77b058f7, SHA-256 566777536442e5ebe40a0fe7022eceb412c6089c23dfb9094611f934006780a2 is installed. AUTHORIZATION.json records the owner decision; the original proposal/request is retained historically. SQL09, even if present in the checkout, is never selected by this runner.

Fresh GitHub Actions ubuntu runner, Node24, official PostgreSQL16 Docker image resolved to its immutable digest. The existing transport verifies the four historical blobs, exact08 bytes, deterministic complete diff/ACL and check_function_bodies=on before installation. Only synthetic fixtures use the bootstrap superuser; functional tests connect through separated NOSUPERUSER/NOBYPASSRLS service logins. No grant repair, SET ROLE broker, disabled RLS, real SMTP or production custody substitutes.

Reproduction in a fresh runner:

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm run test:b1
npm test
npm run build
npx playwright install --with-deps chromium
python3 scripts/consolidate-b1-reset.py --check
python3 scripts/pg-consolidated-08.py
```

The runner alone creates one uniquely labeled container: --network=none, no exposed ports, no bind mounts or shared volumes, tmpfs database and temporary directories. Test assets are copied into that owned container; PostgreSQL uses its local Unix socket. The Chromium bridge is loopback/test-only and runs the existing real UI/private HTTP handler/service-role adapter. No page.route, fabricated HTTP result or injected authentication cookie. Only external custody/attestation/delivery dependencies use disclosed synthetic fixtures.

Native coverage: exact ACL/owner/RLS and denied service SELECT/INSERT/DELETE/role assumptions; authorized recovery vs password-only independent browser; wrong-user/wrong-tenant enrollment arguments; revoked/forged/expired PREAUTH; consumed proof/concurrency; durable binding after abandonment/GC; reset-material projection and PASSWORD vs MFA_RESET proof separation; native reader+CAS in one transaction. The reader/CAS fixture intentionally uses synthetic PHC strings and is not claimed to implement password-reset UI or policy.

Browser coverage: recovery rotation, new TOTP first proof before ACTIVE, invalid proof, real terminated-connection COMMIT rollback and bound retry, concurrent recovery and concurrent first-factor confirmations, abandonment and denied password restart; EMAIL and existing TOTP/session/step-up/revocation/logout regressions. Final acceptance must cite the actual successful source/run, not a later documentation commit.

Backup/restore compares fingerprints of all31 application/private tables. finally removes only the owned label-matching container and compares preexisting container/network/volume inventories. Artifacts contain redacted case names/statuses, SQLSTATEs, phase markers and hashes; no raw Playwright secret-bearing JSON or native diagnostic/proof dumps. Original FAIL attempts remain unchanged.

The raw execution keeps b1RequirementsAccepted=0 because a runner cannot auto-accept requirements. A separate individual evidence assessment updates the44-row matrix. B1/AUTH-GATE-05 remain OPEN, production acceptance false, runtime closedBackend. No deployment, merge, external SMTP or real key infrastructure.
