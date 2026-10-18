# B1 — manual Product Owner demonstration, isolated acceptance only

Status PREPARED / NOT EXECUTED BY PO. This checklist is not an acceptance signature.
B1 and AUTH-GATE-05 OPEN, closedBackend retained. No production authorization.

## Preconditions and actual participants

Product Owner: repository owner; actual tester/date not yet recorded. Engineer/QA
supplies exact source SHA, SQL13 blob/hash, approved 12h/24h configuration and
redacted reports. Independent security reviewer and actual Swiss OpenBao/custodian
are not yet designated. Do not invent identities, infrastructure or evidence.

Use a newly owned isolated PG16 Docker with synthetic fixtures and the existing
private browser test composition only (`scripts/pg-consolidated-13.py`,
`scripts/b1-real-browser-server.mjs`, `scripts/pg05-browser-backend.ts`). This
composition proxies loopback TLS to the existing UI and real ordinary-role handler;
it never changes runtime.ts or exposes fixture RPC/key/proof endpoints over HTTP.
The database has no public ports/network/shared mounts. Do not send CI OTP/URI or
credentials in tickets, artifacts or logs. Controlled external mail/custody remain
explicitly synthetic; do not present them as productive delivery/OpenBao integration.

CI directed repeat command, when a new authorized isolated run is needed:
`B1_SQL13_GROUP=browser python3 scripts/pg-consolidated-13.py`.
This executes automated Chromium evidence, not manual PO acceptance. An actual
manual browser session must be on an explicitly owned isolated workstation/runner;
no shared staging/deployment or public forwarding is permitted by this task.

## Demonstration and observable acceptance record

For every row record tester, source/build/environment, date, actual outcome and
redacted durable-effect inspection. Never copy codes/cookies/keys/recipients.

|Step|Actual action and expected result|Existing evidence / criterion|
|---|---|---|
|1|Wrong credentials and abuse limits show safe errors, no enumeration/session; correct credentials still require MFA.|remaining abuse evidence; AUTH001/002, SEC020|
|2|Two eligible companies after password: choose destination, rotate both PREAUTH/CSRF, old pair rejected; no ACTIVE until destination MFA commits.|SQL13 browser ROT01/14; V4 HTTP_CONTRACT and TEN001–004|
|3|TOTP first enrollment displays QR once; actual tested KeePassXC2.7.6/OATH Toolkit2.6.11 Linux code completes MFA; invalid/expired/reused code fails.|AUTHENTICATOR_EXECUTION.json; AUTH003/004. No mobile/GUI compatibility claim.|
|4|EMAIL enrollment and verification use a verified synthetic recipient, encrypted persisted outbox, worker delivery simulator; expiry/retry/uncertain quarantine safe.|Existing EMAIL/recovery reports linked per criterion in closure/requirements.json; actual SMTP not claimed.|
|5|Account recovery/reset: single-use recovery and independently authorized synthetic reset; password-only second browser cannot steal enrollment; revoked sessions/trust fail.|SQL08/09 published real Chromium evidence.|
|6|Register/list/revoke trusted device through current session and step-up; 30-day trust never bypasses MFA or extends absolute session.|SQL10 and SQL13 policy evidence.|
|7|Inspect/revoke own sessions and logout; reset/revocation invalidation persists. Compare sensitive12h/30min and operational24h/8h; exact expiry denied.|SQL13 policy evidence; mixed-role aggregation explicitly pending SQL14, not demonstrated as complete.|
|8|Allowed/denied AUTHZ changes, role reactivation and existing-session effects; cross-user/company and stale policy/CAS rejected.|SQL11 existing333 checks/Chromium and SQL13 directed regression.|
|9|Generic POLICY_DENIED / STEP_UP_REQUIRED preserve ACTIVE and produce private durable keyed journal; terminated primary transaction never returns a business success/cookie.|SQL13 AUD01/02/04/05 and COMMIT tests.|
|10|Malformed inputs, stale browser and network retry recover safely; no secrets/URI/ciphertext/private recipients/internal authorization details in HTTP logs/storage.|Existing frontend and directed regression evidence.|

## Acceptance boundaries and exact remaining actions

Technical isolated evidence is accepted individually in closure/requirements.json;
not all44 are accepted. Finish approved most-restrictive role-risk integration only
after owner authorization of the separate exact SQL14 candidate and real tests.
Then record remaining mandatory technical results and the independent review.

Operational acceptance requires actual designated Swiss OpenBao infrastructure and
custodian, workload identity/least privilege and tenant/key isolation, old/new key
rotation and recovery/restore evidence, custody/access/residence of storage/backups
and support, and required RPO≤15min/RTO≤4h measurement. Current Docker dump/restore
and synthetic key callbacks are not those operational drills. Owner/DevOps/Security
must supply actual resources and separately authorize real infrastructure exercises.
D4 verified-recipient/attestation responsibility and external delivery boundary need
named operators and separate authorization before external SMTP.

Product Owner must record the actual manual results and sign the existing
PHASE_ACCEPTANCE_TEMPLATE only after its required evidence. PR006/PR007 and
AUTH-GATE-05 remain OPEN until that decision. Technical isolated acceptance never
implies authorization to deploy, merge, provision production or activate runtime.
