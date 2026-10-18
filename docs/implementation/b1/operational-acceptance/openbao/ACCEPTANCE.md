# PR006 / PR007 evidence and authorization checklist

B1 remains42/44. Prepared templates/static tests do not accept either requirement.
Existing42 proofs remain at remaining/ACCEPTED_42_INDEX.json; no SQL14/functional
history is re-audited or relabeled. Source: SRS PR006/007, INF003 and existing gates.

|ID|Obligation / actual PASS evidence|Execution and acceptance owner|Current state|
|---|---|---|---|
|OPS01|Named resources and confirmed principal/secondary custodian; signed conflict/access/custody record|Project owner + custodians|NOT PROVIDED|
|OPS02|Swiss processing/storage/backup/replica/support/media and network isolation proof; actual contract and deny tests|Infrastructure operator + Security|NOT EXECUTED|
|OPS03|Official release verified independently; actual config syntax/startup/TLS/seal/storage/audit verified on approved new host|Operator + reviewer|NOT EXECUTED; release metadata only|
|OPS04|Actual restricted workload roles, wrapped bootstrap, default-policy absent, no key listing/mutation/cross-scope/sys access|Security + engineer|NOT EXECUTED; offline JSON policies only|
|OPS05|Custody ceremony, threshold restore and root-token revocation; redacted records|Both custodians + reviewer|NOT EXECUTED|
|OPS06|Existing B1 envelopev2/AAD + actual key resolver/workload separation, fail-closed unavailability/revocation and no logs/HTTP leakage|Engineer + Security|NOT IMPLEMENTED/EXECUTED against real custody|
|OPS07|Real old/new key reads, rotation/CAS races, HMAC migration/reissue policy and retained-backup readability|Custodians + engineer|NOT EXECUTED; current HMAC buffers are not version-resolved|
|OPS08|Full coherent encrypted Swiss backup/restore, monotonic security-state protection; measured RPO≤15min/RTO≤4h|Custodians + operator + QA|NOT EXECUTED; old PG16 tests do not prove custody recovery|
|OPS09|Named verified-recipient/recovery-attestation responsibility; controlled external-delivery authorization/evidence if required|Owner + Security|NOT PROVIDED; SMTP remains prohibited|
|OPS10|Independent signed security review of immutable code/SQL/config/ACL/observed evidence, blocker remediation verified|Named independent reviewer|NOT PROVIDED|
|OPS11|Actual complete manual authentication/MFA demonstration with PO observations and safe persisted-effect evidence|Named Product Owner tester|PREPARED, NOT EXECUTED|
|OPS12|All44 individual criteria plus AUTH gates satisfied, actual PR006 delivery acceptance and PR007 formal phase decision|Security/owner and Product Owner respectively|OPEN; no phase advance|

## Failure/recovery test specification (not results)

|Case|Actual future stimulus|PASS assertion|
|---|---|---|
|REC01|Restart/reseal isolated OpenBao|No key fallback or authentication success; threshold unseal restores intended capability only|
|REC02|One custodian unavailable / wrong share / revoked share|No sub-threshold unseal; record availability impact, no recovery bypass|
|REC03|Revoke a workload token/certificate/SecretID|Old credentials cannot fetch material or log in again; unaffected authorized identity still works|
|REC04|Wrong tenant/purpose/environment/key ID and forged client selector|Actual token capabilities deny reads; trusted resolver ignores client authority; no fallback/global key|
|REC05|Runtime/CI/mail worker attempts TOTP/HMAC/admin reads and list/write/delete|403/deny for unauthorized capability; mail worker can read ONLY explicitly assigned mail data|
|REC06|KV create of new ID, overwrite existing ID, absent/stale CAS and metadata/destroy paths|Only approved CREATE with required CAS succeeds; no silent overwrite or bypass via metadata/version endpoints|
|REC07|Audit sink full/unwritable, TLS wrong CA/expired cert, unavailable service|Requests fail closed and emit only redacted alert; no raw key/secret/provider-body logging|
|REC08|Same-data-key wrapping rotation and new-data-key reseal|Old retained records readable, new writes use new exact ID; stale CAS/revocation cannot corrupt method/counter|
|REC09|Corrupt/truncated/tampered snapshot, mismatched seal, missing decryption share|Restore rejected, originals untouched, no forced restore/reinit shortcut|
|REC10|Complete simulated host loss to fresh target + coherent PG/config/files restore|Old/new material recovered, sessions/recovery/OTP counters never replay, real UI/API/PG checks PASS, RPO/RTO measured|
|REC11|Restore a stale snapshot containing previously consumed OTP/recovery/trust/session state|Fail closed until independently reconciled or approved revocation; stale credentials never regain validity|
|REC12|Uncertain delivery during failure/restore|Encrypted outbox stays quarantined; no delivery replay or expired OTP acceptance; SMTP simulator clearly labeled|

