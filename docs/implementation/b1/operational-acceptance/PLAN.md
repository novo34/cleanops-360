# B1 PR006 / PR007 — executable operating acceptance plan

State PREPARED, NOT EXECUTED. No real infrastructure, custody, production, deployment,
SMTP, merge or runtime activation is authorized by this plan. B1/AUTH-GATE-05 OPEN;
closedBackend retained. Architecture D2/OpenBao Switzerland, D3/SHA256/32-byte CSPRNG/
CleanOps360, D4/verified recipient/encrypted outbox/quarantine, mandatory MFA and12h/24h
policy are already approved. They are not resubmitted as open design decisions.

Sources: SRS SEC021/PR006/PR007, existing AUTH gates/INFRA-AUTH,
closure/PLAN.md, E1-OWNER-RESOLUTION-2026-10-17, SESSION-OWNER-RESOLUTION-2026-10-18,
KEY_OPERATIONS.md and PHASE_ACCEPTANCE_TEMPLATE.md. Stages below are execution steps
for those existing controls, not additional product requirements or another module.

|Order and prerequisite|Concrete execution|PASS evidence / FAIL condition|Responsible / exact authorization|
|---|---|---|---|
|0. Complete isolated technical evidence|Execute exact approved SQL14 in owned fresh PG16;20 native+8 additional scenarios; targeted real regression; reconcile44 original requirement rows individually.|All mandatory cases evidenced; no hidden failed/blocked case, unchanged runtime; clearly separate42 technical/isolated criteria from two formal delivery/phase requirements if that is the observed result.|Engineer/QA within current exact SQL14 approval. Security assesses observed evidence; no productive acceptance inferred.|
|1. Actual resources and custody decision|Owner records actual Swiss host/region, network/storage/replica/backup/support boundaries, environment identity, accountable custodian, recovery custodians and independent reviewer; inventory immutable key IDs without key bytes.|Signed resource/custody record, residence/contract evidence and exact operating task authorization. FAIL if any resource/person is fictitious or support/backup/export violates approved Swiss boundary.|Owner must designate real resources/people and separately authorize isolated Swiss operational provisioning. Current Docker approval does not cover it.|
|2. Provision authorized isolated operating environment|After stage1 approval, pin maintained OpenBao release/image digest; deploy on specified private Swiss resources with TLS verification, deny public access, separate environment/purpose/tenant namespaces, approved storage/backup targets and restore point inventory.|Observed deployment/configuration fingerprints, TLS/health, network denies, actual storage/compute/backup residence and footprint. FAIL if public/shared/production exposure or unverified location.|Designated infrastructure operator executes only the resource list and network scope approved in stage1. No provider is selected here.|
|3. Custody initialization and workload permissions|Agree the actual seal/recovery mechanism and quorum with named custodians; initialize under dual control outside CI logs. Bind verifier, issuer and worker identities to tenant/purpose/version-specific capabilities; deny generic runtime/browser/CI/support key access.|Attributable custody record, approved policy diffs, workload-positive and cross-tenant/purpose/revoked-identity negatives. Read-only status/policy metadata can be recorded with `bao status -format=json` and approved capability inspection; never output init material/tokens/keys.|Custodian/Security approve mechanism, recovery threshold and exact identities/policies before execution. No arbitrary production quorum/TTL/key budget is invented.|
|4. Real adapter and lifecycle integration|Bind actual workload identity/OpenBao resolver to existing private custody capabilities. Missing/unknown version, tenant/purpose, unavailable/sealed service and invalid AEAD must fail closed. Keep envelopev2/AAD and issuer parameters. Real binding is currently absent; callback interfaces/synthetic keys do not count as this integration.|Actual UI/API/PG plus authorized custody flows and rejected wrong-scope/revoked/unavailable calls, with redacted observed receipts. FAIL if resolver is only an interface/mock or falls back to a key.|Engineer with named custodian/Security; real-infrastructure integration requires stage1 authorization. Any newly necessary SQL/ACL must be proposed as one exact consolidated candidate before installation.|
|5. Rotation and recovery rehearsal|Exercise new writes with new immutable key ID and old-version reads; distinct wrapping-key rotation and data-key reseal. For data-key persistence, use approved CAS and retain UUID/algorithm/counter/generation integrity; race/revoke/tamper failures must not overwrite. Restore key/catalogue/ciphertext/PG/configuration to an approved isolated recovery target.|Actual old/new key reads, cross-tenant denial, durable CAS/audit records, failed/stale CAS, revoked credentials and measured RPO≤15min/RTO≤4h. FAIL if only an in-memory rewrap helper or small CI database dump is presented as real key custody/recovery.|Custodian + engineer + infrastructure operator execute the specifically authorized drill. Existing KEY_OPERATIONS specifies the procedure; this plan does not claim a real rotation writer or operational recovery has run.|
|6. Remaining external boundary acceptance|Designate actual verified-recipient authority and independent recovery-attestation operators. Preserve encrypted outbox/expiry/retry/quarantine. If real delivery is mandatory for operating acceptance, owner approves the actual route/Swiss data boundary and controlled mailbox before any external SMTP.|Observed verified-recipient/recovery responsibility and authorized controlled delivery evidence; uncertain delivery remains quarantined. FAIL if synthetic transport/attestation is called productive.|Owner/custodian/identity authority. SMTP remains forbidden until a separate exact authorization; no external provider/account/host is invented.|
|7. Independent review and complete manual demonstration|Reviewer receives immutable final source/SQL/ACL/config hashes and per-row proofs; records own findings and remediation validation. PO executes remaining/PO_MANUAL_DEMONSTRATION.md and fills PO_ACCEPTANCE_RECORD.json using the identified authorized environment/build.|Actual reviewer identity/report, zero unresolved acceptance blockers, per-step manual observations and redacted receipts. FAIL if engineer self-signs an independent review or copies automatic checks into a manual result.|Owner names independent Security reviewer and actual PO tester; any staging/deployment/manual environment creation needs concrete authorization before provisioning. Current isolated CI can prepare evidence but is not a manual sign-off.|
|8. Formal phase decision|Reconcile all44 rows with technical, operating and manual evidence. PO records PHASE_ACCEPTANCE_TEMPLATE decision and AUTH-GATE-05/B1 disposition. Start no successor beforehand.|All mandatory criteria genuinely satisfied, owner ACCEPTED recorded and history preserved. No conditional closure, omitted obligation or deferred B1 debt. Production authorization remains a separate release decision.|Product Owner alone records phase acceptance; engineer attaches evidence. No merge/deployment/production activation is implicit.|

