# Actual synthetic OpenBao validation — PASS, not PR006/PR007 acceptance

Source80f441fd4c488f7856271e0487b206afcd667a4b;
[Actions39147433440](https://github.com/novo34/cleanops-360/actions/runs/39147433440),
job117734026652.47/47 check executions PASS; raw redacted provenance EXECUTION.json.
OpenBao2.7.1 Linux/amd64 asset SHA256
0e2f1ce10d124e03112b50dd2fbec6b78003783253bc3a91587938f39d1e2243.
Pinned digest verified; independent release signing trust was NOT verified.

## What actually ran

Two NEW owned network-none, read-only-rootfs Docker containers with writable private
tmpfs, all capabilities dropped, no-new-privileges, no public ports/bind/shared
volumes. Separate primary and restore storage; no original cluster data directory
was copied/shared. Preexisting container/network/volume inventories unchanged;
containers and host temporary material removed, cleanup PASS. No PostgreSQL, SQL,
operational ACL installation, B1 runtime modification or external mail executed.

- Native server loads the rendered JSON with synthetic fixture-only loopback/DNS/TLS
  paths and narrowed loopback CIDRs recorded explicitly in the report. No TLS/audit/
  policy check was removed to obtain PASS. This is not byte-identical productive
  config or proof that a public/private address establishes residence in Switzerland.
- Verified TLS/mTLS accepts the owned client and rejects missing client certificate
  and foreign CA. Synthetic2-of-2 Shamir initialization rejects one share; both
  shares unseal. Both trial shares are held by the harness, not two actual people.
- Prepared exact tenant/purpose policies and AppRole roles: wrapped/single-use
  SecretID, wrapping replay denied, no inherited default policy. Cross-tenant, wrong
  purpose, metadata/list/raw/sys/policy mutation access denied to ordinary tokens.
- Required KVv2 CAS, create-only new IDs, no overwrite/delete/read for creator; actual
  simultaneous CAS0 has exactly one winner. Old/new exact data-key versions read via
  ordinary verifier and generic AES256-GCM resealing/tamper/wrong-scope denial PASS.
  This test uses a SYNTHETIC AEAD payload, NOT B1's exact envelopev2/SQL method writer.
- Token expiry and immediate revocation PASS. Private audit contains events without
  tested key/token/plaintext values. Actual full audit filesystem produces HTTP500,
  and removing only the injected filler restores service; logging was never disabled.
- Least-privilege snapshot reader cannot restore. Snapshot outer AES256-GCM
  encryption/integrity and tampered tag denial PASS. Fresh target's normal restore
  rejects incompatible seal; ordinary restore identity cannot force. The separately
  prepared snapshot-force recovery capability succeeds on the owned NEW target.
- Original snapshot quorum unseals the restored cluster; old/new values and AEAD
  material match. Snapshot-era workload identities explicitly revoked in quarantine;
  newly authenticated ordinary AppRole retains tenant/purpose isolation. Synthetic
  initial root tokens revoked at the end of each drill, not retained as runtime auth.

Measured synthetic restore portion15.507s includes target initialization/unseal and
checks. It is NOT a claim of full B1 RTO, RPO, actual Swiss disaster recovery,
independent custody or durable monotonic application-state recovery. Restoring a
snapshot does not automatically preserve later token revocations; explicit quarantine
and credential invalidation were exercised, not represented as an intrinsic guarantee.
No private result bundle, TLS private keys, unseal shares, raw audit/server logs or
backup decryption key was published. Only redacted report and encrypted backup HASH
were retained; synthetic materials were temporary and deleted.

## Finite investigation history, without suppressing failures

ATTEMPT_01 remains FAIL: Docker archive copy into read-only rootfs failed before
server execution. Fixed by streaming into owned tmpfs, retaining read-only rootfs.
ATTEMPT_02 remains FAIL:8-second native initialization timeout; no restore executed.
ATTEMPT_03 remains FAIL: initialization passed within bounded30 seconds, but harness
assumed immediate active-leader readiness after unseal and exactly403 instead of
also400 for reused wrapping token. Audit-fault cleanup lacked a finally block and
archive backup extraction was unsuitable for the sandbox. Corrected readiness,
precise rejected-response checks, guaranteed filler removal and streaming extraction.
Final HTTP500 audit-denial observation is retained, not relaxed. No permission,
server security feature or SQL was changed to disguise any failure.

## Reproduce

A NEW disposable Linux/amd64 runner with Docker, Python3 and OpenSSL is sufficient;
no final home hardware or productive secrets are needed.

```sh
python3 -m py_compile scripts/test-b1-openbao-isolated.py
node --check scripts/openbao-isolated-worker.mjs
python3 scripts/test-b1-openbao-isolated.py
```

Workflow `.github/workflows/b1-openbao-isolated.yml` is one-shot for this authorized
increment; ordinary documentation pushes do not silently repeat the trial. Bootstrap
root is used ONLY for test setup/custody operations; ordinary AppRole, creator,
snapshot and restore capability calls supply the functional positive/negative proofs.
Secret-bearing IPC is captured privately, never echoed or uploaded. Subprocesses
are bounded; finally removes only resources carrying this exact run's owner label.

## PR006 — what is validated now versus genuinely pending

|Existing obligation|Evidence now|Still required before full acceptance|
|---|---|---|
|OPS03/04 native TLS/config/least privilege|Actual synthetic checks PASS|Real Swiss host/identities, release signer trust, approved operating parameter/config/ACL hashes; no productive readiness inferred|
|OPS05 threshold/root discipline|Software2-of-2 and end-of-drill root revocation PASS|Named independent custodians, explicit quorum, encrypted share custody/transfer/absence rehearsal with real people|
|OPS06/07 actual B1 custody/lifecycle|Real KV version isolation and generic AEAD key rotation PASS|Actual B1/OpenBao resolver, exact envelopev2 persistence/CAS and HMAC version/migration integration. Those technical trials can advance in isolation; they do NOT require purchase of final hardware and are NOT implemented by this harness|
|OPS08 recoverability|Encrypted OpenBao-only fresh-target restore and post-restore limited-identity checks PASS|Complete coherent B1/PG/files/config/key restore, monotonic OTP/recovery/session handling and measured RPO≤15min/RTO≤4h; physical/Swiss offsite recovery evidence|
|OPS01/02/09 operating people/residence|Owner's Swiss home-host decision recorded; final hardware not needed for current trials|Actual resource/site/backup/support boundaries, confirmed principal/secondary, verified-recipient/recovery responsibility and any separately authorized external-delivery boundary|
|OPS10/11/12 review/manual/phase|Existing10-step PO dossier and blank acceptance record preserved|Actual independent review, manual observations and formal PR006/PR007/phase acceptance|

The earlier REC01–12 plan is NOT collectively promoted to PASS: cert revocation/
expiry, full application recovery, unavailable-custodian/media loss and other operating
subcases were not all exercised here. Reuse the precise47 assertions only. No mobile
authenticator or SMTP delivery is newly claimed.

## PR007 and permissions actually needed next

PO runs `docs/implementation/b1/remaining/PO_MANUAL_DEMONSTRATION.md`,
records exact environment/build/SQL/config, all10 real observations and redacted
receipts in the existing blank record. Independent reviewer supplies their own
identity/findings/closure report; engineer must not self-sign. Only after complete
PR006 and all44 rows/gates may PO record formal phase acceptance. No merge/deployment
or successor module is implied.

No further permission was needed for this completed synthetic trial. Technical B1/
custody interoperability tests may use synthetic isolation without buying hardware;
no new SQL/ACL or productive runtime change is implicitly authorized. For actual
installation: first confirm custodians/quorum, identify the Swiss home/VPS and backup/
restore resources, approve exact rendered config/policies/TTL/retention/nonce budgets,
then authorize that specific non-production installation and operational drill.
Current authorization does not provision the home server or choose people for owner.

B1 remains42/44; PR006, PR007 and AUTH-GATE-05 OPEN, closedBackend unchanged.
