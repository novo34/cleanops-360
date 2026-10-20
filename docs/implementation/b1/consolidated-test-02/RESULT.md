# PG-TEST-01-CONSOLIDATED-02 — FAIL

Executed source HEAD: `c1f384def052458a623c90645967a164a2d76ed7`.
[Exact Actions run](https://github.com/novo34/cleanops-360/actions/runs/39044517403), job `117430482434`.

Candidate blob `d723ff9f615caafa701418dbaea60dec43479bba`, SHA-256 `a1c524b9821319d830f4a753fb8691dde218e291341d90bd1d3ea14254c1e3fd`.
The four pinned original blobs, deterministic generation, complete 01→02 diff, ACL and signature invariance passed before submission. PostgreSQL received exactly these 118512 bytes with `check_function_bodies=on`.

Installation: **FAIL**, SQLSTATE **42601**, input line 1491, body line 18 of `auth_api.consume_email_otp(text,uuid,bytea,uuid)`: unparenthesized `IS DISTINCT FROM CASE … END` operand in a PL/pgSQL IF predicate. This is the same parser ambiguity previously corrected for `<> CASE`, in a different function. The previous function-specific regression check missed this operator/function combination.

Results: **8 PASS / 1 FAIL / 21 BLOCKED / 0 SKIP**. These counts include integrity/isolation prerequisites and dependency groups; they are not 30 functional product scenarios. Authentication/MFA/session transitions, service privileges, RLS, tenant access, CAS, row-lock concurrency, functional rollback, COMMIT failure, backup/restore and dynamic runtime SQL validation were **not executed**, because installation is atomic and did not complete. No replacement objects or permissions were installed.

Actual PostgreSQL checks passed: failed-install rollback left zero application/private/API/crypto schemas and zero cleanops roles. The new PG16 container had network `none`, no published ports and no bound/shared volumes. It was removed; before/after container, network and volume inventories matched. Image digest and individual checks are in `EXECUTION_REPORT.json`. No claim is made that arbitrary existing filesystem/image contents were hashed; the owned container was the only resource mutated apart from pulling the PG16 image on the fresh runner.

B1 accepted real end-to-end requirements: **0/44**. B1, PG-TEST-01 and AUTH-GATE-05 remain OPEN; `closedBackend` stays connected.

## Consolidated source correction

Revision 03 is a complete independently reproducible candidate, not an install-time patch chain. Its only delta from 02 is one pair of parentheses in the above function. Original artifacts and revisions 01/02 remain unchanged. All 29 CASE sites were inventoried; the one remaining bare comparison operand is corrected. ACL, public headers and all other statement tokens are unchanged. This lexical review does **not** prove PostgreSQL compilation, dynamic SQL validity or absence of other categories of defects.

Next executable action requires authorization of revision 03 blob `7290c09ab32b74fecc4c39dc5d91a3bbc7f2723e`, SHA-256 `07e6637d1d39b50962bc2a034416f8e43bdbb0ec775234a20d12998bf58ec779`, for a fresh isolated PG16 install and the already specified real test battery. It has **not** been installed. This request follows the owner's condition prohibiting installation of any further modified SQL without specific authorization.
