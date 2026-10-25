# D1 TypeScript integration — limited approval

Approval: D1_LIMITED_APPROVAL.md. The exact pinned SQL/matrix are unchanged.
No SQL or PostgreSQL executed. closedBackend and AUTH-GATE-05 OPEN.

Implemented in v4-broker.ts:
- mfaMaterial -> trusted_mfa_material(text,text,text,uuid)
- boundChallenge -> issue_bound_challenge(text,text,uuid,bigint,bytea,bytea,text,text,uuid,uuid)
- enrollAssigned -> begin_totp_enrollment_assigned(text,uuid,uuid,uuid,bigint,bytea,text,text,uuid)
- Existing totpMaterial/consumeOtp already use the exact approved replacement signatures.

Values remain separate positional pg parameters, with existing buffer/array snapshots,
transaction lifetime checks and poisoned-error rollback. New material/enrollment results
have explicit TypeScript types and strict shape/generation/UUID/timestamp decoding.
Assigned method result must equal the submitted UUID. Immutable copies avoid consumers
mutating trusted method lists. Recipient is non-enumerable and default JSON/inspect redact
the entire private material; explicit property access still requires sink-level redaction.
No private material is a public HTTP response.

Tests use the real repository/transaction runner with simulated connections and broker
semantics. The test consumer exercises authorization -> owned reserve -> locked material ->
bound TOTP challenge -> safe projection -> owned completion -> COMMIT. It covers deny,
revocation/stale method, foreign tenant enrollment assertion, audit failure, uncertain COMMIT,
unowned mutation, corrupt response, buffer snapshot and simulated concurrent counter CAS.
This is executable adapter-contract choreography, not an installed HTTP ceremony or proof
of database ACL/RLS/locks. Existing backend tests retain owned-reservation requirements,
factor CAS and full HTTP rollback behavior. Enrollment test ciphertext is a synthetic buffer
for signature/transport testing, not a provisioned secret or approval of D2/D3 policy.

D4 guard: the uninstalled approved backend explicitly rejects EMAIL_OTP verification before
material/proof consumption. Its HTTP test asserts 503, rollback, no cookie and no proof
reflection. Low-level consumeOtp remains available only for contract tests/future private
integration, not authority to enable EMAIL routes. Real enrollment/startStepUp/resend and
PREAUTH session emission stay fail-closed where orchestration dependencies remain incomplete.
No existing closed route is activated by adding the transport calls.

Next code-only action within D1: implement TOTP-only ceremony orchestration against these
typed calls with exact HTTP challenge/session projections and further simulated failures,
without EMAIL or enrollment activation. Real enrollment requires D2/D3; EMAIL requires D4.
Database execution and runtime activation always require separate explicit authorization.
