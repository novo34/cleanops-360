# Custody, rotation and recovery — prepared procedure

Operating procedure NOT EXECUTED. The separate isolated/RESULT.md records a
completed synthetic trial; its temporary clusters/keys/snapshots were removed.
No operating cluster, confirmed custodians, productive keys or real custody recovery
evidence exists. The project owner is the proposed principal
custodian, awaiting signed confirmation; secondary is unassigned. Neither name nor
signature is invented. Reference KEY_OPERATIONS.md for existing v2/AAD invariants.

## Custody ceremony and responsibilities

1. Owner confirms principal and names a distinct secondary, infrastructure operator,
   independent reviewer and PO tester; approves each scope and conflict-of-interest.
   Operator maintains hosts/backups but does not automatically receive raw keys or
   enough shares. Reviewer must not self-sign their own implementation.
2. Proposed starting seal: manual Shamir,2 shares/threshold2 for two custodians. It
   prevents unilateral unseal but either custodian's unavailability blocks recovery.
   Alternative2-of-3 needs a named third custodian and reduces absence risk.1-of-2
   permits unilateral unseal and is not recommended. No quorum is activated by this
   proposal. Self-hosted Swiss HSM/auto-unseal is a separate resource/trust decision;
   never make the sole unseal dependency the cluster it must recover.
3. Before init, verify OS/private access/TLS, independent custodian encryption public
   keys and fingerprints through a separate channel, offline recovery media, backup
   destination and no terminal/session recording. Use OpenBao's encrypted-share/root
   output options to the approved public keys; never init into plaintext terminal,
   CI output or a repository file. Each custodian tests only their own encrypted
   share recovery on controlled media. Do not send shares or passphrases in chat.
4. Jointly unseal through verified private TLS using interactive masked input (never
   command-line share arguments). Establish least-privilege administration and audit
   before enrolling workloads; revoke the initial root token after verified delegated
   administration/recovery. Root generation, if needed later, is an exceptional
   threshold-approved, time-bounded ceremony with immediate revocation and review.
5. Keep each share and its encrypted independent backup under separate custody and
   decryption control; never bundle all decryption factors with Raft snapshots. Verify
   physical/media/support residence in Switzerland and record fingerprints/access
   evidence only. No shared password or combined recovery ZIP held by one operator.
6. Signed custody record includes identities/consents, environment and release/config
   hashes, share indexes/fingerprints (no values), threshold, storage locations,
   custody transfer, incident contact and review/expiry dates chosen by owner.
   Departure/loss: revoke workload/admin authority, perform approved rekey/reshare
   with required threshold, test remaining restore material and invalidate obsolete
   shares. Do not destroy the last recoverable set before successful verification.

## Inventory, key states and rotation

Use purpose-separated AEAD/HMAC keys; preserve exact environment/tenant scope and
immutable key ID/version. Key states: write+read → read-only → retirement-authorized
→ destroyed. Distinguish sealed-service unseal shares, TLS keys, application data
keys, and backup encryption keys; none is an interchangeable recovery substitute.
Key inventories contain metadata, approved readers and retained-backup dependencies,
not bytes. Record actual workloads and key consumers before creating ACLs.

- Generate new application data keys only in an authorized custody boundary with
  approved CSPRNG. Enable new writes only after recoverability validation; retain
  old immutable read versions. Approve per-key nonce budget/alert threshold and
  rotation review interval from measured traffic, counting discarded encryptions.
- Same-data-key wrapping rotation does not change application key ID/AAD/ciphertext.
  Verify old wrapped backups before retiring wrapping dependencies. OpenBao barrier
  key rotation is NOT automatic re-encryption of B1 data keys or TOTP/EMAIL records.
- TOTP data-key rotation: exact old key + immutable AAD authenticate first; reseal
  with fresh96-bit nonce and new version-bound AAD; CAS old ciphertext/key_version/
  method_version under existing locking, preserving UUID/algorithm/global counter.
  No stale write after revocation or concurrent verification. The persistence writer
  and actual OpenBao resolver are not supplied by this preparation; if existing SQL
  lacks the necessary authorized writer, propose ONE consolidated change before use.
