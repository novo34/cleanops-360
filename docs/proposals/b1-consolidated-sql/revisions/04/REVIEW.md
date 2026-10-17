# Consolidated 04 — explicit minimal ACL change, REVIEW ONLY

Parent 03 installs cleanly. Its final real test run has 253 PASS and one permission failure in `auth_api.gc_ephemeral()`; see `docs/implementation/b1/consolidated-test-03/RESULT.md`.

One new statement: `GRANT SELECT(expires_at) ON identity_private.security_log TO cleanops_auth_broker;` immediately after the existing DELETE grant. This supplies the read privilege required by the existing expiration predicate; no predicate is weakened or retention changed. The maintenance caller still has only its approved API EXECUTE and no table access. Broker remains NOLOGIN/NOBYPASSRLS with no service membership. No SELECT on other log columns is added.

The full artifact is generated from the unchanged four pinned sources; originals and revisions 01–03 are preserved. `APPROVED_TO_04.diff` and `static-review.json` prove exactly one added ACL statement and zero body/signature/policy/schema changes. `dependency-inventory.json` covers all 73 declarations/65 final definitions and qualified references, with explicit lexical limitations. The SQL-16 parser is a preventive CI gate for both approved 03 and proposed 04; it does not install or authorize 04.

Reproduce static checks with `python3 scripts/consolidate-b1-sql.py --revision 04 --check`, `python3 scripts/review-b1-maintenance-acl.py --check`, and `python3 scripts/parse-b1-sql.py docs/proposals/b1-consolidated-sql/revisions/04/schema.review.sql` (pglast 6.2).

Required authorization: exact blob/SHA-256 in `manifest.json`, including this column ACL, only NEW isolated PG16/synthetic execution. On approval: verify no service or PUBLIC table grant, broker SELECT(expires_at) true and SELECT on all other log columns false, native GC success, then repeat the full mandatory battery. No SQL/ACL change has been installed during preparation. No activation/deployment/merge or D2/D3/D4 completion is authorized or inferred. B1/AUTH-GATE-05 OPEN; closedBackend.
