# B1 ceremony material — REVIEW ONLY

Status: PROPOSED_REQUIRES_OWNER_APPROVAL. AUTH-GATE-05 OPEN. No execution authorization.
Canonical V4 and the earlier B1-X proposal remain untouched. This is an incremental contract,
not a claim that challenge/session/enrollment routes are complete.

## Three contract closures

1. trusted_mfa_material derives tenant/user/binding from checked_preauth or context, not
request IDs. It locks the existing policy, active user and methods, reads risk_class
and only ACTIVE method rows. An email address never implies EMAIL_OTP is enabled.
Its recipient is private mail-delivery data; never return/log this JSON in HTTP.
For ISSUE_SESSION require VERIFIED plus factor_verified_at. Reuse issue_active_session:
map the locked risk through existing V4 durations, and let SQL independently revalidate
risk, principal generation, membership, origin revocation and PREAUTH consumption.
Unknown risk and multiple methods without an explicit eligible selection fail closed.

2. begin_totp_enrollment_assigned accepts a private CSPRNG UUID and initial generation 1
before encryption, rederives and compares tenant/user and inserts algorithm/ciphertext/version
atomically. No placeholder secret, allocation table/state, schema change or caller table
access. Preserve the existing lifecycle method_version for CAS. Candidate AEAD uses an
immutable INITIAL version 1: confirmation increments the CAS version but must not invalidate
ciphertext. Secret rotation must allocate a new method UUID; do not reinterpret old ciphertext.
This envelope/lifecycle distinction needs approval; the candidate decoder is not installed.

3. issue_bound_challenge reuses issue_challenge after locking and checking the actual enabled
method, kind and expected version. Replace its direct caller EXECUTE grant, and replace the
old enrollment entry point. For EMAIL, the private issuer generates the OTP and encrypts a
mail payload containing only the trusted recipient/context before calling the broker.
No synchronous SMTP. Keep the encrypted outbox write, audit and idempotency completion
in the same transaction. No email/TOTP preference is invented. PREAUTH factor CAS,
ISSUE_SESSION material and existing session issuance must use one connection/transaction;
failure rolls back proof consumption, session issuance, audit and reservations.

## Ordering and errors

Reuse the B1-X principal -> credential -> origin/session/PREAUTH -> organization/user ->
policy -> methods (UUID order) -> challenge -> effects/audit/idempotency ordering.
The reader takes policy SHARE after context helpers, then user FOR UPDATE and method
locks in stable UUID order, matching the existing broker's user-first serialization of methods.
No network/crypto callback may release the transaction. Recheck clock_timestamp after locks.
Invalid/missing/null material raises generic AUTH_INVALID/42501; do not include input,
recipient, OTP, URI, key or ciphertext in diagnostics. SQL constraint/lock/dependency errors
abort the transaction; map to existing generic service errors, never authentication success.
Deadlock/serialization retry must restart the entire transaction with bounded policy, never
resume after a consumed proof or expose a pre-commit cookie/URI. Duplicate assigned IDs
raise uniqueness errors, never overwrite. Existing CAS and owned-reservation handling stay.

## Implemented independently

lib/b1/ceremony-preparation.ts is isolated preparation with a justified future private consumer:
existing V4 risk mapping, explicit eligible method selection, OTPAuth secret/URI generation
with caller-supplied algorithm/entropy/issuer/label, AES-256-GCM envelope bound to tenant,
user, method, initial generation and key version, and EMAIL verifier-compatible HMAC.
No broker/runtime imports it. Its inputs are not authorization capabilities; only the pending
locked reader can supply authority. Unit inputs are synthetic examples, not normative defaults.
Implementation bounds (16..128 secret bytes) are resource validation, not selected entropy.
No URI, OTP or session may be exposed before future approved SQL plus COMMIT succeeds.

## Minimal owner decisions and remaining work

- Approve private read of enabled methods/risk/recipient and three new function EXECUTE
  signatures, replacing the two older direct entry points. No new table privileges.
- Approve assigned UUID/initial version and candidate envelope lifecycle; select reviewed
  enrollment algorithm, entropy, issuer and delivery encryption/key custody. No defaults added.
- Approve challenge selection behavior (ambiguous set rejects) and audit action
  auth.challenge.issue. HTTP contracts/cookies stay unchanged.

After approval, wire typed broker calls and real backend routes, add transactional scenario
tests for challenge/resend/PREAUTH issuance/enrollment and run no-database CI again.
SQL here has not been parsed, compiled or executed against PostgreSQL; static checks do not
establish SQL validity, actual lock behavior, RLS or privilege correctness. Database validation
requires separate authorization. These three routes remain fail-closed in approved-backend.
