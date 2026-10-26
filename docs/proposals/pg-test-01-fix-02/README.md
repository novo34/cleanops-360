# PG-TEST-01-PATCH-02 — REVIEW ONLY; installation NOT authorized

Source: PATCH-01 execution head 4b9a021ae61060d9c102a32a0992319bd7e67da0,
[real PG16 run 39007099487](https://github.com/novo34/cleanops-360/actions/runs/39007099487).

## Demonstrated failure

V4 PATCH-01 installed successfully. B1-X failed with SQLSTATE 42601:
`auth_api.totp_material_locked(text,uuid,text)`, body line 27,
candidate file line 238, `m.state<>CASE ... END`.
The parser points at the CASE operand in a PL/pgSQL IF, as in the previous V4 failure.
D1 was not submitted because its dependency failed. PostgreSQL rolled back the B1-X
transaction; no replacement definitions or privileges were forced into the database.

## Exact proposed deltas

The three files and Git/SHA-256 hashes are pinned in manifest.json.
All are unexecuted proposals; originals AND PATCH-01 copies remain unchanged.

1. b1-x.syntax-only.review.sql: adds parentheses to that one CASE operand only.
   Retains terminal ROLLBACK, so it is NOT a persistent installation candidate.
2. b1-x.persist.review.sql: the same one expression fix, plus final ROLLBACK -> COMMIT.
3. d1.persist.review.sql: final ROLLBACK -> COMMIT only.

The persistence change is an explicit NEW execution decision. The approved PATCH-01
copies retained proposal transaction guards, so even successful compilation would
discard their definitions. This was source-audited, NOT observed as a successful
B1-X/D1 execution (B1-X failed earlier). No body/predicate/signature/ACL is otherwise
changed; all D1 broker-only grants remain exactly those in the approved D1 blob/matrix.

## Specific next authorization

Approve PG-TEST-01-PATCH-02 installation of ONLY the two *.persist.review.sql blobs
pinned in this manifest, after the unchanged V4 PATCH-01 blob
e93f62529de79bc53377bdd1bd309203ed81bb46, with unchanged D1 matrix
50590047d35467b2473945731384ae3da5729f28. Boundary remains new isolated ephemeral
PG16 Docker, synthetic data, no public ports/shared volumes/real services.
No extra SQL changes, production activation, mail, deployment or merge.
The syntax-only alternative is for reviewing the independent compilation delta.

Until that authorization, the harness selects ONLY PATCH-01 bytes and verifies them.
These new candidates have NOT been PostgreSQL-compiled or installed. Future defects
still require separate versioned review and approval, never an automatic patch loop.
CAS/MFA/session/isolation acceptance remains blocked, not waived.

B1 and AUTH-GATE-05 OPEN; closedBackend remains connected.

