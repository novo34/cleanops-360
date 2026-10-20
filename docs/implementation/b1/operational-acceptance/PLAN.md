# Current execution decision — Product Owner, 2026-10-20

Development and validation use existing Hostinger with synthetic data only. Swiss
migration is a separate final operation after the full system is developed, tested
and approved. This supersedes the sequencing statements below, not the SRS,
Swiss final residence/custody/security controls or historical evidence.

- **A — current staging blockers:** review exact private
  identity/key/ingress integration before controlled staging use; actual manual
  PO observations. Staging capacity/TLS/secret paths remain unverified. No current
  security control is deferred because Hostinger is outside Switzerland.
- **B — isolated validation:** retain the 42 accepted functional criteria, exact
  SQL14 and 144 real B1/PG/OpenBao checks. The proxy change affects HTTP validation,
  so existing service/origin and production Next regressions must run on the new
  commit. Unaffected custody/SQL evidence is retained, not rerun or called final
  acceptance. The 22 local service/origin cases passed after completing the local
  source retrieval; the first invocation lacked config.ts and executed no cases.
  Current remote results and retained failures are linked in the execution report.
  No SKIP is counted as PASS; no completed phase or production operation is inferred.
- **C — final Swiss operation:** actual compute/storage/backup/access residence,
  additional independent custodians and approved operating quorum, witnessed
  custody/lifecycle/recovery and representative WAL/PITR/RPO/RTO remain OPEN.
  There is no authorization to provision or migrate any Swiss resource now.

PR006 remains OPEN for current integration/review/manual obligations and final
operational obligations. PR007 remains OPEN for formal PO acceptance. Its existing
explicit-owner exception permits isolated synthetic B2/B3 work per this instruction.
AUTH-GATE-05 remains OPEN and closedBackend remains connected.
B1-TECH-READY is evidenced for the authorized isolated synthetic scope: the proxy
correction, P1 custody/COMMIT defect, independent revalidation and applicable CI
are complete. [Executed source/run/job reports](openbao/integration/PROXY_DEADLINE_EXECUTION.json).
The44-row module remains OPEN with42 accepted functional rows and PR006/PR007 OPEN;
B1-STAGING-READY is not declared before current staging controls pass;
B1-FINAL-ACCEPTED is not declared. These labels do not replace canonical gates.

## Reuse for B2 and B3

B1 already implements AUTHZ-001..007: seven actions, role/user rules, temporary
windows, deny precedence, tenant/resource scopes and audited CAS changes.
Reuse components/manage-access-panel.tsx, lib/b1/access-http.json,
lib/b1/approved-backend.ts and the approved SQL14 broker/effective-access
capabilities. Existing /auth/access/user, /auth/access/effective and /auth/access
are the consumer boundary; role labels never grant permission. SQL11 browser and
RBAC evidence is retained in closure/requirements.json. Do not create another
permission engine or parallel role catalogue.

B2 can begin an isolated synthetic Users/Manage Access slice by checking the
existing UI/API against its remaining user-management requirements and reusing
that broker. It must preserve fresh context, step-up, deny, CAS and audit controls.
B3 can prepare a separate Companies/Contacts slice with synthetic tenant-owned
records, company/contact distinction, search and No contactar/suppression;
server-derived tenant, API permissions and audit must use the same B1 contracts.
CRM company records must not become tenant identities. No real contact import,
external email or shared staging mutation is implied. Neither successor is
implemented in the B1 correction branch.

### Minimum B3 contract preparation (no B3 implementation here)

Canonical COM-07 is POST /contacts/{id}/suppression, with effective
contacts.suppress, tenant-owned contact_compliance/suppression_list, audit and
401/403/404/409/422 errors (API_SPEC.md, RBAC_PERMISSIONS.md). Bind that permission
through the existing B1 broker in the B3 slice, never a parallel engine or role-name
shortcut. DATA_MODEL.md already specifies data_source, source_url, first_seen_at,
last_verified_at, communication_basis, do_not_contact, do_not_contact_at,
privacy_request_status and retention_review_at. Company is a CRM record with
multiple contacts, not a tenant identity. Suppression prevails in API and workers;
synthetic tests must include foreign-tenant denial, stale/concurrent mutation,
durable audit and no external communication. Concrete CRUD DTO/routes are not
invented as approved contracts by this B1 closeout; B3 defines them in its own
vertical slice against these canonical constraints. B2 reuses Manage Access and
AUTHZ-001..007 rather than recreating them.

No further approval is needed for the authorized isolated engineering work.
Persistent staging SQL/ACL, Hostinger OpenBao installation, merge and real backend
activation each still need their expressly required, concrete authorization.
Manual observations and independent review must be performed by the actual
responsible people; engineering must not self-sign them.

---

# Historical operating acceptance plan and evidence

The following records earlier scopes and constraints. References to beginning no
successor or to Swiss provisioning as the immediate next operation are superseded
only by the explicit owner decision above. Historical PASS/FAIL and formal OPEN
states remain intact.

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

## Current authorized integration follow-up (supersedes preparation status above)

Principal custodian designation is now expressly confirmed as the project owner.
Additional custodians and productive quorum remain undecided. The native private
B1 HTTP/API + PostgreSQL16/SQL14/OpenBao integration and independent fresh-target
recovery have an initial143/143 real PASS; see [source and execution evidence](openbao/integration/EXECUTION_INITIAL.json).
Exact SQL14 was reused with no new SQL/ACL. The complete database checkpoint was
frozen and matched after restore before test API traffic; this is not proof of
operational PITR or permission to revive stale state after uncertain data loss.
The separate final integration record must distinguish subsequent security changes
and their rerun. PR006 remains OPEN for real residence/custody/recovery targets,
independent review and actual manual PO observations; PR007 requires formal owner
acceptance after its prerequisites.42/44; closedBackend; AUTH-GATE-05 OPEN.

Final current integration:144/144 PASS, source08ecbab3e3816f660d635d0ee48b92f92850eb7f,
Actions39150315948. [Full evidence and limitations](openbao/integration/RESULT.md).
The final audit-full injection proves denied append and observes HTTP500; all
failed attempts remain linked. No further technical B1 changes or SQL/ACL installed.
