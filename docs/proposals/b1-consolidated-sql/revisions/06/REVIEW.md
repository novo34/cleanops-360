# Consolidated06 — E1, REVIEW ONLY

Prepared from exact approved05; originals/history untouched. Generated fresh-install
candidate, not an incremental patch or migration. `manifest.json` records full Git
blob/SHA256/bytes, source pin and exact29 function signatures/ACL. Complete delta:
APPROVED_05_TO_06.diff. No install workflow, flags or runtime activation.

## Security changes requiring exact approval BEFORE installation

- Dedicated NOLOGIN/NOBYPASSRLS recipient-verifier role. Can only attest current
  server-address digest or expiring reset ticket; cannot read tables/issue sessions.
  This is an explicit trust boundary: actual verification/identity-proof procedure
  and custodian MUST be designated before connecting an operational provider.
- Verified recipient generation/evidence/expiry, immutable assigned IDs for AEAD,
  bounded server-validated expiry; EMAIL pending->first-code->ACTIVE and authenticated
  login/step-up consumption revalidate method/recipient generations atomically.
- Outbox DISPATCHING/QUARANTINED; expired leases cannot redeliver automatically.
  SMTP is outside transactions. A dispatch commit followed by crash is uncertain,
  quarantined by separate short sweep. Revocation during delivery cannot unsend;
  generation and validity checks on consumption prevent that email granting access.
- Legacy worker claim/finish and identity EMAIL consume/material grants revoked.
  Existing D1 bound-challenge signature remains but now accepts TOTP only; EMAIL
  must use verified-recipient contracts. No old EMAIL path remains authorized.
- Trusted tokens hashed, tenant/user/principal/credential-bound, maximum30 days,
  explicit per-tenant enablement (missing policy denies). Valid only as metadata
  of an already ACTIVE session: NEVER skips mandatory MFA or extends sessions.
- Server-owned resource ancestry (unknown/foreign/cyclic resources deny), role
  membership and per-user/resource/time grants, explicit DENY wins, no role
  name grants authority. Permission mutation requires independent effective
  manage_permissions, fresh step-up and exclusive policy version CAS; delegation
  cannot exceed actor's effective rights. No initial roles, grants or memberships. Manage Access uses the server users
  resource node with the access permission namespace; no client ancestry authority.
  Reset attestations are capped by existing trial preauth_ttl, not an invented
  production lifetime; exact policy composition requires this SQL approval.
- Recovery code consumption produces only expiring ENROLLMENT_REQUIRED with new
  cookie/CSRF, invalidates prior factors/sessions/devices/challenges/codes. No session
  before fresh enrollment/first factor. Password-reset receipt plus recovery code OR separately authorized administrative
  recovery (current edit/manage_permissions, fresh step-up, independent proof receipt;
  no self-approval) required. User submits the password privately; administrator never
  chooses it. Consumption revalidates approving session/factor and policy version;
  credential CAS and principal sessions/PREAUTH/trust revoked.
- Admin reset requires independent users.edit + access.manage_permissions for target,
  fresh B1-SELF-06 factor AND separate expiring identity-proof receipt; no self-reset
  or cross-tenant. B1-SELF grants alone never authorize administration. Receipt,
  reason and actor audited without OTP or recipient. Exact rule composition is a
  NEW proposed contract, not silently approved by C-SCOPE.
- PREAUTH tenant rotation preserves actual verified credential version/time and
  deadline, requires active target membership/B1-SELF-08, consumes prior binding,
  resets factor state for target; no factor inherited across tenants.

## Transaction/lock and idempotency rules

Principal/credential lock, relevant memberships in tenant order, policy, method,
verified recipient, challenge, outbox. Admin discovers without authority then locks
actor/target principals in UUID order before validating context. Worker quarantine
sweep is its own short transaction and never followed by principal locks in that tx.
Permission mutation obtains policy UPDATE before authorization SHARE, avoiding an
upgrade. Mutable authority is re-read under lock. All failures roll back; returned
negative proofs must still commit canonical attempt accounting in HTTP service.

New mutating HTTP orchestration MUST reuse reserve_owned/complete_owned in the
same unit of work as effects/audit, one_time for secrets. These SQL functions do
not introduce HTTP endpoints or independently commit. A test-only verifier/transport
is not an operational provider or approved human proof. Broker calls cannot be
exposed as arbitrary HTTP RPC. Runtime remains closedBackend.

## Validation and remaining work — no acceptance inferred

Offline PG16 grammar/PLpgSQL parser + static regressions in noDB CI; this does NOT
validate catalog, execution plans, SQL permissions or dynamic dependencies. Native
installation/negative ACL/RLS/claims/COMMIT/races/backup-restore and UI integration
remain NOT EXECUTED pending exact authorization. Existing05 native PASS unaffected;
new06 must never inherit it. SQL06 is not represented as an approved canonical source.

Implementation still required after native validation: new HTTP schemas and private
orchestration for EMAIL/recovery/admin/trust/access; UI consumers, real resource-catalog registration and role-administration HTTP/UI; actual provider proof
attestations and bounded reset-proof expiry policy; key-provider integration and
external-app verification. Existing self-service TOTP/session flows retained.

No owner action is requested to deploy/activate. Any installation request must name
manifest exact blob/SHA256 and stay in a new isolated synthetic PostgreSQL16 container.
B1/AUTH-GATE-05 OPEN. No requirement promoted to accepted by this proposal.