- EMAIL: retained/in-flight outbox must remain decryptable with its recorded version;
  missing key or uncertain delivery goes fail-closed/quarantine, never blind retry.
- HMAC rotation is NOT AEAD resealing. OTPs, recovery digests, abuse buckets, owned
  idempotency/audit and cursor keys have different retention/version dependencies.
  Current composition-scoped HMAC callbacks cannot silently gain multi-version
  verification. Prepare reviewed migration/reissue/revocation before switching;
  never invalidate recovery/OTP/abuse controls by simply replacing a key.
- Compromise: contain reads/writes, revoke identities, preserve private evidence,
  decide explicit factor/session/recovery revocation and re-enrollment. Key rotation
  alone does not undo secret disclosure or make old backups safe to distribute.

## Backup and verified restore

Backups include OpenBao Raft snapshots, exact config/policy/role/mount manifests,
key-version metadata, encrypted custody recovery records, TLS trust dependencies,
PostgreSQL PITR/WAL, required B1 configuration/files and time/reference inventories.
A snapshot is barrier encrypted; independent outer encrypted backup custody and
Swiss separate storage are still necessary. Snapshot permission exposes the entire
sealed store and must never be assigned to application identities.

Frequency must demonstrate approved RPO≤15min; choose/approve concrete cadence,
retention and failure alerts after measuring snapshot duration/backup lag. Daily
PostgreSQL backup plus continuous WAL remains canonical. Do not invent an OpenBao
retention/quota or infer these recovery targets from one small CI pg_dump.

Future commands ONLY on named authorized isolated endpoints with secure credential
injection, private CA and no command tracing (no secrets in parameters):

```sh
bao status -format=json
bao operator raft snapshot save /approved-private-staging/backup.snap
# After manifest/hash verification, new restore target, threshold unseal and review:
bao operator raft snapshot restore /approved-private-staging/backup.snap
```

Normal snapshot restore verifies seal consistency and is appropriate only where
that seal is already compatible. A genuinely fresh recovery cluster initialized
with temporary bootstrap credentials has a different seal; it needs the documented
`/sys/storage/raft/snapshot-force` path to recover the old cluster. This is NOT a
corruption/unknown-seal bypass: separately approve the exact fresh target and
verified snapshot/hash, prove possession of the original quorum before proceeding,
isolate the target from the source and temporarily assign only the separate
restore-breakglass policy. After force restore, unseal with the ORIGINAL snapshot
custody shares, revoke restored/temporary administrative and workload credentials
as required and verify the full state before allowing test traffic. Never force
restore into the source cluster, accept an unauthenticated/corrupt snapshot, or
reinitialize an existing cluster to conceal missing custody. No forced operation
or policy installation is authorized or performed by this package. Encrypt a snapshot before copying
it out of controlled staging, retain checksum/signature/sequence outside the same
failure domain, and redact status IDs/network topology in public evidence.

Measured drill: freeze synthetic writes/record monotonic state and recovery point →
backup keys/catalogue/DB/config coherently → simulate host loss with a NEW approved
recovery target → restore same authorized release/trust/seal dependencies → unseal
under threshold → validate old/new key versions and denied cross-scope access →
recover PG/files/config → invalidate restored ACTIVE/PREAUTH/trusted/OTP states as
required → real login/MFA/recovery/outbox and rollback/CAS tests → measure RPO/RTO →
verify teardown and original inventories. Never reconnect stale snapshot sessions,
replay a consumed recovery code, reset a global TOTP counter or deliver stale OTPs.
If monotonic security state cannot be proved, fail closed and execute approved
revocation/re-enrollment; record any required SQL contract gap, do not bypass it.

Each drill record: actual operator/custodians/reviewer, approved target IDs, start/
finish timestamps, last committed recovery point, observed loss window and duration,
hashes and safe assertion results. Failed/blocked steps remain visible. No mock,
empty record or documented command counts as execution.

Pinned restore semantics reference: https://github.com/openbao/openbao/blob/v2.7.1/website/content/docs/api/system/storage/raft.mdx (normal snapshot vs snapshot-force). This source review is not a restore execution.
