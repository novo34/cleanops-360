# PG-TEST-01-PATCH-01 — REVIEW ONLY, new execution authorization required

Real PostgreSQL16 compilation of exact V4 a06dc23cbc889382b30924a1edc4cead66eeb3e0 fails:
SQLSTATE42601, syntax error at end of input, auth_api.issue_active_session body line9
(canonical file lines387–388). Bare CASE operands in the PL/pgSQL IF conflict with its
THEN terminator. Candidate adds parentheses around each CASE only; both comparisons
and every branch/value remain unchanged. Not installed or PostgreSQL-validated.

B1-X and D1 original files also contain an unconditional REVIEW_ONLY exception.
It has not been bypassed or observed as an executed failure because V4 rolled back first.
Candidate copies remove only that exact DO block so a future explicitly authorized
execution can reach the already-reviewed definitions. No other body, schema, ACL,
parameter, approval or runtime flag is altered. Frozen originals remain intact.

manifest.json pins all source and candidate Git blobs. Candidate D1 still uses the
unchanged approved matrix blob50590047d35467b2473945731384ae3da5729f28.
These copies are proposals, not replacements selected by the current harness.
Current harness still accepts/submits ONLY the original four authorized hashes.

Requested next authorization: PG-TEST-01-PATCH-01, permit exactly these three derived
blobs to replace the originals ONLY in the same new ephemeral PG16 test boundary;
retain original matrix, synthetic fixtures, no public ports/volumes, no real keys/mail,
no staging/deployment/backend activation/merge. Review/additional failures still block
acceptance; this request does not approve arbitrary SQL fixes or relax RLS.

B1 and AUTH-GATE-05 OPEN. All blocked RLS/ACL/concurrency/CAS/COMMIT/restore obligations
remain within E2/PG-TEST-01; they are not waived or moved to another phase.
