# PATCH-01 authorized execution record

Owner authorization PG-TEST-01-PATCH-01 applies to source HEAD
66f97ea2bf7eaf49dd915b956879547753b496f1. PATCH_01_AUTHORIZATION.json pins the four
original Git blobs via the source/candidate map and matrix, the exact proposal manifest
SHA-256, and all three derived candidates. SHA-256 values were computed from those
byte-verified blobs; no independent owner-supplied SHA-256 is claimed.

The historical proposal README/manifest and original failed execution-report.json are
preserved as historical snapshots, not current execution authorization. The new
authorization record supersedes their execution prohibition ONLY for the named
PATCH-01 candidates in the isolated PG-TEST-01 scope. Known unconditional REVIEW_ONLY
guard removals in B1-X/D1 were disclosed in that named package; no extra change is inferred.

## Reproduction

On a fresh disposable Linux Actions runner with Docker available:
`python3 -m py_compile scripts/pg-test-01.py`
then `python3 scripts/pg-test-01.py`.
No existing database endpoint is accepted. The workflow clears DATABASE_URL and
CLEANOPS_TEST_DATABASE_URL. Exact Docker/psql commands are in the harness; commands
containing generated synthetic passwords are deliberately not logged.

The harness verifies originals, manifest, SHA-256 and full candidate transformations
BEFORE Docker. It pulls official postgres:16-alpine, resolves/pins RepoDigest, creates
one UUID-labelled --network=none container with tmpfs only, no published ports/binds/
volumes. All DBs and synthetic roles are inside that container. After success/failure
it deletes ONLY its own labelled container, compares container/network/volume ID sets,
and writes artifacts/pg-test-01/report.json. No pruning/chmod/daemon restart or
preexisting-resource mutation is used. Runner image cache may contain the pulled image;
it is disposable and no preexisting image is removed.

## Initial real result

Run 39007099487 on 4b9a021: 126 PASS, 11 FAIL, 8 BLOCKED; cleanup PASS.
patch-01-first-run.json preserves that exact report and provenance.
V4 installed; B1-X failed 42601 in totp_material_locked; D1 blocked.
Roles/direct-table denial checks, RLS FORCE flags, row lock timeout, rollback,
server-terminated COMMIT attempt, pg_dump/restore and restored session-state/RLS passed.

Limitations: RLS flags/direct-access denial are NOT proof of successful tenant-bound
broker operations. Those operations failed 42501. A failed revocation cannot establish
revoked-token or success-audit behavior. CAS/MFA/D1 tests remain blocked.
Terminated-before-COMMIT is not committed-but-response-lost coverage.
Backup restore compares the actual snapshot, not an assumed successful revocation.

## Harness correction and targeted diagnosis

The initial blanket assertion erroneously required SECURITY DEFINER for
identity_private.reject_tenant_change(), which canonical V4 intentionally defines
SECURITY INVOKER. The corrected check preserves exact broker ownership, fixed search_path,
no PUBLIC EXECUTE for ALL functions, requires definer for every other function,
and asserts that this one trigger stays invoker. No SQL contract was changed.
Follow-up diagnosis captures only the fixed broker error message/SQLSTATE and UPDATE
privilege availability; no tokens, credentials, ciphertext or generated passwords.

Revoked-token/success-audit assertions become BLOCKED when revocation failed, rather than
mislabeling missing prerequisite effects as independent defects.
A diagnostic rerun uses EXACTLY the same authorized SQL bytes; no PATCH-02 installed.
Full acceptance remains FAIL until every mandatory real scenario passes.
New SQL candidates and the precise approval request are in docs/proposals/pg-test-01-fix-02/.

B1 OPEN; AUTH-GATE-05 OPEN; runtime closedBackend; no external SMTP/real keys/merge/deployment.

