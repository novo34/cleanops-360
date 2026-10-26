# SQL09 / reset isolated reproduction

Owner authorization is recorded in AUTHORIZATION.json. Only complete SQL09 blob641886171bc24557ff5f49ae6bc7564036efc6b0, SHA256660331857de2ea2d1f4c4dfa850361b73f37b807694054b9e0e03acb5d29786a may be installed. Original SQL08/four historical blobs, full08→09 diff and exact one-function ACL are verified before creation. No extra SQL/ACL installed, no repair grants or disabled RLS.

Use a fresh isolated Actions ubuntu runner and Node24:

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm run test:b1
npm test
npm run build
npx playwright install --with-deps chromium
python3 scripts/consolidate-b1-bootstrap-reset.py --check
python3 scripts/pg-consolidated-09.py
```

Runner scripts retain the established ownership-label cleanup and official PostgreSQL16 image digest. New Docker only, --network=none, no exposed ports/bind mounts/shared volumes, tmpfs data. Copied Node/library assets use its local PostgreSQL Unix socket. Functional calls use separated non-superuser/non-BYPASS service roles. Bootstrap superuser is restricted to synthetic fixture setup, read-only assertions and terminating the owned test connection for fault injection.

Browser selection is explicit in pg-consolidated-09.py. Full reset config playwright.reset-only-b1.config.ts covers all reset cases. Earlier playwright.reset-b1.config.ts additionally runs the affected recovery regression. Targeted admin and COMMIT configs avoid repeating unrelated histories. The recorded source/run determines which cases actually executed; never attribute another run's tests to a documentation HEAD.

Only external identity attestation/custody use synthetic private adapters. Password admission executes the actual local integrity-pinned checker against synthetic corpus data; Argon2id, CSRF, owned SQL, CAS, API, real UI and PostgreSQL are not mocks. No HTTP fixture endpoint/page.route/injected authentication cookies. Raw secret-bearing Playwright output is captured privately, summarized with statuses/phases/SQLSTATE only and deleted.

All31-table backup/restore fingerprints are compared. finally removes only the unique owned container and compares preexisting container/network/volume inventories. The raw runner keeps b1RequirementsAccepted=0; individual acceptance is separate, exact-case evidence in the44-row matrix. Production activation, SMTP, deployment, merge and closure of B1/AUTH-GATE-05 are not authorized.