No REC case has run here. Record actual timestamps/identity/target/version, PASS/FAIL/
BLOCKED/SKIP, redacted receipts and cleanup per case. Mandatory SKIP/BLOCKED means no
acceptance. Failure investigation may prepare corrections but not install unapproved
SQL/ACL. Application SQL14 is frozen; changing OpenBao policies also requires the
exact operational approval, not this documentation authorization.

## Independent review package

Provide baseline425503d plus this preparation commit, SQL14 exact blob/SHA, published
42-row proofs, rendered configuration/policy hashes and actual release signature/
checksum verification. Reviewer checks host/root/backup/seal attack paths, inherited
workload policies and issuance/revocation rights, nonce/HMAC lifecycle and logs, real
negative ACL tests, Swiss residence including operator/support access and actual
restore receipts. Record reviewer identity/independence/scope/date/findings/severity/
closure evidence. Do not convert this self-prepared checklist into independent review.

## Manual Product Owner demonstration

Reuse `../../remaining/PO_MANUAL_DEMONSTRATION.md`
and its blank `PO_ACCEPTANCE_RECORD.json`; do not create a parallel acceptance UI.
In the approved private environment, identify exact build/SQL/config and actually
perform all10 existing steps: denied/abuse login, company/PREAUTH rotation, TOTP
first enrollment and tested authenticator, verified EMAIL, recovery/reset, trusted
device without MFA bypass, sessions/multirole/timeouts, RBAC/RLS, durable denial
audit/COMMIT failure, malformed/network/stale-context safety. Add actual custody
unavailable/restore observations from OPS06–08; label simulated email delivery and
never claim mobile compatibility or external delivery not actually tested.
PO records actual observed results, screenshots only if scrubbed of OTP/QR/URI/
recipients/tokens, durable-effect receipts, unresolved issues and accept/reject.
PR007 is not signed automatically by this checklist or by passing CI.

## Exact authorizations still needed, in dependency order

1. **OPER-01 — resources/custody and configuration approval:** identify real Swiss
   primary/backup/restore/workload hosts, private routes/CIDRs, storage/media/support
   boundary; confirm principal owner and secondary, reviewer and tester. Approve
   selected release+architecture digest and independent signing trust, rendered
   config/ACL hashes, AppRole/injection boundary, KV scopes, seal/quorum, token/
   SecretID TTLs, retention/cadence, nonce budgets and rotation review policy.
   Blank inputs are not authorization; never provide secret values in chat.
2. **OPER-02 — isolated provisioning and rehearsal execution:** after OPER-01, approve
   exact new resource IDs/cost boundary, install/init/config/policy/role/mount scope,
   synthetic key generation, private adapter integration scope, backup/restore drill
   targets, inventory/cleanup and REC01–12 execution. Current permission covers NONE
   of those real infrastructure operations. Any necessary SQL/ACL outside SQL14 needs
   its own exact consolidated artifact authorization before installation.
3. **OPER-03 — independent review/manual session:** name reviewer/PO, authorize access
   to the exact isolated environment and redacted evidence, execute review and10-step
   manual demo. Any environment creation/deployment beyond OPER-02 needs its own scope.
4. **PR007 decision:** after PR006 evidence is genuinely complete, PO records actual
   formal phase acceptance with `docs/PHASE_ACCEPTANCE_TEMPLATE.md`. B1/gates and
   all44 rows are reconciled then. No production, merge, SMTP or next module is implicit.

The next concrete owner input is OPER-01's real resource/custodian record. Nothing
here asks to reapprove SQL14, session policy or the already accepted42 criteria.
