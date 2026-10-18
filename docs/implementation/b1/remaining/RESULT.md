# B1 remaining criteria — 40/44 isolated functional acceptances

B1 and AUTH-GATE-05 remain OPEN; closedBackend remains the runtime. This is not productive acceptance or permission to start another module.

18 additional criteria now have individual real evidence: AUTH002,003,004,010,015,016,017,020,022,034,044,045,047; TEN001–004; SEC020. [Canonical 44-row inventory](../closure/requirements.json) retains the original criterion text, exact cases and source provenance for each acceptance. [Composite evidence](ACCEPTANCE_EVIDENCE.json) selects only real PASS cases; failed earlier attempts are preserved, not relabeled.

Implemented and verified: durable abuse counters and hashed rate-limit events, anti-enumeration responses, global one-use TOTP across concurrent browsers, administrative MFA reset through the existing approved broker, durable CSRF denial, QR canvas decoding and enrollment, authenticated ciphertext tampering rejection, both trusted risk profiles' independent idle/absolute expiry, ACTIVE source step-up/destination MFA switching and revoked-origin denial, actual pg Pool max=1 tenant-context reuse/discard/GUC negatives. Approved policy/canonical SQL originals remain intact; SQL11 alone was installed.

[Final directed real regression](REGRESSION.json): five isolated batteries PASS, 514 checks including repeated installation guards, 64 Chromium executions representing 48 distinct cases across EMAIL, recovery, reset, Trusted Device and AUTHZ. Current source/run/job/cleanup is recorded per battery. Existing unaffected 333-check SQL11 native/RBAC evidence is reused. EMAIL/recovery's first attempt exposed a missing QR-decoder runner dependency; the unchanged QR assertion passed after provisioning zbarimg and rerunning only those two groups. No security control was relaxed. Every temporary container was removed and each report records preexisting resource inventory comparison and backup/restore checks.

Additional directed real evidence: abuse98/8 browsers, admin MFA94/4, QR91/1, ACTIVE switch92/2, generation-correct ciphertext91/1, CSRF91/1 and native pooled isolation96. Four independent policy/expiry browser cases passed in the retained earlier policy run; that full run failed its separate stale-generation tampering assertion, corrected and rerun in POLICY_NEGATIVE_EXECUTION.json. Counts are not summed as distinct tests or accepted requirements.

Actual application compatibility now PASS: KeePassXC2.7.6 and OATH Toolkit2.6.11 installed Linux CLIs,92 checks and one real QR→enrollment→logout→login PostgreSQL browser journey. See AUTHENTICATOR_EXECUTION.json. Neither mobile/GUI nor untested application versions are claimed. Existing514-check regression is historical evidence of the unchanged application backend.

## Four OPEN criteria, classified

|Criterion|Classification|Concrete closure work|
|---|---|---|
|SEC021|Real operational decision|Owner/security approval of absolute lifetime by trusted risk; already tested 8h/24h pair remains trial-only until explicitly approved.|
|AUD001|Functionality incomplete|Generic authorization/step-up guard denials currently roll back without durable journal. Consolidated SQL13 adds the two exact event codes; caller guards and real denial/COMMIT tests follow exact approval. Existing AUTHZ durable denied audit is preserved.|
|PR006|Formal acceptance pending, with a remaining functional contract gap|Initial password-verified multi-company PREAUTH selector remains fail-closed503 until owned rotation is approved/implemented/tested. Then complete missing operational evidence, independent review and authorized staging/manual PO acceptance; no deployment authorization inferred.|
|PR007|Formal phase acceptance pending|Keep B1/gates OPEN and do not start another module until documented acceptance.|

## Exact next execution

Owner approval is required only for the [single consolidated SQL13 contract/ACL/artifact](../../../proposals/b1-consolidated-sql/revisions/13/APPROVAL.md), superseding uninstalled SQL12; no new SQL has been installed. After approval: verify exact blob/hash/diff; install only that blob in new isolated PG16 synthetic Docker; test PREAUTH rotation/owned CAS and journal code privileges/negative RLS; wire existing typed broker and guard helper, real two-company initial login and denied-guard UI/API/PG/COMMIT tests; accept completed individual criteria. Independent [operating decisions/resources](OPERATING_DECISIONS.md) remain explicit; no fictitious custodian, provider, app compatibility or productive policy approval.
