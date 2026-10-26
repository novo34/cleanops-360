# H1-H3 — limited owner approval and canonical HTTP addendum

Owner explicitly approved H1, H2 and H3 in this PR work session for HTTP publication,
TypeScript implementation and simulated/no-PostgreSQL tests ONLY.
Source HEAD: 442f06d791e7955bf3a3e4a9713bbe23c4facbee.
Verified proposal patch blob: 4e6f3e51fde77f6e454e5756bbaaa3dedf85d583.
Verified derived OpenAPI base blob: 9860177ab7fb665a237a16f8ff9e2c07b7417616.
The five patch targets were checked against the base before application.

Canonical publication is additive: h1-h3-totp-selection.openapi-patch.json is the exact
approved patch. Original block-1.openapi.yaml, HTTP_CONTRACT.md, manifest and historical
proposal remain unchanged. Effective HTTP contract = original V4 plus this addendum;
lib/b1/openapi.json publishes that exact derived result. Only login/startStepUp success
data unions change; one selectTotpMethod POST and two schemas are added.
AuthResult and all other original operations/schemas remain unchanged.

Owner conditions: explicit opaque UUID after credentials/ACTIVE session/context authority;
PREAUTH/CSRF/owned idempotency/rate/cooldown/audit; duplicate/foreign/revoked/invalid/stale
selection rejection; configurable validated eligible-method bound without production
default; safe output; transaction/COMMIT guarantees.
Implementation choices: only the selector endpoint uses strict duplicate JSON-key rejection;
ACTIVE requires grant/resource and PREAUTH forbids them, both using current D1 locks.
maxEligibleTotpMethods is private explicit configuration with no default; response budget
bounds validation. It is not a backend activation flag. Synthetic limits in tests are not
production policy.

No SQL/PostgreSQL/DDL/migrations/grants/seeds/deployment/merge/runtime activation approved.
closedBackend, EMAIL closed, D2/D3-dependent enrollment closed, AUTH-GATE-05 OPEN.
This record supersedes only H1-H3 pending status in the historical REVIEW.md.
