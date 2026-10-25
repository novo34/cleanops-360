# PG-TEST-01-CONSOLIDATED-03

Owner approval is bound to original source HEAD `433a5081bff2f7642a989b670a3e2b79e956dbeb`, blob `7290c09ab32b74fecc4c39dc5d91a3bbc7f2723e`, SHA-256 `07e6637d1d39b50962bc2a034416f8e43bdbb0ec775234a20d12998bf58ec779`. `AUTHORIZATION.json` records the limited test authorization; historical proposal metadata remains historical.

## Reproduction

On a NEW disposable GitHub runner with Docker (never a shared/production host):

```sh
python3 -m pip install pglast==6.2
python3 scripts/consolidate-b1-sql.py --revision 03 --check
python3 scripts/review-b1-case-operands.py --check
python3 scripts/parse-b1-sql.py
python3 -m unittest discover -s tests/static -v
python3 scripts/pg-consolidated-03.py
```

The harness creates exactly one labelled PG16 container, network `none`, tmpfs PGDATA, no published ports or bound/shared volumes, local-only service LOGINs, random synthetic credentials. Installation receives the **exact file bytes once**, with native `check_function_bodies=on` and verbose SQLSTATE diagnostics. No candidate is rewritten in memory or installed with supplementary ACL. Source/diff/ACL/hash checks run before Docker SQL.

The temporary service LOGINs inherit only the existing authorized technical roles; these mappings are test fixtures, not deployment grants. Administrator SQL is restricted to installation, fixture setup/lifecycle transitions, catalog/state assertions, owned-backend termination and backup/restore. Broker business calls execute as the matching non-superuser service LOGIN. No production runtime, SMTP service, real key or user data is used. `closedBackend` stays connected.

## Preventive compilation validation

`parse-b1-sql.py` uses libpg_query PostgreSQL 16.1 grammar through pinned pglast 6.2. It parses the entire SQL and all 73 function declarations, including overwritten definitions, collecting every grammar error. SQL-language bodies are parsed separately. It does not execute SQL, install anything or resolve catalog permissions/types/dynamic queries.

The library mishandles bare `RETURN NEXT;` with RETURNS TABLE OUT parameters. The diagnostic includes an explicit parser-only `RETURN NEXT NULL;` placeholder for this case, reparses the rest of the body, and records the adaptation. **This altered text is never submitted to PostgreSQL.** Native installation already compiled the untouched function. A regression test confirms other syntax errors in an OUT-parameter body still fail. Historical candidate 02 must still be rejected by the parser. Static success never replaces native CREATE validation or runtime execution.

Installation exercises the approved dynamic DO loops for ownership, RLS policies, triggers and function ACL. Catalog inventory confirms the persisted 65 functions, zero procedures, 12 noninternal triggers and 33 policies. Typed-NULL rollback probes exercise each exposed API through its granted service account; expected business rejection is distinguished from unexpected grammar/dependency/permission errors. These probes are **not positive-flow acceptance or exhaustive branch coverage**. Private unexposed APIs remain inaccessible; no test grants are added to reach them.

## Functional scenarios and limits

The protocol suite exercises credentials CAS contention, stale versions, verified PREAUTH, TOTP method selection, cooldown, global counter race, session issuance and replay, transactional owned reservations, step-up, assigned-ID enrolment/CAS/recovery batch, synthetic EMAIL outbox/worker claim/finish/OTP consumption, CSRF, revocation/expiry/generation, tenant state, functional rollback and service-COMMIT failure. Legacy checks add separated-role ACL, forced RLS, trusted contexts, two tenants, row-lock timeout, session revocation/audit and PG dump/restore.

Cooldown is **waited in real time** (two approved 60-second intervals); no control or timestamp is weakened to create competing challenges. Lifecycle negative fixtures explicitly change credential/tenant/method states and restore shared baseline fixture states where required. No feature is activated by these fixtures.

Opaque Argon2id strings and v2 ciphertext fixtures test SQL attestation/CAS, not real crypto, key custody, decryptability or D2/D3 approval. EMAIL worker tests mark a synthetic local event delivered without network I/O; they do not establish D4 or recipient-verification acceptance. Backup/restore is into a second database in the same owned disposable cluster, not operational key/disaster recovery. COMMIT failures terminate only an owned transaction and verify no effects, not committed-but-response-lost behavior.

B1 requirement acceptance remains separately measured at **0/44 real end-to-end accepted rows** until its complete UI/backend/crypto/operational/E2E/owner criteria are evidenced. SQL-test PASS alone cannot close B1 or AUTH-GATE-05.

## Bounded execution history

- Attempt 1, source `3358f725e030d12b54aaeb20d808c99493d52561`, run `39045804380`: native install PASS; 160 PASS / 4 FAIL / 2 BLOCKED. Harness attempted challenges inside cooldown and expected text `false` for boolean output `f`. Parser had the documented OUT-parameter limitation. Preserved in `ATTEMPT_1.json`.
- Attempt 2, source `9ec5e63bfd93bd51a75b13feb49566e3d01c7a04`, run `39046226513`: native install PASS; 173 PASS / 1 FAIL / 0 BLOCKED. Protocols succeeded; old session-count expectation did not account for the actual newly issued session. Preserved in `ATTEMPT_2.json`.
- Subsequent evidence identifies its exact source/run. No SQL bytes or ACL were changed between these executions. Each run owns and removes its own container, checks before/after container/network/volume inventories, and uploads only redacted report/parser JSON.

No approval is requested to repeat an unchanged authorized SQL candidate after fixing test-only defects. Any real SQL/ACL/security-contract correction requires a new whole REVIEW ONLY artifact and specific authorization before installation.
