# D2 — operational key specification (PROPOSED, provider-neutral)

Envelope v2 AES-256-GCM and its exact AAD remain unchanged. This specification is an
approval artifact, not configured custody, a key service, SQL authorization or activation.

## Inventory and separation

Inventory each immutable key ID with environment, purpose, authorized tenant scope,
algorithm/size, custodian, Swiss storage/processing/backup locations, creation state,
writer/readers, usage counters and retention dependencies. No key bytes in the inventory.
Separate TOTP AEAD, EMAIL payload AEAD, OTP HMAC and audit pseudonymization keys;
never reuse enrollment encryption as mail encryption or HMAC material.
Separate production, staging, development and test keys, identities, catalogs and backups.
Unit-test Buffer keys have no operational meaning.

Proposed isolation baseline for approval: tenant-and-purpose scoped data keys, with a
separate wrapping/control plane. The exact mapping and whether any sharing is justified
must be owner-approved before use; no global fallback key. A server resolver derives
tenant/environment/purpose from authenticated locked context and catalog policy, never
from a browser key ID. Existing ciphertext carries its immutable data-key version.
AAD independently binds tenant/user/method/initial generation/algorithm/key version;
AAD does not limit the blast radius of a stolen shared key.

Logical access separation to approve: identity verifier reads TOTP data keys only;
mail worker reads mail payload keys only; issuer encrypts mail through its approved
encrypt capability; operations rotates/retires with dual control; recovery identity is
separate, time-limited and audited. These are proposed responsibilities, not granted
roles, provider accounts or fictitious service identities. Browser, generic runtime,
CI, database logs and support tooling receive no raw keys.

## Custody and residence acceptance evidence

Owner must name real custodian and implementation, control of wrapping keys, identities,
least-privilege policy, Swiss region(s), storage/compute/replica/backup/support access
locations and contractual evidence. Encryption at rest alone does not prove Swiss residence.
No provider is selected. Reject a deployment lacking evidence, including cross-region
replication, telemetry or break-glass export paths outside the approved boundary.
Credentials use the approved workload identity/secret injection mechanism, not repository
files, build args, URLs or logs. CI must have synthetic keys only.

## Lifecycle and rotation

States in the operational catalog (not database schema): write+read, read-only, disabled,
retirement-authorized, destroyed. State transitions require identity, reason and inventory
evidence, with no raw key/secret audit data. A compromised key is not silently substituted:
freeze new use, investigate, decide revocation/re-enrollment and account recovery explicitly.
Disabling a required read key fails closed; it is not permission to decrypt with another ID.

1. Generate a fresh 32-byte data key using an approved CSPRNG/custody boundary and a fresh
   immutable key ID; validate environment/purpose/tenant and back up through approved custody.
2. Enable new writes only after recovery verification; old key becomes read-only, not deleted.
3. For data-key rotation, decrypt using exact old ID, authenticate v2 AAD, reseal identical
   plaintext with fresh 12-byte random nonce, explicit 16-byte tag and new ID in AAD.
4. Future persistence must CAS old method_version+ciphertext+key_version. Preserve method
   UUID, algorithm, global last_totp_counter and created_at; trigger bumps method_version.
   On CAS failure discard candidate and restart from fresh locked material, never overwrite
   a newer counter/state. No persistence writer is implemented by this proposal.
5. Keep old ciphertext/key readable until complete inventory and retained-backup recovery
   evidence permit retirement. Never change key bytes behind an ID or merely relabel data.

Wrapping-key rotation is different: rewrap the SAME data key in custody; if its bytes/ID
are unchanged, no TOTP ciphertext rewrite or method generation change follows. Test old
wrapped backups before retiring the old wrapping key. A data-key change requires step 3.

The isolated rewrapEnrollmentSecret helper implements only decrypt/reseal and transient
buffer wipe, rejecting unchanged key-version labels. It is not a resolver, distributed CAS,
key retirement workflow or proof that JS/library/string copies have been erased.

## Nonces, availability and recovery

96-bit random nonces require a per-key write/rewrap usage budget; collision probability
is approximately N(N-1)/2^97. Security owner chooses the budget/alert threshold after
traffic estimation; no production quota or rotation interval is invented. Count failed/
discarded encryptions too. Do not roll back RNG state with database backups or VM clones.
Enforce catalog availability, exact-version lookup and authenticated decryption failures
as generic dependency errors; never log raw provider responses containing secret material.

Recovery rehearsal uses synthetic fixtures first: restore catalog and key wrapping records,
read both old/new versions, restore ciphertext/counter/generation consistently, and test
missing key, wrong tenant/purpose, tampered tag, stale CAS and revoked credentials.
Production recovery requires a separately approved RPO/RTO, retention schedule, dual-control
custodian runbook and evidence of Swiss restore locations. Do not rewind a live global TOTP
counter or restore stale ACTIVE sessions. If monotonic state cannot be established after
restore, fail closed and use approved revocation/re-enrollment, never accept older counters.

Outstanding D2 approvals: real custodian/provider and Swiss evidence; scope mapping;
workload/recovery access; lifecycle/revocation policy; nonce budget; RPO/RTO and retention;
monitoring/redaction and recovery drill acceptance. No provider, key alias, credential,
production key or numerical operational default has been configured.