## Ready inputs, not invented execution

-44-row source of truth: closure/requirements.json and MATRIX.md.
-42 accepted isolated criteria: remaining/ACCEPTED_42_INDEX.json (historical41 index preserved), retaining
 original real report/source/run/case references. This index is not a new test run.
-Current SQL14 approval: consolidated-test-14/AUTHORIZATION.json; no other SQL/ACL approved.
-Manual dossier and blank record are prepared; no tester/date/decision is fabricated.
-Actual Swiss infrastructure/custodian, independent review and manual observations
 have not been supplied. They block operating/formal acceptance, not the current
 synthetic SQL14 experiment. Do not reprovision or alter any existing resource.

## Meaning of technical completion

A successful SQL14 experiment can complete the42 isolated functional criteria; it
cannot close B1 as a44-row module. The production-like OpenBao workload binding and
real key lifecycle have not been implemented/observed against designated Swiss
resources, and independent/manual PO evidence is absent. These are real PR006
delivery obligations, not paperwork to bypass or work transferred to another phase.
The isolated functional core may be reported validated; integral technical/formal
closure remains unavailable until those obligations and PR007 are fulfilled.

## Owner-authorized preparation follow-up (baseline425503d)

Self-hosted OpenBao, Swiss data/secret residence, production separation and encrypted
verifiable recovery are recorded as decisions. Principal custodian is proposed to
be the project owner, not yet formally confirmed; secondary remains unassigned.
Prepared package: [OpenBao configuration/resources](openbao/README.md),
[custody/rotation/backup/recovery](openbao/CUSTODY_AND_RECOVERY.md),
[PR006/PR007 checklist and exact authorizations](openbao/ACCEPTANCE.md).
The renderer only produces offline review files, not infrastructure or secrets.
Actual service/config/ACL validation, custody integration and REC01–12 execution
remain NOT EXECUTED.42/44, closedBackend, B1/AUTH-GATE-05 OPEN remain unchanged.

## Authorized isolated native follow-up

OpenBao synthetic native/TLS/ACL/rotation and encrypted fresh-target backup/restore:
47 check executions PASS; [redacted actual evidence](openbao/isolated/RESULT.md).
All temporary resources removed and preexisting inventories unchanged. Real Swiss
residence, custody, B1/OpenBao key lifecycle integration and independent/manual PO
acceptance are not inferred;42/44 and all formal gates remain OPEN.
Owner selected an expandable Swiss home server with VPS/dedicated portability;
final hardware purchase is not a prerequisite for isolated trials. Principal owner
custody confirmation, secondary designation and operational quorum remain undecided.
