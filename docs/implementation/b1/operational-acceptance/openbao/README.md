# PR006 — OpenBao preparation, not an installed service

Baseline425503d; B1 42/44, SEC021 verified, closedBackend and AUTH-GATE-05 OPEN.
Owner authorized preparation only. No install, initialization, real credential, SQL,
ACL installation, deployment, SMTP or new product functionality is performed here.
This package does not satisfy PR006/PR007 by documentation alone.

## Resources and proposed topology

|Resource|Purpose / boundary|Still required|
|---|---|---|
|Dedicated Swiss non-production Linux VM|One OpenBao2.7.1 Raft node, dedicated OS account, encrypted data disk; TLS/mTLS8200 only from named private workloads;8201 only between approved peers. No public listener, public ingress, shared production account/disk or production trust root.|Actual host/provider/site IDs, region contract, firewall source/destination rules, OS image, CPU/storage approval. Initial capacity estimate2vCPU/4GiB RAM/20GiB disk is a sizing proposal, not a canonical minimum or production SLA; measure audit/storage growth.|
|Independent Swiss encrypted backup destination|Raft snapshots, TLS/config/catalogue manifests and encrypted custody recovery material, separate access/control and failure domain from primary host.|Actual location, storage identity, immutable retention/versioning policy, independent decryption custody and capacity.|
|Fresh Swiss isolated restore target|Loss/corruption/sealed-service drills and full OpenBao+PostgreSQL/config recovery; denied access to production and original cluster.|Actual target and temporary resource inventory; test-only network/identity and teardown approval.|
|Authorized test workload and PO workstation|Existing B1 private composition, real PG16, controlled delivery simulator, private TLS and reviewed workload identities. Browser never connects directly to OpenBao.|Actual approved private route and tester identity; loopback/approved VPN, no public forwarding. No operational runtime activation.|

A single node is the recommended finite initial operating rehearsal, not HA. A
three-node Raft cluster in independent Swiss failure domains is an alternative if
availability is required; it needs explicit extra resource approval. Do not invent
HA acceptance criteria or treat replication as backup. All replicas, logs, snapshots,
DNS/PKI processing, support access and recovery media remain within the approved
Swiss boundary. RFC1918 addresses alone prove neither country nor tenancy.

## Prepared configuration and reproducibility

`release-pin.json` records the observed official2.7.1 release and GitHub asset digests
for Linux amd64/arm64. No binary was downloaded, signature verified or server parser
executed. Choose the actual architecture, independently verify the maintainer signing
fingerprint/channel, signature/checksum and security advisories before any future
installation; a same-release public-key download is not an independent trust anchor.
A replacement release/digest changes the execution authorization request.

`server.template.json` uses upstream-supported JSON configuration, private Raft,
TLS1.2 minimum, required verified client certificate, no UI/raw-storage/introspection,
no automatic plugins, info logs and a private declarative audit file with raw logging
disabled and accessors HMACed. Private paths/identifiers remain sensitive metadata.
Audit files must be encrypted, access-limited and retained under the approved policy,
never attached raw to GitHub. Audit-sink failure must be tested to deny requests;
audit availability is not established by this configuration. With Raft,
`disable_mlock=true` requires swap disabled, core dumps disabled, restricted ptrace
and host-memory access; this is not a claim of zeroizable JS memory.

Offline render only (does not install or contact a server):

```sh
python3 scripts/prepare-b1-openbao.py --inputs /approved/nonsecret-inputs.json --out /new/offline-review-output
python3 -m unittest discover -s tests/static -p test_b1_openbao_preparation.py -v
```

The blank `inputs.example.json` deliberately fails validation. All TTLs, private IPs,
CIDRs and exact tenant/purpose/key paths must be supplied; there is no productive
numeric default. Renderer output is still PREPARED ONLY, not approval to execute.
It renders no private keys, tokens, unseal shares or application key bytes.
Server config must be parsed by the pinned actual binary in an explicitly authorized
isolated rehearsal before readiness is claimed. No shell install/apply script is
provided, so there is no accidental one-command provisioning path.

## Workload policies and role proposal

