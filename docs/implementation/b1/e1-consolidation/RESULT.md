# Current EMAIL integration: real PASS; B1 OPEN4/44

EMAIL evidence: ../email/EXECUTION.json, sourceef27ca0a53dce659bd4598c60e4269b187348793, run39107192800. Four independent EMAIL requirements accepted on real UI/API/PostgreSQL evidence. B1 and AUTH-GATE-05 remain OPEN; no production acceptance or runtime activation.

## Prior SQL07 evidence (historical counters retained)

# Current EMAIL integration: real PASS; B1 OPEN4/44

EMAIL evidence: ../email/EXECUTION.json, sourceb54d7562f1b9326d2acfadd6d8a707b9f0e4a226, run39106575063. Four independent EMAIL requirements accepted on real UI/API/PostgreSQL evidence. B1 and AUTH-GATE-05 remain OPEN; no production acceptance or runtime activation.

## Prior SQL07 evidence (historical counters retained)

# Current SQL07 result: native PASS; full B1 OPEN

Exact owner-authorized07 installed:253 PASS/0 FAIL; cleanup and existing-resource inventory PASS. Source59855dd719712b80f11d953558cf6ba956af45f4, run39102962461. Full evidence and limitations: [SQL07 result](../consolidated-test-07/RESULT.md). B1 remains0/44 accepted, closedBackend unchanged and AUTH-GATE-05 OPEN. New public UI/API full integration remains pending.

## Historical06 result (superseded native status, retained evidence)

# B1 E1 — installation PASS, native focused suite FAIL, B1 OPEN

Base f209054b5613abb036c4f72391385bc2db339930. All five E1 decisions retained.
No other module, production, SMTP external, deployment, merge or runtime activation.
closedBackend and AUTH-GATE-05 OPEN; **0/44 complete accepted**. MATRIX.md/REQUIREMENTS.json
preserve individual prior and current evidence. Technical isolated acceptance and
production authorization remain separate; neither inferred from test counts.

## Actual native execution

Exact06blob939a521911e34296e055eb05c57264cbeee6d785, SHA256
aade4ed7aeb065899c086f0ee02e11aef024d2cb84f2d9e4a13155a273ab0962,
explicit owner approval in AUTHORIZATION.json. Originals/four historical pins verified.

- First run39101337533/source8db9af3: installation PASS,178PASS/5FAIL; ATTEMPT_1.json.
- Expanded run39101669219/source496ad213fbc72173edc076ca2dbdcd74355fda09:
  installation PASS, **210PASS/19FAIL**,95final functions/44policies/30forced-RLS tables.
  Individual unaltered outcomes in EXECUTION_PG06.json. Not full B1 UI acceptance.
- Both cleanups PASS; preexisting container/network/volume inventories equal. Only new
  networkless PG16Docker, no public ports/binds/shared volumes, synthetic data. All30
  tables backup/restore equality PASS. No approved294baseline reexecution/recredit.

Private PG successes: verified EMAIL enrollment/first-code/invalid/replay/session,
AEAD worker delivery/quarantine, actual claim-COMMIT failure/no send, concurrent one-send,
finish-COMMIT loss/no retry, EMAIL step-up, credential CAS, trusted-device registration/
expiry/list/admin revocation, privileged MFA reset with separate proof, PREAUTH tenant
rotation preserving verified credential deadline. Real service logins, no superuser
functional calls. Verifier/transport are synthetic dependencies, not productive services.

## Five product root causes, not19independent bugs

1. GC changes expired QUARANTINED to CANCELLED (observed real state).
2. Pending EMAIL GC writes TOTP-only cipher/key markers; mfa_methods_check23514.
3. Policy mutation lacks broker UPDATE(version);42501, dependent roles not created.
4. Password reset lacks broker UPDATE(credential_version);42501, dependent expected-v2
   recovery setup cannot proceed.
5. ACTIVE policy concurrency40P01: context FK KEY SHARE/session FOR UPDATE/principal
   lock inversion. Reciprocal administrative locking also needs contention protection.

Harness findings retained: three first-run false ACL expectations used regprocedure
name lookup in a schema correctly inaccessible to services. OID privilege lookup fixes
those tests; all deny cases pass in expanded run. One expanded stale-policy assertion
ran after credential CAS invalidated its session:42501 was correct, expected false was
wrong. Future test moved before CAS with stale version0. Raw FAIL preserved. No extra
privileges or altered SQL were installed to obtain PASS.

## Code and uninstalled correction

Private mail-worker.ts and concrete mail-dispatch-store.ts reuse the existing PG unit
of work; parameterized calls, no tables/SET ROLE/fallback. Strict material parsing,
redacted artifacts, AEAD/AAD, stable provider key, expiry checks, UNKNOWN/UNCONFIRMED
without blind retry, owned-buffer clearing. Not imported by runtime. Tests include six
independent RFC6238 SHA256 vectors/canonical6digits and provisioning round-trip. Actual
external authenticator applications remain NOT VERIFIED.

SQL07 is ONE complete fresh-install REVIEW ONLY candidate, not installed:
blob099345e43c03a2ee3759fa0c2d5ef875121621fc, SHA256
4c304916a76a700e37a069c947426874d73dace0016f3d2a5d3504ce9ba05456.
Full diff/hashes/30new function ACL inventory/security rationale/request in07/.
It addresses GC by state/kind, proposes precisely two broker column grants, replaces
all5session locks with FK-compatible NO KEY UPDATE (writes/deletes still excluded),
and introduces a private NOWAIT principal-pair helper. Existing public signatures
unchanged. No silent modification of approved06, V4, B1-X or D1. New approval required.

Sourceb9bb6af3e845f96595f4bdf7ff217fc6e4aea5dc:
[noDB CI39102039442 SUCCESS](https://github.com/novo34/cleanops-360/actions/runs/39102039442)
(lint,typecheck,182B1 PASS,Vitest13PASS/3 separate DB SKIP,build,57fixtureChromium PASS).
[offline CI39102039439 SUCCESS](https://github.com/novo34/cleanops-360/actions/runs/39102039439):
12static regressions, PG16 grammar103declarations06/104declarations07, errors=[]. Native
07 compilation/permission/concurrency/restore NOT executed; no native PASS inferred.

## Remaining within B1

Exact07 native validation; complete EMAIL/recovery/reset/trusted-device/AUTHZ HTTP/UI
integration and corresponding real product E2E; external-app compatibility evidence;
actual Swiss OpenBao custodian/hosts/workload identities/recovery ownership and real
mailbox/identity-proof custodian/procedure, controlled sender route/quarantine retention.
No approved architecture decision reopened. Full B1 closure remains unachieved.
