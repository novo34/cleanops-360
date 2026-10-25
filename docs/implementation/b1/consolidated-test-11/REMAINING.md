# B1 remaining criteria after isolated AUTHZ closure

22/44 individually accepted; B1/AUTH-GATE-05 OPEN. This is a classification of remaining canonical acceptance criteria, not22 known code defects. No SQL/ACL change is requested. Existing PASS evidence is retained and not re-executed without an affected/uncovered case.

|Requirement|Blocker class|Exact remaining action|
|---|---|---|
|REQ-PR-006|FORMAL_ACCEPTANCE|Finish the remaining B1 criteria; required independent review/manual Product Owner acceptance and any staging execution need their own evidence/authorization. No deployment requested here.|
|REQ-PR-007|FORMAL_ACCEPTANCE|Do not open the next module before formal B1/AUTH-GATE-05 acceptance.|
|REQ-AUTH-002|OPERATIONAL_CONFIGURATION_AND_EVIDENCE|MFA mandatory architecture remains approved. Identify operational risk/profile mapping and configuration owner; do not promote synthetic values into production.|
|REQ-AUTH-003|CROSS_FLOW_AND_EXTERNAL_DELIVERY_EVIDENCE|Isolated EMAIL/TOTP flows already work. Reconcile complete method-selection/enrollment/login evidence; synthetic delivery does not establish an external productive mail integration.|
|REQ-AUTH-004|EXTERNAL_COMPATIBILITY|Owner identifies required authenticator apps/platforms/versions; demonstrate actual QR import, SHA256 and generated codes. Library vectors are not app compatibility.|
|REQ-AUTH-010|CROSS_FLOW_ACCEPTANCE_EVIDENCE|Reconcile mandatory one-use/expiry/replay/concurrency evidence across EMAIL/TOTP/enrollment/recovery/reset; rerun only any genuinely uncovered case.|
|REQ-AUTH-015|ABUSE_ACCEPTANCE_EVIDENCE|Complete per-user/IP/device rate-limit evidence across the approved B1 entrypoints and trusted transport context; no arbitrary production limits.|
|REQ-AUTH-016|ABUSE_ACCEPTANCE_EVIDENCE|Complete attempt/cooldown acceptance evidence across factor and recovery/reset flows, preserving existing approved controls.|
|REQ-AUTH-017|ABUSE_ACCEPTANCE_EVIDENCE|Complete anti-enumeration acceptance evidence for login/reset/recovery/EMAIL errors and malformed HTTP. Do not infer coverage from unit mocks.|
|REQ-AUTH-020|EXTERNAL_QR_COMPATIBILITY|Isolated QR UI exists; actual import/use evidence with required apps is still pending and linked to AUTH-004.|
|REQ-AUTH-022|OPERATIONAL_CUSTODY_AND_EVIDENCE|AES envelope/key-version behavior is implemented with ephemeral test keys. Owner must designate Swiss OpenBao custody/hosts/workload identities/recovery and authorize that infrastructure before real custody validation.|
|REQ-AUTH-034|ADMIN_RESET_ACCEPTANCE_EVIDENCE|Reconcile the complete approved administrative reset/independent identity-attestation and durable audit evidence; synthetic attestation is not an operational identity source.|
|REQ-AUTH-044|OPERATIONAL_SESSION_PROFILE|Verify configured role/risk inactivity mapping against approved30min/8h rules. Identify operational configuration owner; do not invent mappings.|
|REQ-AUTH-045|OPERATIONAL_SESSION_PROFILE|Approve and validate the operational absolute lifetime independently from idle/trusted-device lifetime; current fixture values are not production policy.|
|REQ-AUTH-047|SENSITIVE_ACTION_ACCEPTANCE_EVIDENCE|Complete grant/resource/session/version/freshness coverage for every approved sensitive B1 action; reuse existing PASS and SQL11 step-up evidence.|
|REQ-TEN-001|MODULE_WIDE_ISOLATION_ACCEPTANCE|AUTHZ cross-tenant/forced-RLS/API negatives pass. Reconcile all remaining B1 ceremonies, pool/context reuse and revocation/isolation evidence; no other module is required.|
|REQ-TEN-002|MODULE_WIDE_ISOLATION_ACCEPTANCE|AUTHZ cross-tenant/forced-RLS/API negatives pass. Reconcile all remaining B1 ceremonies, pool/context reuse and revocation/isolation evidence; no other module is required.|
|REQ-TEN-003|MODULE_WIDE_ISOLATION_ACCEPTANCE|AUTHZ cross-tenant/forced-RLS/API negatives pass. Reconcile all remaining B1 ceremonies, pool/context reuse and revocation/isolation evidence; no other module is required.|
|REQ-TEN-004|MODULE_WIDE_ISOLATION_ACCEPTANCE|AUTHZ cross-tenant/forced-RLS/API negatives pass. Reconcile all remaining B1 ceremonies, pool/context reuse and revocation/isolation evidence; no other module is required.|
|REQ-SEC-020|FINAL_SECURITY_ACCEPTANCE|Mature Argon2id/TOTP libraries are integrated. Complete remaining whole-flow/security-sink and custody acceptance evidence; no new crypto implementation.|
|REQ-SEC-021|OPERATIONAL_SESSION_PROFILE|Same operational absolute-expiry decision/evidence as AUTH-045; do not reopen the approved independent-expiry architecture.|
|REQ-AUD-001|MODULE_WIDE_AUDIT_ACCEPTANCE|SQL11 AUTHZ detailed SUCCESS and owned business DENY audits are real and durable. Complete the remaining B1 security-event/sink/retention evidence. No audit persistence is claimed for an aborted SQL transaction or invalid owned protocol.|

## Finite next execution order

1. Complete the one-use/abuse/anti-enumeration acceptance records (AUTH-010/015/016/017) from existing raw real evidence; execute only uncovered required cases. Fix demonstrated code defects without changing SQL/ACL.
2. Finish cross-flow administrative-reset, step-up, tenant/pool isolation and whole-B1 audit criteria, then the required final B1 regression. No new module.
3. Owner supplies the already-defined operational parameters: required authenticator apps/devices; Swiss OpenBao custodians/hosts/workload ACL/recovery; verified mailbox authority, mail operator/sender/terminal retention/quarantine ownership; operational risk/session profile. Execution of real infrastructure/external mail still requires specific authorization. These are not new SQL11 approvals or architectural reopenings.
4. Independently record isolated technical acceptance and operational readiness. Request formal Product Owner/gate closure only when all44 rows have complete evidence and remaining operational criteria are satisfied. Keep closedBackend until activation controls are independently approved.
