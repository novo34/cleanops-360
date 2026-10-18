# Authorized synthetic B1 / OpenBao integration

This increment reuses exact SQL14 (authorization and byte hashes checked before
installation), the native OpenBao drill and B1's existing private backend, Argon2id,
TOTP and envelope-v2 codecs. It does not activate routes/runtime or add SQL/ACL.

A private KV-v2 reader loads explicitly allowlisted tenant/purpose/key ID/version
references over verified mTLS. A short, explicitly configured request scope owns
and zeroes key buffers; no network calls occur inside decryptTotp. Every subsequent
operation reloads custody material, so unavailability never selects a stale cache
or fallback. AppRole tokens stay private. Remote error bodies are not propagated.
HMAC purposes have separate synthetic keys; HMAC keys are restored identically,
not silently rotated (which would invalidate existing proofs).

Rotation uses a new, create-only key ID. Existing ciphertext retains its old key ID
and immutable AAD and remains readable while its exact version is authorized.
The existing B1 rewrap codec is exercised in memory. No approved method-rewrap CAS
broker exists in SQL14; this drill does not update persisted ciphertext through
administrator SQL or claim a production migration. Old-key deletion is not allowed
while dependent ciphertext remains. Real retention/custody procedures still need
operational execution and approval.

The fresh source and restore PostgreSQL16 containers each run native OpenBao on
loopback, network=none, no ports/bind/shared volumes, private tmpfs. B1 uses the
ordinary identity-service login; privileged access is fixture setup / backup restore
only. Independent encrypted Raft and PostgreSQL+roles backups are transferred
privately to a new cluster with a new data directory. Compare all32 table contents
before any restored API calls, then test existing session, factor, counter, audit,
mail envelope, cross-tenant denial and logout through actual private B1 HTTP/API.
No new browser result is claimed by this API drill. Previously accepted Chromium
evidence remains historical and is not recredited as this OpenBao integration.

Run: npm ci --ignore-scripts; python3 scripts/test-b1-openbao-integration.py
Report: artifacts/pg-consolidated-14/report.json (redacted only).

The original47-check OpenBao execution is retained. New results are pending until
an actual fresh Actions runner completes. Both containers and private transfer
material must be removed, and preexisting inventories must match. Synthetic two
shares in one harness are not human dual control or approval of productive quorum.
PR006 still requires actual Swiss residency, additional custodians/quorum, real
custody/recovery, release trust and independent review. PR007 requires the owner to
execute and sign the existing manual demonstration; no acceptance is inferred.