KVv2 mount `b1-keys`, independent per environment; exact paths:
`b1-keys/data/<environment>/<tenant UUID>/<purpose>/<immutable key ID>`.
No wildcard, list, metadata enumeration, cross-tenant path or generic runtime policy.
Each rendered package covers exactly ONE tenant; mixed-tenant input is rejected.
Actual policy/role names must include that tenant UUID (rendered token_policies do);
install each under its own environment/tenant directory so another tenant cannot
overwrite the same workload policy name. Snapshot/restore identities are explicitly
cluster-scoped exceptional operating roles, never application identities.
The renderer produces an AppRole proposal only for workloads with explicit reads:

|Logical identity|Exact permitted material|Forbidden|
|---|---|---|
|identity-verifier|TOTP AEAD, OTP/recovery/audit/cursor HMAC paths explicitly enumerated|Mail AEAD, other tenants, write/delete, policy/sys/root endpoints|
|enrollment-issuer|Explicit TOTP and mail AEAD keys needed by existing local AES-GCM helpers|HMAC keys, other tenants, lifecycle writes|
|mail-worker|Explicit mail AEAD versions for persisted outbox payloads|TOTP/HMAC, recipient attestation authority, other tenants, mutation|
|key-creator (custodian operation only)|CREATE on individually approved new immutable key IDs|UPDATE/DELETE/LIST, existing key overwrite, root/policy administration|
|snapshot-reader (separate backup identity)|READ `sys/storage/raft/snapshot` only|Restore, raw key reads, sys/policy/role changes|
|restore-operator (threshold-approved recovery session only)|UPDATE `sys/storage/raft/snapshot` only|Forced restore endpoint, policies, key reads, workload use|

AEAD helpers require raw32-byte data keys in their PRIVATE crypto boundary; calling
KV read an encrypt-only or non-exportable capability would be false. This proposal
uses existing envelopev2/AAD; no unapproved Transit ciphertext format is introduced.
Existing backend HMAC buffers are composition-scoped, not tenant-version resolved.
Mapping these to separate real processes/tenant key scopes and HMAC version migration
still requires review and real adapter integration; policies do not implement it.
No current B1 code or SQL is changed to pretend those integrations exist.

AppRole is a proposed machine authentication mechanism, not an approved identity
already provisioned. Each actual workload needs its own role, client certificate,
private CIDR restriction, short explicitly approved token TTL/maxTTL, single-use
SecretID with explicit TTL and response-wrapped out-of-band injection. No default
policy; never root, periodic unlimited token or a common SecretID across workloads.
RoleID is not authentication alone. Broker tokens, wrapping tokens and SecretIDs
must not reach shell arguments, CI, Git, URL parameters, browser or logs. OS/admin
privilege and ability to issue SecretIDs must be reviewed separately from data ACL.
Revoke old tokens and SecretID accessors on workload retirement/compromise.

The human policy/role administrator is a distinct privileged custodial function,
not a workload or the key-creator role. Its ability to install policies/roles is
privilege-granting by definition; exact delegated admin paths and approval workflow
must be reviewed after naming the real identities. No broadly privileged reusable
admin policy/token is rendered here. Recovery operator tokens are issued only by
that reviewed authority during the threshold ceremony, not by snapshot readers.

KV config enables `cas_required=true`, disables automatic version deletion. New
immutable IDs are written with CAS0. ACL parameter constraints are deliberately NOT
used as a claim of nested KVv2 CAS enforcement; mount enforcement and actual create/
update capability separation require negative server tests. No runtime/lifecycle
role may disable CAS, enable mounts or grant itself another policy. Default deny is
relied upon instead of a wildcard deny that would also override intended reads.

Safe activation order AFTER exact authorization: verify host/release/TLS → initialize
custody → configure private audit → enable KVv2 and CAS → install exact reviewed ACL
and AppRole roles → inject synthetic test material/identities → negative capability
suite → actual private adapter integration/tests. Do not expose a key workload before
all prerequisites pass. All these operations are NOT EXECUTED here.

Authoritative sources: SRS PR006/PR007/INF003, previous PLAN.md and KEY_OPERATIONS.md;
upstream pinned reference paths in release-pin.json. Proposed choices (AppRole, KV
scope mapping, seal/quorum, TTLs, budgets/retention) still need named owner/Security
approval; OpenBao self-hosting/Switzerland and the existing B1 policies are not reopened.
