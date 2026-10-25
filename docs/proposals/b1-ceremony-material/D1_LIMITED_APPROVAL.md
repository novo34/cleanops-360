# D1-CONTRACT-ACL — limited owner approval

Recorded from the owner's explicit instruction in this PR work session.
Source HEAD: a6eb775fa71e18ee857f34494680720fa7e39043.
Both GitHub blob SHAs were verified before development:
- review-only.sql: 6454a7551e61e5857ef39090b24b93fcbdb03bb1
- approval-matrix.json: 50590047d35467b2473945731384ae3da5729f28

Owner scope: "APRUEBO D1-CONTRACT-ACL únicamente como contrato de diseño para
integración TypeScript y pruebas sin PostgreSQL."

Authorized: typed D1 broker calls and no-database simulated transaction tests,
preserving authorization, owned reservations, CAS, rollback, revalidation and safe projections.
Not authorized: SQL/PostgreSQL/DDL/migrations/grants/seeds, deployment, merge or runtime
activation. The pinned SQL/matrix remain unchanged review artifacts, not installed contracts.

D2/D3 real enrollment and D4 EMAIL OTP remain unapproved and fail-closed. No new flags
or alternate production backend entry points. closedBackend and AUTH-GATE-05 OPEN.
Historical approval-request.json and approval-matrix.json preserve the original request;
this record supersedes only their D1 pending status for TypeScript/testing purposes.
