# PG-TEST-01-PATCH-01 — final result FAIL

Execution source: f893e65825a1190c213f4661b2815cb57493767c.
[PostgreSQL run 39007287983](https://github.com/novo34/cleanops-360/actions/runs/39007287983).
Machine-readable redacted results: patch-01-final.json.
128 PASS / 8 FAIL / 10 BLOCKED; cleanup PASS. NO mandatory case waived.
The evidence-only follow-up commit does not change the tested harness or installed SQL.

## Verified inputs and actual installation

Source owner HEAD 66f97ea2bf7eaf49dd915b956879547753b496f1 was verified before development.
Original four blobs remain:
V4 a06dc23cbc889382b30924a1edc4cead66eeb3e0;
B1-X 1499e90389b6e7c4d94b1dd17ed35cd4b539d436;
D1 6454a7551e61e5857ef39090b24b93fcbdb03bb1;
D1 ACL 50590047d35467b2473945731384ae3da5729f28.
The authorization record and final report contain exact candidate Git/SHA-256 values
and manifest SHA-256 103fddaec1b91f0171aa6264daa71e129f39e391d601d15cfaaaaa1f8d54aff3.

V4 candidate e93f62529de79bc53377bdd1bd309203ed81bb46 compiled, committed and persisted.
B1-X candidate 4694813e670e88e14bdcb4dad499c5d6098c66cd was submitted unchanged and
failed 42601 in totp_material_locked, body line 27 / candidate line 238.
D1 candidate a84364bb612baecefb7e96c0afb698782621a160 was NOT submitted because
B1-X failed. No D1 ACL was installed independently to force passing tests.

## Executed PostgreSQL checks and limits

| Obligation | Real evidence | Result / remaining |
|---|---|---|
| Exact blobs/hash/full diff | Four originals + manifest/candidate hashes and transformations before Docker | PASS |
| PostgreSQL 16 boundary | Official pinned digest; new labelled network-none container; tmpfs; no bind/volume/ports | PASS |
| SQL installation order | V4 persisted; B1-X atomic compile failure; D1 not attempted | FAIL / BLOCKED |
| Service roles and minimum privilege | Four synthetic LOGIN roles; no SUPER/CREATE/BYPASS/broker membership; SET ROLE denied; CREATE SCHEMA denied; direct SELECT denied on 21 tables each; no DML ACL | PASS |
| SECURITY DEFINER/search_path/PUBLIC ACL | Catalog checks for exact broker ownership, pg_catalog path and PUBLIC exclusion; approved immutable-tenant trigger remains INVOKER | PASS for installed V4; overlays BLOCKED |
| RLS/tenant isolation | 21 ENABLE+FORCE tables, direct access denied, cross-tenant FK denied, forged context denied | Structural/negative PASS; positive A/B bound broker access FAIL 42501 |
| MFA/session/auth/CAS | Identity/list/revoke attempted; missing policy lock privilege produces 42501; D1 owns the existing reviewed fix | FAIL; full transitions/factor CAS/replay and method-version scenarios BLOCKED |
| Concurrency/locks | Independent connection holds session row; service lock timeout 55P03; target stays ACTIVE | PASS for this row-lock case; one-winner credential/TOTP/D1 cases BLOCKED |
| Functional rollback | Explicit ROLLBACK, error 22012 and unchanged state | PASS for installed base transactions; broker-factor/idempotency effects BLOCKED |
| COMMIT failure | Terminate only owned uncommitted backend, attempt COMMIT, verify no effects | PASS for disconnect-before-COMMIT; committed-but-response-lost/retry remains unproved |
| Backup/restore | Real pg_dump custom + pg_restore to second database inside owned container; session-state fingerprint and 21 FORCE-RLS flags preserved | PASS for base DB snapshot; not proof of complete B1 recovery or fresh-cluster key/role recovery |
| Teardown/preservation | Own-label check, remove only own container; existing container/network/volume ID sets unchanged | PASS |

No secrets, keys, real recipients or private production data used. Evidence logs omit
synthetic passwords and token-bearing commands. Actual local checks: Python AST/
py_compile and pinned hash verification; local Docker/SQL was not used.

## Defects and corrections

- Resolved original V4 42601 using ONLY the owner-authorized two CASE parentheses.
- New B1-X 42601 is NOT fixed in an installed contract.
- Both approved overlay candidates still end ROLLBACK. This is a source-proven
  persistence blocker, not claimed as observed successful overlay execution.
- Session failures are exactly `permission denied for table policy_versions`;
  has_any_column_privilege for broker UPDATE is false. D1 already proposes the
  broker-only grant; no additional privilege or workaround was introduced.
- Corrected harness false failure that required the canonical INVOKER trigger to
  be DEFINER. All other owner/path/PUBLIC checks retained. Final check passes.
- Corrected restore assertion to compare actual snapshot, not assume revoke success.
- Revoked-token/success-audit cases explicitly BLOCKED after prerequisite failure.

## Pending execution and next authorization

E2 / PG-TEST-01 remains FAIL. Real auth/MFA/CAS/owned-reservation races, complete
A/B authorization, successful revocation/audit and complete recovery acceptance
remain inside B1. Some mandatory scenarios are explicit unexecuted sentinels, not
implemented-and-passed PostgreSQL cases. Unit/UI checks do not substitute them.

Review docs/proposals/pg-test-01-fix-02/manifest.json + README.md.
Specific next action: owner authorization PG-TEST-01-PATCH-02 for ONLY:
- B1-X persist candidate Git 930c1a1bab7ff4e24ca81ffb8b3bb419941838c0,
  SHA-256 e5e1610d2bebb367021126fb102e5a96538301171e1c739120e91769482d35d2;
- D1 persist candidate Git 2e2770f93a6d607ea96e2aab85c13232866574cd,
  SHA-256 8525d3dac8af82284638032e9514ad3e196b0ff65a8a0775694b2274ca9ca1cb.
Only the one demonstrated B1-X CASE comparison and terminal ROLLBACK-to-COMMIT
decisions differ. No extra signature/predicate/schema/ACL change. These files are
REVIEW ONLY, NOT PostgreSQL-compiled/installed. After authorization, verify exact
hashes again, install in new isolated PG16 in dependency order and resume blocked
mandatory scenarios; investigate any new defect without installing unapproved SQL.

B1 and AUTH-GATE-05 OPEN. closedBackend remains connected. No deployment, shared
staging, production, external SMTP, real keys, merge or operational runtime activation.
