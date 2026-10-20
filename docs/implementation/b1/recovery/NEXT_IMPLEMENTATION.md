# Current sequence after SQL09

Password reset integration and security evidence are in PASSWORD_RESET_HTTP.md and ../consolidated-test-09/. SQL09 is approved/installed in isolated tests; its prior authorization dependency is resolved. B1 is14/44 accepted in isolated functional scope, AUTH-GATE-05 OPEN, closedBackend. Next: complete trusted-device public UI/API/HTTP-only token semantics over the already-approved broker functions without bypassing MFA, then AUTHZ/Manage Access and remaining administrative MFA reset within B1. No new SQL/ACL, production, infrastructure activation or other module is authorized by these next code/test tasks.

## Historical independent preparation (superseded status)

# Independent preparation after SQL08

B1 remains9/44, AUTH-GATE-05 OPEN, runtime closedBackend. No SQL09 installation, new SQL/ACL, provider activation or another module.

Reset preparation reuses password.ts Argon2id options and random salt generation. prepareReplacementHash requires an explicit private admission/corpus checker, refuses malformed input, fails closed when policy is absent/unavailable and returns only a private PHC record. No password normalization, provider or production admission policy is invented. It does not write credentials, issue sessions or complete reset HTTP. The approved typed reset-material/CAS calls already exist; the missing owned BOOTSTRAP reservation remains the SQL09 dependency.

Trusted-device/AUTHZ preparation adds typed fixed-parameter calls to the existing approved own_trusted_devices/register_trusted_device/trusted_device_valid/revoke_trusted_device/effective_access/access_detail functions. No table access, role switching, tenant argument, permission grant, cookie contract or endpoint is added. These calls are private components, not acceptance of their UI/API verticals. Existing SQL enforces ACTIVE context, relevant step-up/permissions, target scoping and revocations; existing native evidence is retained without rerunning unaffected historical cases.

Next sequence after exact SQL09 approval: install only that full candidate in fresh isolated synthetic PG16; exercise BOOTSTRAP/CSRF/owned negatives; connect existing reset UI/API architecture with receipt-bound reader, explicit password admission, scoped recovery HMAC, version CAS and owned completion on one connection; verify post-COMMIT safe response, revocation, concurrency/rollback and Chromium. Then complete trusted-device and AUTHZ public verticals inside B1. No extra requirement is accepted from these unit/static preparations.

## Trusted-device increment and independent AUTHZ preparation

The new trusted-device HTTP/UI vertical and SQL09 service-role browser tests are in `../trusted-device/`. Completion is not claimed while registration/expiration/transaction negatives fail. The five AUTHZ mutation calls are now parameterized in the same existing V4 broker (set_user_access_rule, set_access_role, set_role_membership, set_role_access_rule, revoke_access_assignment), with typed policy CAS and exact approved signatures; these are executable private calls, not public endpoint/UX acceptance. No SQL, ACL, role grant or runtime activation is added. AUTHZ public vertical remains INCOMPLETE. Its orchestration must acquire the exclusive tenant-policy lock in the approved mutation before any binding_authorization/effective_access SHARE lock, retain owned reservations and all SQL authorization/step-up checks, and never use client role names as authority. No action is marked implemented end-to-end from this preparation.
