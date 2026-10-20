# B1 TOTP HTTP selection — REVIEW ONLY

PROPOSED_REQUIRES_OWNER_APPROVAL. Base 78aa7d34010ed9250f76e037e2c51f163409700e.
No contract/route/privilege activation. AUTH-GATE-05 OPEN and closedBackend retained.
EMAIL and D2/D3 enrollment remain closed.

## V4 audit and compatible implementation

HTTP_CONTRACT.md defines 13 operations, rejects unknown properties/query and uses Error
with stable code/empty safe details for 409 conflicts. LoginInput and StepUpInput have
additionalProperties=false and no method UUID selector. PendingMfa/StepUpResult require
a real challenge; AuthResult lacks a method-selection state. memberships lists companies,
not MFA. No method-discovery HTTP operation exists. Do not duplicate it or encode method
lists in error messages. D1 already reads the user's ACTIVE method set privately.

Implemented without widening V4: ambiguous initial TOTP choice returns
409 TOTP_SELECTION_REQUIRED in the existing Error envelope, with no method IDs/versions/
recipient in details. Rollback commits no challenge, factor, session, cookie or reservation.
Login may have verified its password in memory but consumes no MFA proof.
One eligible TOTP retains existing behavior. selectTotpMethod reuses selectEnabledMethod,
validates UUID as a locator and rejects malformed, foreign/revoked/non-TOTP choices,
duplicate IDs including mixed case, and corrupt generations. Resend uses its trusted
previous method ID. D1 boundChallenge still revalidates current method/state/version.

CURRENT HTTP still rejects totp_method_id and authority fields with 422. The private
selector is implemented/tested; browser UUID acceptance/disclosure needs approval below.
No alternate handler or feature flag bypasses the closed request vocabulary.

## Proposed minimal HTTP delta — NOT APPLIED

review-only.openapi-patch.json is JSON Patch against lib/b1/openapi.json at the base.
It changes only two success data schemas and adds two schemas/one POST:
- Login/startStepUp may return TOTP_SELECTION_REQUIRED with own opaque method_id/kind=TOTP
  choices and binding-bounded expires_at, only after password/principal/tenant proof or
  ACTIVE session plus fresh grant/resource authorization.
- Login selection-required rotates BOOTSTRAP to PREAUTH only after COMMIT. SQL PREAUTH
  remains PENDING_MFA; no new SQL state or operational session is introduced.
- POST /auth/mfa/totp/select requires totp_method_id, existing CSRF and Idempotency-Key.
  ACTIVE requires eligible grant_id and resource_id iff B1-SELF-08. PREAUTH PENDING_MFA
  forbids grant_id/resource_id. Mode/tenant/user/risk/version come from validated context,
  never request authority. These context-dependent rules need future adapter checks.
- Fresh D1 material/authorization are locked on EVERY request. Selection creates a real
  TOTP challenge, no factor/session; PREAUTH returns PendingMfa, ACTIVE StepUpResult.
- Preserve owned reserve/effect/audit/completion, expiry/replay revalidation and safe errors.
  No extra SQL, table privilege, key or algorithm is proposed.

Why one new operation: it reuses proved PREAUTH after multi-method login without retaining/
resubmitting the password, and serves LOGIN and STEP_UP. No selector duplicated into all
old inputs. AuthResult itself is unchanged, so verify/confirmation result types do not widen.
Resend stays tied to the prior trusted method, not an arbitrary selector.

Future adapter requirements: explicit state/CSRF/rule/rate/idempotency handling; schema
validation before DB; authorization before choices; reject duplicate JSON selector keys
with reviewed parser policy (JSON.parse alone cannot detect them); context-only identity;
re-read current generation even within list TTL. UUID is not a capability. If ID stays
ACTIVE across a generation change, use the new server generation; a race after reading
must fail D1's expected-version check. Never accept a browser version or downgrade MFA.

## Explicit owner decisions

H1: Approve the POST, two response unions, own UUID disclosure after proof and the
selection-required PREAUTH cookie transition. No method aliases exist in V4 storage;
do not invent device names or treat method UUID as proof of ownership of a physical device.
H2: Approve context-derived grant/resource restrictions, OTP_ISSUE rate/cooldown mapping,
duplicate-JSON policy and a reviewed method-list size bound. No production count selected.
H3: Approve future canonical publication. D1 code-only approval is not HTTP-delta approval;
SQL/database/runtime execution remains separately prohibited.

Tests validate candidate schemas in isolation and pin unchanged runtime/canonical HTTP.
Current 409/422 and private selection/resend race paths are exercised. They do NOT prove
a live selected-method HTTP route: the patch is unapplied pending H1-H3.

## Private session metadata

prepareSessionLabels is used only at the private sessionLabels callback boundary.
Origin must be server-owned reviewed coarse metadata/catalog, never body/query/cookies,
raw User-Agent, IP, hardware identifiers, exact browser versions or fingerprint entropy.
A source string cannot attest trust; callback provenance remains a deployment boundary.
No provider/catalog values/production fallback or invasive parser is configured.

NFC/space-separator normalization, edge trim, nonempty values, control/format/bidi rejection
and 120 normalized Unicode characters match V4 PostgreSQL limits. Reject, never truncate;
raw normalization work is bounded by existing json_body_max. Catalog review must exclude
identifiers/secrets/PII: pure normalization cannot establish that for arbitrary text.
Missing/invalid metadata rolls back proof/session. Default JSON/inspect/spread hides
label values via existing privateArtifact redaction; explicit broker persistence reads them.

V4 own-session listing already permits its owner to see device_label/browser_label.
This does not remove that approved projection or expose labels elsewhere. Labels never
prove identity, permissions, tenant, trusted-device status or step-up. Future deployment
must supply reviewed catalog provenance and sink tests; none is claimed as deployed.
