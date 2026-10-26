# H1-H3 TOTP selector — approved contract, uninstalled backend

Limited approval: docs/canonical/auth-review/v4/H1_H3_APPROVAL.md.
Effective HTTP contract is original V4 plus the exact approved additive JSON Patch.
Historical canonical/proposal artifacts stay intact. The runtime OpenAPI is the exact
derived result: two login/stepUp success unions, two new schemas and one new POST.
AuthResult and all other original operations remain unchanged; tests reconstruct the
original OpenAPI blob by undoing only those five changes.

POST /auth/mfa/totp/select dispatches through the existing closed runtime handler.
Development tests instantiate the private backend explicitly; production wiring remains
closedBackend. EMAIL, D2/D3 enrollment and AUTH-GATE-05 OPEN are unchanged.

## Authorization and selection

ACTIVE requires grant_id and resource_id iff B1-SELF-08. PREAUTH must be proven
PENDING_MFA and forbids grant/resource. Bootstrap/selection/enrollment states reject.
Validated cookie/context determines mode/tenant/user; never the body. When both cookie
types exist, the existing PREAUTH precedence for MFA ceremonies is preserved: forbidden
grant fields cause rejection, never silent fallback to another identity/context.
Schema forbids tenant/user/risk/generation selectors. Only totp_method_id is a locator.

Native JSON grammar validation plus a bounded lexical key scan rejects duplicate decoded
property names (including Unicode escapes) BEFORE DB connection for this operation only.
The existing body byte limit and generic 400 INVALID_JSON remain. Other 13 parsers/inputs
are unchanged. Arrays/repeated/unknown/invalid selector values fail schema before DB.

Read current D1 material under locks, check identity/context/risk, enforce the configured
eligible-method bound and choose only the ACTIVE TOTP UUID in that server set. The
generation comes from the server, never the request. issue_bound_challenge checks that
generation atomically; authorized material re-read supplies exact expiry and context.
A UUID is not a capability. Revoked/foreign/expired/missing choices reject generically.
If the same UUID stays ACTIVE with a new generation before selection, fresh server
generation is used; changes AFTER reading it fail the expected-generation check.

Login and startStepUp may return TOTP_SELECTION_REQUIRED with only own UUID/kind/expiry,
without a challenge, factor consume or operational session. Login commits a proven
PREAUTH cookie/CSRF rotation before exposing choices. SELECT then returns a real
PendingMfa for PREAUTH or StepUpResult for ACTIVE without a new cookie/session.
HTTP projections contain no algorithm/key/ciphertext/recipient/grant/risk/generation.

## Transactions, idempotency and limits

CSRF/origin/state/authorization precede rate and owned reserve. New operation reuses
OTP_ISSUE user/IP/device budgets and the broker cooldown. One connection/transaction
contains reserve, locked material, challenge/revocation/outbox-free TOTP effects, audit
and completion. No automatic database retries, new privilege or arbitrary SQL.
Same-key concurrent requests produce one challenge/audit and a revalidated safe replay.
Different payload with same key rejects; stale generation/expired challenge replay rejects.
Selection-required startStepUp replay revalidates exact choices, context and current
authorization; changed lists return SELECTION_CHANGED rather than stale disclosed IDs.
COMMIT/audit/dependency failures never return a successful result/cookie.

maxEligibleTotpMethods is explicit private positive integer configuration, no default.
Missing configuration closes preparation/selection; invalid supplied configuration rejects
factory construction. Count applies to eligible TOTP only, with duplicate/malformed sets
rejected first. Its maximum derives from the existing json_body_max byte budget and exact
selection-response/correlation JSON shape, not an invented production count. A test value
is synthetic and not production policy. Oversized eligible sets fail rather than truncate
or silently choose a method. This limits service projection/selection AFTER the current
D1 read; it is not a new SQL query row limit or database performance certification.

Tests exercise native grammar/escaped duplicates, context restrictions, UUID/authority
rejection, ACTIVE/PREAUTH selection, multi-method login, concurrent idempotency, stale/
foreign/revoked/expired sets, bound/absent configuration, rate/cooldown, audit/COMMIT
failure and privacy. Connections/locks are simulated; no PostgreSQL/SQL executed.

Next code-only work can cover UI consumption of the published choices and additional
switch/selection scenarios. No frontend should interpret PREAUTH choices as ACTIVE;
operational deployment/real keys/database testing remain separately unauthorized.
