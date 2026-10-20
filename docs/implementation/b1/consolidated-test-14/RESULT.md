# SQL14 — exact authorized isolated validation

SQL14 PASS. SEC021 ACCEPTED in isolated functional scope. B1 42/44; B1 and
AUTH-GATE-05 OPEN; runtime remains closedBackend. No successor module opened.

Exact blob1971a9fdc5c1f3fd1fcb5f6706459678e5399256, SHA-256
965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa.
Full authorized SQL13 diff and ACL are reproduced by the generator before each
installation. No additional SQL, ACL, privileges or runtime switches were installed.
Historical review manifests and originals remain intact; current approval is
AUTHORIZATION.json and actual case provenance is VALIDATION_PLAN.json.

## Actual results

-20/20 native cases and8/8 additional required scenario groups PASS.
-26 distinct directed Chromium cases PASS:10 multi-role cases,6 expiry/non-extension
 cases,8 AUTHZ and2 ACTIVE-company-switch regression cases.
-Real12h/30min sensitive and24h/8h operational profiles; both assignment orders,
 unknown-role fail-closed, server authority, revocation, expiry, actual policy-row
 waits, counter CAS, failed COMMIT and lost successful-COMMIT acknowledgement.
-Ordinary service roles cannot SELECT/write the catalogue, invoke its private
 helper or assume broker; owner/search_path/PUBLIC/forced-RLS checks PASS.
-Real32-table backup/restore and owned-resource cleanup PASS. Preexisting container,
 network and volume inventories unchanged in every recorded run.
-822 PASS check executions across the five evidence batteries, including repeated
 installation/catalogue guards;144 distinct names. These counts are not additional
 accepted requirements. There were27 browser executions:26 PASS and the initial
 unknown-role harness failure, which is preserved and resolved by a directed retry.

Raw reports and immutable source/run/job links: SUMMARY.json. Composite evidence
contains only individually traced PASS checks, never converts the initial failed
batch into PASS. EXECUTION_BROWSER_INITIAL.json remains FAIL. Its one failed browser
case is superseded by the same named PASS in EXECUTION_BROWSER_RETRY.json; nine
independent PASS cases are retained without unnecessarily rerunning them.

## Harness defects corrected without SQL/security changes

ATTEMPT_01_HARNESS.json used the inherited31-table probe despite SQL14 adding the
32nd table; actual installation had succeeded. ATTEMPT_02_HARNESS.json encountered a
synthetic tx_context/session cleanup FK ordering problem. ATTEMPT_03_HARNESS.json
passed non-UUID metadata into the prepared UUID validator and ran metadata inspection
from deliberately schema-restricted service roles. The fixes correct count/order,
whitelist the five UUID fields and inspect ACL administratively while retaining
ordinary-role negative calls. No extra permissions were granted.

The first browser batch expected503 for unknown risk, although the existing SQL
AUTH_INVALID broker mapping is401. After correcting that expectation, attempts02/03
reproduced a harness body-reading race: the real UI intentionally aborts its fetch
on401 in clearCeremony. The final test observes UI401 and no security UI, then uses
a separate actual browser fetch to assert safe401/AUTH_INVALID, empty details and
zero persisted ACTIVE sessions. It leaves the safe UI cancellation unchanged.

## Reproduction

Use a new authorized runner with Docker, Node24 and the lockfile dependencies.
No local Docker socket change or preexisting resource mutation is necessary.

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm run test:b1
npm run build
npx playwright install --with-deps chromium
B1_SQL14_GROUP=native python3 scripts/pg-consolidated-14.py
B1_SQL14_GROUP=browser python3 scripts/pg-consolidated-14.py
B1_SQL14_GROUP=policy python3 scripts/pg-consolidated-14.py
B1_SQL14_GROUP=regression python3 scripts/pg-consolidated-14.py
```

Each invocation creates and removes its own network-none PG16 Docker, with no
public ports or shared volumes; only the exact authorized artifact is installed.
The final one-case retry additionally set
`B1_SQL14_BROWSER_GREP='unknown active role'`. Synthetic fixture administration is
not functional privilege: all actual handler/broker calls use ordinary service
identities. Native VERIFIED-PREAUTH setup is not represented as a UI MFA proof.

## Remaining obligations

The isolated functional core has42 individually evidenced accepted criteria. This
is not integral44-row B1 closure. PR006 still requires actual designated Swiss
OpenBao infrastructure/custodians, real workload/custody lifecycle and rotation/
recovery evidence, independent review and the complete manual PO demonstration.
PR007 requires the Product Owner's actual formal phase acceptance. No identities,
providers, operating evidence or manual results have been invented. Execution plan:
../operational-acceptance/PLAN.md; blank manual dossier/record remain prepared only.
No production, deployment, merge, external SMTP or real infrastructure was activated.
