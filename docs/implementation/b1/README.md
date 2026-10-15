# CleanOps 360 — B1 implementation contracts

## Source package (V4)

- Canonical package name: `cleanops-auth-review-v4.zip`
- SHA-256: `387ee8865f171d5989b1eae07c2abdbd2c91205622b258cdc25a68a8da13f010`
- Package generated: 2026-10-15 (UTC)
- Authorized branch: `feat/b1-auth-rbac-rls`
- Authorization and constraints: GitHub PR #5, comment 6198116976 (verify full text before work).
- **Publication status: NOT COMPLETE.** This README is an index only. The V4 contracts have NOT yet been committed to the repository and must NOT be represented as repository-available.

## Required action

Obtain the original V4 ZIP from the owner (ChatGPT Library attachment named above); verify SHA-256, extract and commit its authoritative contract files under `docs/implementation/b1/v4/`. Keep `sources/` archival/reference files separate from normative current documents; avoid overwriting `docs/` or `AGENTS.md`. Preserve filename, internal relative references, and provenance. Do not infer contract details from this README alone. Verify V4 manifests and validation files before proceeding.

## Expected V4 files

`FINAL_DECISIONS.md`, `HTTP_CONTRACT.md`, `IMPLEMENTATION_SLICE.md`, `POSTGRESQL_RLS.md`, `README.md`, `SECURITY_VALUES.md`, `SESSION_REVOCATION_CONTRACT.md`, `artifact-manifest.json`, `b1-review-only.sql`, `block-1-grants-functional-approved.csv`, `block-1-role-projection.csv`, `block-1-test-cases.yaml`, `block-1.openapi.yaml`, `build_contract.py`, `owner-instruction.json`, `security-values.csv`, `security-values.yaml`, `sql-inventory.json`, `static-tests.log`, `validate_package.py`, `validation-report.json`, plus `baseline-v3/`, `sources/`, and `V3_TO_V4.diff`.

## Safety gates

Publishing reference documents does NOT authorize execution of SQL or migration, PostgreSQL role/grant changes, production identities, deployments, merging, or declaring AUTH-GATE-05 passed. Consult exact human-approved decisions, never infer grants from candidate matrices. No silent normative changes.

## Agent workflow

Before implementation: read this index, verify V4 contract files actually exist in Git, verify manifest consistency, check the authorized branch/head, and report blockers accurately. If V4 files are absent, request the ZIP and do not implement guessed security behavior.
