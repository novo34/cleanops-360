# SQL10 — approval request; REVIEW ONLY, not installed

Exact candidate: `PG-TEST-01-CONSOLIDATED-10`.

- Git blob: `68c0545f79cf15fa780566ebf4aab14b3ccb892b`
- SHA-256: `d95e9896ebd12f840f00c12c97ffb9e8b17f3cfe28052655d7f4c4e80d3f5e4b`
- Size: 196329 bytes.
- Base: exact authorized SQL09 blob `641886171bc24557ff5f49ae6bc7564036efc6b0`, SHA-256 `660331857de2ea2d1f4c4dfa850361b73f37b807694054b9e0e03acb5d29786a`.
- Complete diff: [SQL09_TO_SQL10.diff](SQL09_TO_SQL10.diff), SHA-256 `b7c0572dd26fe310c9a601c4f9486f3dd039f897d63e51c670d2b1b02c98d5cf`.

## Reproduced defect, not a proposed relaxation

Source `5197c46c99a06cf864042057d5d74ac1dcda6232`, Actions39117274360/job117645498673: actual identity-service `register_trusted_device` was invoked32 times inside independently rolled-back transactions.31 succeeded;1 failed SQLSTATE23514. Registration evaluates `clock_timestamp()` separately for creation and expiry. If the second call advances, `expires_at > created_at + interval '30 days'`, violating the table CHECK. This also explains intermittent real UI registration failures in source0a5dd920/run39116963791. The exact expiry CHECK is retained.

Only the existing body of `auth_api.register_trusted_device(bytea,uuid) RETURNS uuid` changes: capture one `registered_at` immediately before INSERT, then use it for creation and expiry. This is a clean full install artifact, generated reproducibly from pinned authorized09. All original artifacts and history remain intact. No chain of SQL patches and no installation of10 has occurred.

## Security and ACL diff

**No ACL changes. No signatures, roles, tables, policies or other function changes.** Existing SECURITY DEFINER, `search_path=pg_catalog`, owner `cleanops_auth_broker`, PUBLIC revocation and identity-service-only EXECUTE remain byte-identical. ACTIVE/context/tenant policy, fresh B1-SELF-06 MFA, principal/credential bindings, token digest checks and transactional audit are unchanged. The same server timestamp makes the approved30-day bound exact; no session or MFA authority is added. No direct table privileges are granted. RLS remains forced and unchanged.

## Exact authorization requested

Approve installation of only the identified SQL10 artifact in a **new isolated PostgreSQL16 Docker container**, synthetic data only, no public ports/shared volumes. No production, deployment, merge, SMTP, new SQL/ACL or runtime activation. Keep closedBackend and B1/AUTH-GATE-05 OPEN.

After approval: verify exact blob/SHA256/full diff, install from zero, rerun32 actual role registrations with zero constraint failures and all affected negative privilege checks; execute all8 current real trusted-device Chromium cases (including expiration/disable, stolen metadata without MFA bypass, concurrency/replay, keyset pagination/global revocation, operator RBAC, reset/recovery invalidation, rollback and durable-COMMIT acknowledgement loss), restore fingerprint/cleanup/inventory assertions. Accept REQ-AUTH-046 only on complete mandatory evidence. Then continue the AUTHZ public vertical with existing approved brokers; other B1 obligations remain in the44-row matrix.
