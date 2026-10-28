# Hostinger synthetic staging — prepared, NOT DEPLOYED

PO decision 2026-10-19: reuse the existing shared test VPS, even outside Switzerland,
only fictional data and staging-exclusive credentials. No customer/employee data,
production DB copies, external mail, new costs or changes to other projects.
This supersedes Swiss-location preconditions FOR SYNTHETIC STAGING ONLY.
Production PR006/PR007/AUTH-GATE-05 requirements remain unchanged.

## Real components and current boundary

Base compose.yaml is the existing web + PG16 packaging from staging c85b4987.
The included, profile-gated compose.openbao.yaml adds native pinned OpenBao2.7.2 on the SAME VPS,
not a new VM: read-only/non-root image, independently verified signed binary checksum, 512MiB/0.5CPU
trial limits, private mTLS, persistent project-specific Raft and audit volumes.
These are configurable trial limits, not production sizing or proof of capacity.
Only amd64 is currently packaged; confirm the VPS architecture before use.

Readiness checks require initialized AND unsealed OpenBao; sealed/uninitialized,
wrong CA/client and transport failure stay unhealthy. No automatic init/unseal,
tokens in environment/build args, hidden key fallback or production quorum.
Audit raw=false, accessors HMACed; existing exact ACL renderer reused unchanged.
The base web remains closedBackend, with no key mounts or privileged SQL login.
No new incomplete worker/Redis/broker service is claimed as operational.
The existing private PG/OpenBao composition remains the validated test consumer.
It cannot be exposed online by repurposing its Docker/IPC fixture endpoints.

## Files and offline preparation

RESOURCE_RECORD.json separates STAGING_SYNTHETIC and PRODUCTION_SWISS. The original
formal docs/implementation/b1/operational-acceptance/staging-candidate/RESOURCE_RECORD.json
is preserved unchanged; it is not reinterpreted as non-Swiss production evidence.
Production quorum2-of-3 is only an unapproved alternative; principal owner confirmed.

1. After separate permission to access the VPS, measure memory AVAILABLE after
   other projects, disk free, CPU headroom, architecture and network conflicts.
   Record UTC timestamp and project-isolation verification. No host access occurred.
   Unknown/low/stale (>24h) metrics BLOCK capacity approval. No Swiss-country check
   is imposed on this synthetic record.
2. Use scripts/prepare-staging-synthetic.py --record /private/resource.json.
   Exit2 means BLOCKED, not a deployment error to ignore. Default build-inclusive
   headroom is4608MiB available,2000millicpus and8192MiB free storage; these are
   conservative rehearsal budgets, not extra resources being contracted.
3. If in-host builds do not fit, use verified prebuilt image digests and
   compose.prebuilt.yaml (Compose !reset support required); PREBUILT mode removes
   only build headroom, requiring3072MiB runtime/reserve available. Build/export
   elsewhere within existing authorization, then review exact digests. No registry,
   new VM or paid resource is provisioned automatically. If runtime still does
   not fit, leave OpenBao profile OFF and retain isolated CI as the alternative.
4. Complete the private subnet/IP after checking conflicts. Supply existing
   renderer inputs with environment=staging-synthetic, api_dns=openbao, exact
   one-tenant scopes and workload_cidrs equal to the custody /24. No wildcard
   policy or new SQL/ACL contract.
5. Render offline:
   python3 scripts/prepare-staging-synthetic.py --record /private/resource.json --inputs /private/bao-inputs.json --out /private/new-bao-package
   Output includes server/ACL/AppRole JSON and hashes; no server or keys created.
   Even BLOCKED capacity may render review artifacts, never authorize applying.
6. Keep the permanent Dokploy branch staging, compose path deploy/staging/compose.yaml,
   project cleanops-360/environment staging/service cleanops-staging. Autodeploy is
   reported disabled by the owner at 2026-10-28 12:31:16 UTC; do not change it.
   Changes exist on the B1 development branch only until reviewed staging integration.
   Do not repoint Dokploy at the feature branch.

