# D4 — verified-recipient EMAIL OTP delivery specification

Status: PROPOSED_REQUIRES_OWNER_APPROVAL. No sender, worker, queue, provider or database
adapter is installed. Design direction does not authorize SQL or real email delivery.

## Trusted recipient and issuance

EMAIL OTP is eligible only for an explicitly enabled method AND a server-proven verified
recipient. principals.email_normalized alone proves neither verification nor ownership.
Canonical V4/B1-X provide the normalized address, but no reviewed address-verification
evidence/version source. Do not invent verification from account existence or ACTIVE method.
Owner must select the authoritative verification lifecycle and approve a minimal additional
broker contract that locks/revalidates the recipient generation with the method. Until then,
EMAIL issuance remains closed even if D1's current signatures are approved.

Required server evidence to specify: principal/tenant/method binding, exact normalized
recipient, immutable verification generation, verified-at and revocation/address-change
status. It must be locked and checked at issuance and immediately before worker send.
Address changes/revocation cancel queued delivery and invalidate old-generation challenges.
No browser destination override, normalization heuristic or mail-worker table bypass.
Issuance requires owned idempotency reservation and current authorization/rate policy.
Generate OTP with CSPRNG; keep verifier-compatible scoped HMAC only in challenge row.

In one future transaction: lock verified recipient/method -> issue bound challenge ->
insert encrypted outbox -> audit safe metadata -> complete owned reservation -> COMMIT.
HTTP returns only safe challenge descriptors, never OTP, recipient, digest, ciphertext,
key/version internals or mail-provider errors. A lost HTTP response must not create
another OTP/outbox for the same committed idempotency request.

## Payload, worker and isolation

Proposed payload schema (not a deployed format): version/domain, tenant/user/method/
challenge/outbox identity, recipient verification generation, exact verified destination,
OTP, issued-at/expires-at and server-controlled template identifier. Encrypt using a
separate mail AEAD key. Bind domain/version/key ID/tenant/outbox/challenge in mail AAD;
do not reuse TOTP envelope as a generic mail serializer. Approval must pin serialization,
size bounds, template handling and exact AAD before implementation.
No plaintext in jobs, transport URLs, logs, tracing, retry errors or dead letters.
Outbox metadata contains no destination/code. Purge ciphertext after terminal handling
according to approved retention; keep only safe audit/dedup metadata.

Worker is asynchronous and separately authorized to read/decrypt mail payloads only.
Claim through a reviewed broker function, retain exact lease ownership, authenticate
payload and tenant/challenge binding, verify recipient/method generation and current
challenge/member/org/expiry, then send outside database transaction.
Recheck before send and enforce provider request deadline before expiry. Delivery
latency can outlive validity; verification still rejects expired OTP, never extends TTL.
No synchronous SMTP or global cross-tenant payload/key fallback.

V4 claim_mail already uses SKIP LOCKED, claim digest, lease, bounded attempts, issued
challenge/member/org and expiry predicates. It DOES NOT return/revalidate reviewed
recipient proof or method generation; its four-column return is insufficient for the
proposed worker protocol. That extension is a separate D4 REVIEW ONLY contract, not
silently included in the frozen D1 package.

## Idempotency, expiry and retries

Reuse exact V4 trial values, not new production constants: email_otp_ttl 300 seconds;
outbox_max_attempts 5, claim lease 60 seconds and retry delay 60 seconds. Only OTP TTL
has APPROVED status in security-values; remaining values keep their existing trial status.
Attempts include the latest claim and never reset on crash/retry. Stable logical delivery
identity is tenant+committed outbox UUID; use the same provider dedup key across attempts.
The isolated emailDeliveryIdempotencyKey hashes that identity and no recipient/code.
Provider key format/support/retention must be validated; a local key is not exactly-once proof.

Isolated planMailRetry takes an explicit policy and returns safe scheduling metadata:
- Known transient failure: retry only below attempt cap and when now+delay < expiry.
- Permanent rejection: stop; do not try another address or factor.
- Provider timeout/unknown acceptance: RECONCILE, never blind retry or mark success.
- Expiry: stop; no new OTP, extended TTL or revived challenge within retry.
No automatic backoff/jitter/provider fallback is invented; any change requires review.

Reconciliation must query provider receipt by the SAME delivery identity where supported.
If unavailable, hold/terminate pending operator-approved policy; do not claim exactly-once.
A provider may support at-least-once only; its residual duplication risk and UX require
explicit owner acceptance. Retry never bypasses issuance cooldown or abuse limits.

Existing finish_mail accepts delivered boolean, cannot represent permanent-vs-transient
or unknown acceptance, and advances available_at even on terminal completion. Near expiry,
now+retry delay can violate outbox CHECK(expires_at>available_at). Therefore it cannot
safely persist every decision above without a reviewed D4 completion/lease contract.
Do not map RECONCILE blindly to finish_mail(false); lease reclaims could redeliver.
Required future contract: distinguish accepted/transient/permanent/unknown, preserve
claim ownership atomically, avoid retry beyond expiry, avoid moving terminal available_at,
and prevent another worker reclaiming an unresolved uncertain send. No new state/SQL/ACL
is chosen here. D1 approval alone does not authorize this extension.

## Acceptance and remaining choices

No-database evidence now covers deterministic budgets/expiry/unknown handling, stable
cross-tenant-separated delivery keys and simulated failure sequences. It does not test
actual lease CAS, transport, provider dedup, recipient proof or outbox encryption.
Future tests: verified/unverified/revoked/address-changed recipient, cross-tenant payload,
lease loss/crash, accepted-but-timeout reconciliation, concurrent claims/completion,
stale methods, expiry during wait/send, rollback/outbox dedup and safe logging canaries.

Owner must approve authoritative recipient evidence/provisioning, payload/AAD, real provider
with Swiss processing/backup/support evidence, actual worker key custody, provider dedup/
reconciliation and terminal completion/retention/UX. D4 has no invented provider, destination,
permission, production retry constant or activated route.
