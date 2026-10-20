# B1 current result — SQL13 isolated execution

B1 **41/44 isolated functional requirements accepted**, B1/AUTH-GATE-05 OPEN,
closedBackend unchanged. This is not formal phase, operating or productive acceptance.

SQL13 exact approved blob7a2df8463e6c1a45b2a2c9005187c0269d2cf423,
SHA256a052d028206d004b17c375bc56868d86c4014fc4dd72e0d78d8fdb49b741b279,
installed from zero in owned isolated PG16. Full approved diff verified; only owned
PREAUTH rotation and POLICY_DENIED/STEP_UP_REQUIRED codes.24/24 prepared directed
cases PASS; see SQL13_VALIDATION_PLAN.json and consolidated-test-13/ACCEPTANCE_EVIDENCE.json.

Six real report groups contain615 check executions INCLUDING repeated setup/catalogue/
isolation/backup checks,32 Chromium executions. Do not call these615 unique tests or
requirements. Native/temporal/null/ACL tests,12 new HTTP/Chromium cases,10 policy
cases and10 directed ACTIVE-switch/AUTHZ regression cases all PASS. Every owned
runner cleaned its resources, inventory unchanged;31-table backup/restore PASS.
Historical failed attempts remain in Actions; no failure is reclassified as PASS.

Newly accepted REQ-AUD-001: generic denied guards commit approved pseudonymous
journal without effects; primary termination rolls back business effects and a
separate restricted transaction durably records the trusted denial. If both journal
transactions fail, the operation remains failed; no persistence is claimed. Lost
COMMIT acknowledgement with durable rotation returns no cookie and requires fresh
credentials rather than assuming rollback. Current multi-company password→selection→
rotated PREAUTH/CSRF→destination TOTP→ACTIVE real UI/API/PG passes.

Numeric policy: approved sensitive12h/30min, operational24h/8h implemented and real
before/at/after exact application-clock boundary tested against PG-backed sessions.
Real database expiry independently tested; activity, step-up and Trusted Device do
not extend absolute expiry. The private exact-boundary fixture changes only test
clock/data, never SQL functions or production clocks. ROLE aggregate remains absent
from SQL13, so SEC021 remains OPEN; no complete policy PASS or technical closure.

SQL14 is one separate consolidated REVIEW ONLY source/candidate with exact full diff
and hashes in revisions/14/manifest.json. It proposes a private read-only tenant/role
risk catalogue, most-restrictive helper, use by existing material/issuance and current
session ceiling revalidation. No installation or new SQL/ACL is authorized by this
report. No role labels, fictitious production UUID catalogue or service writer is
invented. Static parsing is not actual PG compilation/security acceptance.

Remaining:
- SEC021 — owner authorizes exact SQL14; engineer/security execute mixed-role,
  policy/race/expiry/ACL tests in fresh isolated PG16 before acceptance.
- PR006 — independent review, actual Swiss OpenBao/custody/isolation/rotation/recovery
  and required operating evidence, actual manual Product Owner demonstration.
- PR007 — formal Product Owner B1/AUTH-GATE decision only after all mandatory evidence.

PO_MANUAL_DEMONSTRATION.md is prepared, NOT manually executed or accepted. Actual
TOTP app evidence remains KeePassXC2.7.6 and OATH Toolkit2.6.11 Linux CLIs; no mobile
compatibility is claimed. No production/deploy/merge/SMTP/real infrastructure executed.
