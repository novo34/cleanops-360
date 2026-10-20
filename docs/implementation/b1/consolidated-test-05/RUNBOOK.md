# Authorized CONSOLIDATED-05 — isolated reproduction

Authorization: owner message PG-TEST-01-CONSOLIDATED-05, reference `ef386d985d8a1c3331d7dd2d4cdf66468bf6f3d5`, exact SQL blob `62cec23e534fe15888ddba98cf76add7e857cfef`, SHA-256 `3f3c22e0bbdd5798806ed0810b1710fb2d55c34994cb5087652d4ce683d0258c`. AUTHORIZATION.json records the grant; historical proposal files stay intact. No later SQL/ACL change is authorized or installed.

Run only on a NEW disposable runner with Docker and Node24:

```sh
npm ci --ignore-scripts
python3 -m pip install pglast==6.2
python3 scripts/consolidate-b1-sql.py --revision 05 --check
python3 scripts/review-b1-restricted-purge.py --check
python3 scripts/parse-b1-sql.py docs/proposals/b1-consolidated-sql/revisions/05/schema.review.sql
python3 scripts/pg-consolidated-05.py
```

The wrapper reuses the labelled, bounded legacy Docker transport and real protocol scenarios. Only image selection changes to official `postgres:16-bookworm`, resolved to a digest before launch, so the copied Linux Node binary/native Argon2 dependency can run. One new container, network none, PGDATA/tmp tmpfs, no published ports or shared/bound volumes; no changes to preexisting resources. Service LOGINs inherit only the approved technical roles as synthetic fixtures. The SQL submitted to PostgreSQL is the **exact full approved file**, once, with `check_function_bodies=on`. No appended ACL, disabled RLS, substitute definitions or roles granted to make tests pass.

Functional SQL/HTTP uses non-superuser service accounts. Administrator use is limited to installation, explicit synthetic fixtures/lifecycle transitions, catalog/persisted-state assertions, owned-backend termination and dump/restore. Privilege negatives may use administrative SET LOCAL ROLE to exercise the actual NOLOGIN broker/purger with their real non-owner/NOBYPASSRLS authority. This is not a superuser functional fallback.

The only expected baseline adaptations are inventory 66 functions/35 policies and **one exact helper ownership exception**: purge_expired_security_log owned by the purger; all existing functions retain broker ownership, with the existing invoker tenant trigger exception. Both exceptions remain individually checked for signature/search_path/ACL. The real protocol issues an extra P session, so its P-session count is exactly three. No failed check is made optional.

## Restricted purge

Catalog and executable negatives verify broker INSERT-only, no column SELECT or DELETE, helper no-args/void/SECURITY DEFINER/search_path, explicit ACL owner+broker only, no purger memberships/LOGIN/super/bypass/schema CREATE/table ownership, correct column-level SELECT and DELETE only. Synthetic two-principal expired/future rows exercise RLS reads, denied payload reads/UPDATE, denied broker SELECT/COUNT/DELETE, denied service helper/SET ROLE, rollback, concurrent maintenance calls, deletion of expired rows and preservation of future rows. All existing 254-check baseline scenarios still run.

## Private HTTP / crypto / real PostgreSQL

`pg05-http-real.ts` is a **test-only composition** of existing createAuthHandler, approved private backend, typed pg broker/pool, actual Argon2id, OTPAuth, and synthetic AES-256-GCM keys. It imports the existing canonical seal/open envelope helpers. It runs inside the same owned container and uses its local PostgreSQL Unix socket: no API listener/forwarded port, browser mock, external service or operative route is installed. The production runtime keeps createAuthHandler(closedBackend, origin).

Fixture administrator queries seed a real salted Argon2id credential and an ACTIVE TOTP method, then inspect persistence. HTTP requests use the identity-service pool exclusively; no administrator pool is passed to backend code. Constructor-only network/device dimensions, labels and method bound are explicit synthetic ingress fixtures, not production defaults. Secret keys are random in-process and wiped after testing; this does not establish D2 custody or D3 app interoperability.

Cases include generic wrong/unknown-password denial without cookies, real password login, malformed TOTP refusal without a session, successful TOTP/committed ACTIVE cookies, current identity and persisted counter, session listing, step-up/bulk revocation preserving current and foreign-tenant sessions, logout and denied subsequent identity access. The next-window TOTP step-up proof exercises the existing approved ±1 **trial** window, not a new production value.

Only redacted names/statuses, HTTP status, broker function name/SQLSTATE and ciphertext byte/line lengths are emitted. No query values, requests/responses, cookies, plaintexts, ciphertext, passwords or keys are logged. Browser UI, framework route wiring and external SMTP are **not executed or inferred** from these private HTTP tests.

## Root cause fixed in TypeScript only

PG encode(bytea,'base64') inserts LF every76 characters. A 61-byte v2 envelope becomes lines76+8. The factor formerly required unwrapped Node canonical base64 and rejected the genuine broker value with503 before decryption. approved-factors.ts now accepts either canonical unwrapped data or the exact PostgreSQL 76-column layout (including a terminal LF only at a complete76-column boundary); all other whitespace remains rejected before decrypt/CAS. AEAD/identity/version/counter checks are unchanged. A regression covers57/61/114-byte values, canonical and PG layouts, and malformed newline/space refusals. No SQL change was necessary. Native attempt3 confirmed lines[76,8] and a complete real HTTP login→TOTP→session flow.

## Recovery and cleanup limits

Baseline dump/restore compares deterministic fingerprints of **all21 tables**, not only sessions, and restored FORCE RLS. A second dump/restore after the HTTP effects compares all21 tables again. Both restores are into new databases in the same owned synthetic cluster; roles already exist. This is not operational cold-cluster/key recovery or RPO/RTO acceptance. Keys are ephemeral test material and not restored from production custody. Every run removes only its labelled owned container and compares pre/post container/network/volume inventories; image-pull cache is the permitted fresh-runner image change.

Prior failed attempts are preserved: transport failure before HTTP in ATTEMPT_1; real TOTP HTTP503 in ATTEMPT_2; 286 PASS with fixed base64 in ATTEMPT_3. Exact final source/run/checks appear in EXECUTION_REPORT.json. No technical PASS auto-accepts a B1 requirement: REQUIREMENTS.json/md assess each of the44 source rows separately; B1 and AUTH-GATE-05 remain OPEN.
