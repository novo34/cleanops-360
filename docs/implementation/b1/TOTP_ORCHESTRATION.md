# Private TOTP orchestration (D1 code-only)

Source: 25281da3a0bd8e5c1b08101acb21fcc9d3e2e737; approval remains D1_LIMITED_APPROVAL.md.
Canonical V4, pinned D1 SQL/matrix and runtime are unchanged. No database executed.
closedBackend remains connected; AUTH-GATE-05 OPEN. EMAIL and real enrollment stay closed.

## Implemented paths in the existing uninstalled backend

- Login: real Argon2/version-bound PREAUTH and tenant selection are reused. If the
  trusted PREAUTH summary is PENDING_MFA, read D1 material under the same transaction,
  assert new PREAUTH ID/selected tenant and prepare an enabled TOTP challenge.
  Missing/ambiguous TOTP never falls back to EMAIL or a guessed method.
- startStepUp: require the existing HTTP owned reservation and fresh grant/resource
  authorization. D1 validates current membership/risk/method generation; authorized
  totpMaterial supplies exact challenge expiry. No invented expiry or secret projection.
- resendOtp: TOTP only. Resolve previous authorized challenge, method/version/purpose,
  reauthorize grant/resource, and issue the replacement for that explicit trusted method.
  Generic/EMAIL challenge functions are not called. Existing SQL cooldown/revocation apply.
- verifyMfa: actual TOTP verifier/decryption and global counter CAS remain in the same
  connection. STEP_UP rechecks exact session/grant/target authorization before crypto/CAS;
  ACTIVE preserves the current session. PREAUTH requires PENDING_MFA, then D1's
  ISSUE_SESSION material supplies risk and identity after successful factor verification.
  Existing issue_active_session independently revalidates principal generation, origin
  session/membership/risk, consumes PREAUTH and audits, all before COMMIT.
- Existing ACTIVE confirmation remains one-time recovery-code handling with fresh
  B1-SELF-06/step-up. PREAUTH confirmation rejects before proof consumption, because
  D2/D3 provisioning is not approved. Initiating enrollment is still unavailable.

PREAUTH tenant selection/switch stays closed where V4 cannot rotate that binding. ACTIVE
begin_switch can create a new PREAUTH/TOTP challenge; no same-cookie rotation is invented.

## Reservations, replay and safe output

Existing HTTP owned reservations protect step-up/resend/switch/confirmation. Login
challenge and verifyMfa lack a canonical Idempotency-Key header, so private transaction-local
one-time reservations use CSPRNG keys and request hashes; safe completion stores NULL.
These keys are never public replay handles or alternate HTTP idempotency configuration.
Failures returned as AuthError discard their reservation and commit bounded attempt counters;
dependency/authorization exceptions, abandoned reservations, audit or COMMIT errors roll back.
No automatic retries are introduced. New POST retry starts fresh locked validation; already
consumed challenges/PREAUTH reject. An uncertain COMMIT never emits successful cookies.

HTTP idempotent challenge replay re-reads authorized challenge expiry and current enabled
method generation plus fresh authorization before returning stored safe descriptors.
Expired/revoked/replaced/stale-generation challenges cannot be revived by replay.
Multiple enabled TOTP methods need an explicit trusted existing method ID; the V4 initial
login/step-up inputs have no method selector. Those ambiguous initial requests remain
fail-closed; a public selector would need a separately reviewed HTTP contract change.

Only whitelisted V4 fields are projected: challenge ID/allowed methods/expiry and ACTIVE
session ID/tenant/absolute expiry. Risk, method generation, grants/resources, recipient,
key version, ciphertext and URI stay private. Session/CSRF tokens are CSPRNG and sent as
cookies only after the existing transaction promise confirms COMMIT.

New sessions require explicit private sessionLabels metadata (device/browser) because V4
issue_active_session requires both. No request-header/browser fallback or production
label is selected. Missing/malformed metadata fails closed and rolls back factor CAS.
Existing selectEnabledMethod/sessionPolicyForRisk and factor/broker/reservation code are
reused; no alternate cryptographic implementation, key provider, SQL privilege or runtime
activation mechanism is added.

## Verification limits

HTTP tests exercise the real factory/handler/Argon2/TOTP/HMAC with simulated connections,
broker state, transaction rollback and serialized fixture concurrency. Coverage includes
login, PREAUTH issuance under both risk classes, challenge preparation/replay/resend,
stale generations, expiry, foreign tenant, ambiguous methods, invalid proof attempt,
audit failure, COMMIT failure, caller retry and a concurrent single session winner.
Existing ACTIVE confirmation/step-up tests remain regression coverage.
Fixture algorithms/keys/labels are synthetic, not D2/D3 policy or production custody.
Tests do not establish PostgreSQL compilation, RLS, true lock scheduling or deployment safety.
