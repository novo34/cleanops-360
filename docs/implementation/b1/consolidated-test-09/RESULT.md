# SQL09 / password reset — COMPLETE in isolated functional scope

Exact owner-authorized SQL09 only: blob **641886171bc24557ff5f49ae6bc7564036efc6b0**, SHA-256 **660331857de2ea2d1f4c4dfa850361b73f37b807694054b9e0e03acb5d29786a**. Fresh PostgreSQL16 Docker, synthetic data, no ports/shared volumes/network. Original hashes/full08→09 diff verified before installation; one new fixed reset reservation function/EXECUTE, existing bodies/roles/table ACL/RLS intact. No new SQL/ACL installed.

## Executed evidence, not additive test-count accounting

|Evidence|Source / Actions run|Actual result|
|---|---|---|
|BASELINE.json|621dafa698d413cc05a9d1e6990b765cde14a1ea /39113950215|48 native PASS, install/owned/CSRF/role/concurrency/rollback/31-table restore/cleanup|
|ATTEMPT_1.json|523afe1c1708b59ac3e47017e9474dec2981636e /39114377633|61PASS including4 real reset E2E and8 affected recovery regressions|
|RESET_EXECUTION.json|9d3c1643546de4f3af25627725577f4705f3a6f3 /39114838103|64PASS including7 reset/operator E2E and8 recovery regressions|
|FINAL_NEGATIVES.json|32933c028ba2c82a3acc01a29e80a2d00f7dfe55 /39115092825|63PASS,3 directed operator E2E; actual valid foreign-tenant receipt denied, direct service INSERT/DELETE denied and one-time plaintext response forbidden|
|EXECUTION.json|9f73907fdfe506619444201deac6655a54fe4462 /39115439609|67PASS,7 real reset E2E using actual integrity-pinned local corpus admission with synthetic corpus data|
|COMMIT_ACK_LOSS.json|5e3f9c2caf3485538c7242a2233ab736b30d1515 /39115769557|61PASS,1 directed actual committed-reset/acknowledgement-loss E2E|

All listed cases PASS, zero FAIL/BLOCKED/SKIP within these native/browser suites. Counts overlap and must not be summed as distinct tests. After corpus integration only affected reset cases ran; the unchanged8 recovery regressions retain their earlier execution. Full historical253/294 batteries were not rerun or re-credited. All31-table restore fingerprints, cleanup and preexisting Docker resource inventories PASS in each execution. No implementation/SQL defect was found in these SQL09 runs and no extra patch was installed.

## Functionality actually complete

Existing auth panel + actual HTTP/private handler/service-role PostgreSQL now complete password reset with a privately attested receipt and scoped recovery proof, or an independently authorized operator receipt. No client-supplied tenant/user/version/permission becomes authority. Operator path requires ACTIVE, current step-up06, both exact approved SQL RBAC predicates, non-self/correct-tenant target and an independently attested PASSWORD receipt. The operator never chooses/sees the new password. Expired approval or missing RBAC prevents CAS and preserves valid unrelated ACTIVE context.

BOOTSTRAP/CSRF permits only owned reservation. One connection/transaction handles validation, keyed request digest, stable rate limits, local admission, actual Argon2id, credential-version CAS, ticket/proof consumption, required session/PREAUTH/trust revocation, audit and one-time completion. A successful reset clears cookies after COMMIT; it never logs in. Actual old-password denial/new-password login still requiring TOTP and subsequent committed ACTIVE are verified through UI/API/PostgreSQL. Forms use no browser storage or logs for receipts/passwords/proofs. Client schema rejects forged authority and duplicate/unknown keys.

The local admission implementation verifies explicit corpus version/content SHA256/strict format and explicit snapshot bounds, refuses corrupt/missing/unavailable policy, and queries compromised-password hashes locally. Synthetic corpus data is a test dataset, not a production corpus selection. Storage of credentials is actual Argon2id64MiB/3/p1 with unique random salt. No productive operational password/custody/attestation provider is activated.

Real pre-COMMIT backend termination returns503 and rolls back credential version, proof/ticket, revocation and owned marker; retry succeeds. Separately, a real successful COMMIT followed by lost acknowledgement returns503 with no success/session cookie; data stays committed, same reset replay409, and fresh login with new password plus MFA succeeds. No claimed rollback of already committed data, no second reset and no premature credential/session result.

## Acceptance and boundaries

**14/44 accepted** individually in isolated functional scope. New REQ-AUTH-001 is supported by the real changed-credential login flow. REQ-AUTH-040/041/042/043 cite retained actual SQL08 UI session listing/four displayed properties/individual and bulk revocation evidence, whose implementation was unaffected; no artificial hold pending all44. Previous9 accepted rows retained. Exact source/run/case evidence is in closure and E1 JSON/readable matrices. Raw runner b1RequirementsAccepted remains0: requirement acceptance is a separate owner-authorized assessment, not inferred from a PASS count.

Password reset is COMPLETE for the authorized isolated normal/operator flows. Identity attestation and key custody remain explicitly synthetic; no production acceptance is claimed. Administrative MFA reset (REQ-AUTH-034), trusted-device public integration, full AUTHZ/Manage Access and remaining operational controls remain obligations within B1. No functionality is moved to another phase. Next sequential vertical is trusted device over approved functions, then AUTHZ and dependent admin-MFA work.

[Code CI39115769715 SUCCESS](https://github.com/novo34/cleanops-360/actions/runs/39115769715): lint/typecheck/build,38static,198B1 PASS,Vitest13PASS/3 separate DB SKIP,57fixtureChromium PASS. Fixture browser tests are not counted as real PostgreSQL E2E. Runtime closedBackend; B1/AUTH-GATE-05 OPEN. No production, SMTP external, actual infrastructure activation, deployment or merge. Reproduction and scope: RUNBOOK.md and ../recovery/PASSWORD_RESET_HTTP.md.