The canonical Compose Path now includes compose.openbao.yaml exactly once.
Use only -f deploy/staging/compose.yaml, never add -f compose.openbao.yaml.
The existing consolidator follows that entrypoint; do not deploy a second
consolidated copy or add the historical ingress overlay to the observed Dokploy
ingress. Current instructions: openbao/OPENBAO-STAGING-01.md.

Required order BEFORE integration: prepare required non-secret configuration,
private files and variables → verify Dokploy effective render preserves ingress,
web/PG and volumes → obtain integration/installation authorization. A disabled
profile does not guarantee parsing compatibility when required variables are
missing. Autodeploy is reported disabled; do not change it or repoint Dokploy.

## Future synthetic secret ceremony — not executed

Generate a STAGING-ONLY CA, server certificate with SAN DNS:openbao and separate
client certificates, including the health client. Use OpenSSL/private files under
an owned staging directory outside Git; no public/production CA private material.
Mount workload-ca.pem, server-chain.pem, server-key.pem, health-client.pem and
health-client-key.pem read-only. Give image UID/GID1000 read permission without
world-readable keys, no private CA signing key in the container. Verify expiry/SAN.
Backup/decryption key files are32 raw random bytes, mode0600, independently stored.
PG bootstrap password file remains unobserved on the VPS and must be created ONLY
after explicit authorization, outside repository/logs.

Initialize test-only unseal material through secure local CLI with output redirected
to a private mode0600 file; a single-harness1-of-1 initialization is used in CI solely
to test persistence, NOT an approved human/production quorum. Do not copy these
shares or keys into production. Root is temporary: enable exact KVv2/CAS and existing
reviewed AppRole policies, create staging-only32-byte keys and single-use wrapped
SecretIDs out-of-band, verify denials and revoke root. Snapshot identity is distinct.
Do not expose OpenBao to Traefik; no host8200/8201 or database port publishing.

## Exact future Dokploy sequence (requires explicit deployment authorization)

Use openbao/OPENBAO-STAGING-01.md for the current observed same-staging procedure.
No whole-project redeploy, extra overlay -f, SQL installation or B1 activation is
authorized by this preparation. Preserve the effective Dokploy ingress injections.

## Acceptance tracks and browser checks

After explicit permission for the online target:
CLEANOPS_STAGING_BROWSER_AUTHORIZED=yes node scripts/staging-online-check.mjs https://cleanops.nuvurent.com
CLEANOPS_STAGING_BROWSER_AUTHORIZED=yes npx playwright test --config=playwright.staging.config.ts

These assert HTTPS/login UI and auth503/no-store while closedBackend remains.
PASS is boundary/readiness evidence, NOT full B1 acceptance. No public functional
auth bypass or fixture API is added. Full online B1 login/MFA/PG/Bao E2E and PO
steps remain BLOCKED until the corresponding AUTH-GATE-05 decision and explicit
controlled activation authorization; this constraint cannot be removed by a
synthetic label. Reuse existing private SQL14 browser suite for isolated coverage,
not as a claimed online PO result.

PO_STAGING_RECORD.json reuses the ten canonical manual steps with PASS/FAIL/
BLOCKED/NOT_EXECUTED results and actual owner observations. Functional staging
approval does not rewrite canonical PR006/PR007 or Swiss-production records.
Production still needs residence, approved custodians/quorum, independent review
and coherent independent recovery/RPO/RTO evidence. No44/44 inference.

## Synthetic backup, restore and rollback

The maintenance project identity is STAGING_SYNTHETIC.composeProject in the
canonical deploy/staging/RESOURCE_RECORD.json: cleanops360-f4fxmd. A private record
must match that project and composePath exactly. Maintenance validates the same
canonical Compose with config --format json before exact-service discovery, then
requires matching project/service labels and no published ports. It uses inherited
required Compose variables; missing/invalid configuration fails closed before
reading the token or running backup. It does not search alternate projects.

