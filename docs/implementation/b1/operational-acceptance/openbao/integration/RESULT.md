# B1 / PostgreSQL16 / native OpenBao — isolated PASS

Final144/144 real checks PASS; cleanup PASS. Tested source
08ecbab3e3816f660d635d0ee48b92f92850eb7f,
[Actions39150315948](https://github.com/novo34/cleanops-360/actions/runs/39150315948),
job117742437707; EXECUTION.json includes exact source code SHA256 values.
Fresh combined recovery24.825s; its OpenBao/post-restore checks18.117s. Neither
measurement accepts operating RPO/RTO. SQL14 blob1971a9fdc5c1f3fd1fcb5f6706459678e5399256,
SHA256965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa.

Initial143-check real PASS: source9f11305e84e896506dba3f1cbd22c6d2ddeecccf,
Actions39149707640/job117740654539, EXECUTION_INITIAL.json. Later immutable-scope/token-deadline hardening and corrected audit-exhaustion
injection passed in the separate final execution; the initial PASS is retained.

## What is integrated

Actual private B1 HTTP handler, approved backend/transaction broker, Argon2id and
TOTP with ordinary PostgreSQL service login. Purpose-separated synthetic keys are
retrieved over verified mTLS from native OpenBao2.7.1 KVv2 through ordinary AppRole.
The new exact-version reader is private and not imported by runtime.ts.
Key fetching finishes before database transactions; scoped buffers are zeroed on
success/failure, wrong scope and late use are denied, and there is no stale-key
cache, redirect, latest-version fallback or remote-error-body projection.

Real B1 AES256-GCM envelopev2 and immutable method/user/tenant/algorithm AAD are
used. A new create-only key ID leaves prior ciphertext recoverable via its exact
read-authorized version. The rewrap codec is tested in memory; SQL14 has no approved
method-rewrap CAS writer. No persisted method recipher is performed using owner SQL.
HMAC keys retain their identities; no unsupported HMAC multi-version migration is
claimed. EMAIL envelope decryption uses the actual B1 mail codec and separately
scoped mail AppRole; no SMTP or new EMAIL UI/browser acceptance is claimed.

Independent encrypted PostgreSQL+roles dump and Raft snapshot are restored into
a genuinely new PG16 data directory and a new OpenBao Raft target. All32 table
contents must match the frozen source before restored API traffic. Restored MFA
ciphertext/counter, session identity/list/logout, audit and tenant separation are
checked, including ordinary key access after quarantining snapshot-era workloads.
The existing synthetic PostgreSQL harness uses private Unix-socket authentication;
this is not production DB credential/TLS provisioning. Logical frozen backup is not
operational WAL/PITR or evidence of RPO compliance after unknown post-backup writes.

## Failed attempts retained

ATTEMPT_01/02 retain the pre-test ENOENT/protocol failures. Streaming private files
through the running container replaced Docker archive-copy into live tmpfs; the
subsequent initial143 checks passed. ATTEMPT_03 retains HTTP200 during an intended
full-audit-filesystem injection. A large filler returning ENOSPC does not establish
that small free blocks or the existing audit inode's tail cannot accept an event.
The final injection must prove zero free blocks AND an actual denied append on
the owned audit file, using blank lines rather than invented events. It must still
observe HTTP5xx and recover after removing only owned filler. No logging control,
policy or expected failure was relaxed. Final execution proved zero free blocks and denied append, then observed
HTTP500; removing the filler recovered normal reads. This establishes the
previous ENOSPC-only injection was insufficient; no product audit bypass was
introduced or hidden. ATTEMPT_03 remains FAIL. No pending trial became PASS.

## Acceptance boundaries

B1 stays42/44. PR006 and PR007 remain OPEN; AUTH-GATE-05 OPEN; closedBackend stays
connected. No new SQL/ACL, deployment, production, merge or external SMTP occurred.
Synthetic2-of-2 shares and backup keys are controlled by one harness, not actual
independent people. Real Swiss host/storage/backup/access residency, additional
custodians, approved operational quorum, actual custody/rotation/recovery and
RPO/RTO, independent security review and manual PO observations remain required.
The owner is confirmed as principal; additional custodians and quorum are not.
Release digest is verified; independent signer trust is not claimed.

PR007 demonstration: docs/implementation/b1/remaining/PO_MANUAL_DEMONSTRATION.md
(existing10-step walkthrough plus this custody supplement). Prepared, NOT executed
or signed. Exact next operational decisions are custodians/quorum and named Swiss
resources; any real provisioning/keys require separate exact authorization.

## General regression of the tested source

[CI39150315914](https://github.com/novo34/cleanops-360/actions/runs/39150315914),
source08ecbab3: lint/typecheck/build PASS;221 B1 tests PASS;63 static tests
PASS with PostgreSQL16 parser installed; Vitest13 PASS/3 database-dependent cases
intentionally SKIP in the no-database workflow;57 fixture Chromium PASS.
These57 are not new real OpenBao browser E2E. Offline contracts CI39150316069 PASS.
The two new provenance tests also pass locally together with8 existing OpenBao
static tests; final documentation-source CI verifies the published evidence.
