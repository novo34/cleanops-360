# Consolidated 03 — REVIEW ONLY

Parent: authorized consolidated 02; failed PostgreSQL run 39044517403. Full evidence: `docs/implementation/b1/consolidated-test-02/`.

The generator starts from the same four pinned originals and produces one complete SQL file. `APPROVED_TO_03.diff` changes only:

```diff
- OR x.purpose IS DISTINCT FROM CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END
+ OR x.purpose IS DISTINCT FROM (CASE WHEN raw_preauth IS NULL THEN 'STEP_UP' ELSE 'LOGIN' END)
```

No ACL, public signature, security predicate or policy changes. `static-review.json` inventories all 29 CASE sites, including SQL assignments and expressions. The regression scanner covers comparison operators and DISTINCT FROM, across function names, so both prior TOTP declarations and EMAIL consumption are covered. This is a lexical, fixed-source review; not a general PL/pgSQL parser or compilation proof.

Reproduce without a database:

```sh
python3 scripts/consolidate-b1-sql.py --revision 03 --check
python3 scripts/review-b1-case-operands.py --check
python3 -m unittest discover -s tests/static -p 'test_b1_consolidated_review.py'
```

No execution workflow installs 03. Owner approval of its exact blob is required before PostgreSQL validation. B1/AUTH-GATE-05 OPEN; runtime closedBackend.