Before any future stateful test changes, stop/deny new synthetic writes at the
approved boundary and record the checkpoint. With backupAuthorized=true and a
snapshot-read-only token FILE (not root/workload token):
python3 scripts/staging-maintenance.py --record /private/resource.json --snapshot-token-file /private/snapshot-token --key-file /private/staging-backup-key --out /private/backups/new-checkpoint.enc

The record must name that dedicated backup destinationDirectory; the tool rejects
an output outside it, including another project's directory.

This encrypts PG dump+roles(no passwords)+Raft snapshot in an authenticated
STAGING_SYNTHETIC archive. Add the frozen renderer manifest, public TLS trust,
exact image digests/config and private custody references to the checkpoint
inventory; store required TLS private material separately under staging custody.
This tool is not WAL/PITR, automatic scheduling or production-coherent recovery.
Keep backup location separate from other projects; same-VPS copies are NOT
independent disaster recovery. No production retention/RPO claim is made.

Restore transport (only to a new private output file):
node scripts/staging-archive.mjs decrypt checkpoint.enc new-checkpoint.tar /private/staging-backup-key STAGING_SYNTHETIC
Wrong key/tag/truncation must leave no output. Never extract an untrusted tar or
overwrite an existing target. Inspect known member names and manifest first.
PG restore is to a NEW isolated staging target with its own project/volumes;
restore roles (excluding target bootstrap conflicts), then pg_restore with
--exit-on-error. OpenBao normal restore needs compatible seal; fresh-target force
restore requires explicit target/hash/original-test-share authorization and is
NOT executed by these tools. Keep restored sessions/OTP/trust/outbox quarantined;
no stale authority is revived. Validate exact versions and ordinary-role denials.

Rollback pins the previously verified application image/source, keeps existing
stateful volumes, and disables owned ingress/profile only if separately authorized.
Never docker compose down -v, prune, reset, force-push or replace shared networks.
For data rollback, recover into NEW owned targets, validate first, then separately
approve cutover. Capture redacted receipts; delete only inventoried temporary
resources. Backups and audit volumes are never removed as application rollback.


## Selective sealed OpenBao capacity scope

For the observed running staging, use prepare-staging-synthetic.py with explicit
--capacity-scope openbao-sealed-addition only for a plan leaving web/PG unchanged.
The default full-stack gate remains 4608 MiB/2000 millicpus. Selective memory is
2816 MiB including the existing 1536 MiB build reserve. CPU peak is max(500,
explicit buildMillicpus), build before runtime; unknown build/CPU remains blocked.
Service limits do not constrain image build. No idle-to-reservation conversion.
Current evidence, completed 2.7.2 signature check and pending build envelope/advisory recheck are detailed in
openbao/OPENBAO-STAGING-01.md. No build or installation was performed.

The selective capacity scope is evaluation-only: --compose-out, --inputs, --out
and --include-ingress are rejected before I/O. Whole-stack Compose and general
workload packages require the default full-stack gate, never selective receipts.
OpenBao 2.7.2 pin/signature verification and four corrected advisories with scope
analysis are recorded in openbao/OPENBAO-STAGING-01.md and its CHECKS report.
A valid signature is not a vulnerability assessment; CPU/build remain BLOCKED.

## MIGRATIONS-01 — primera instalación e historial

Antes de aplicar SQL14, seguir MIGRATIONS-01.md. Se conserva verify-only en
staging-sql14.py y su autorización/ownership; el historial y su envelope proceden
del runner canónico migrate-postgres.mjs. Plan b1 de solo lectura no crea tablas;
--offline-plan no conecta. SQL14 es baseline explícita, nunca migración automática
ni paso suficiente para login. No ejecutar db:migrate foundation en la base B1.
Las inspecciones comunicadas del 28/10/2026 indican base vacía y registro ausente;
se revalidan al aplicar autorizado. Esta preparación no ejecuta SQL/servicios/CI.
