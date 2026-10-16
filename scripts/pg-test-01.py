#!/usr/bin/env python3
"""PG-TEST-01 only: immutable SQL, new networkless Docker PG16, no existing DB."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = [
    ("V4", "docs/canonical/auth-review/v4/b1-review-only.sql", "a06dc23cbc889382b30924a1edc4cead66eeb3e0"),
    ("B1-X", "docs/proposals/b1-v4-extension/review-only.sql", "1499e90389b6e7c4d94b1dd17ed35cd4b539d436"),
    ("D1", "docs/proposals/b1-ceremony-material/review-only.sql", "6454a7551e61e5857ef39090b24b93fcbdb03bb1"),
    ("D1-ACL", "docs/proposals/b1-ceremony-material/approval-matrix.json", "50590047d35467b2473945731384ae3da5729f28"),
]
ENV = os.environ.copy()
for selector in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
    ENV.pop(selector, None)
DOCKER = ["docker", "--host=unix:///var/run/docker.sock"]
REPORT = {"scope": "PG-TEST-01", "b1": "OPEN", "authGate05": "OPEN", "runtime": "closedBackend",
          "artifacts": [], "checks": [], "image": None, "cleanup": "NOT_STARTED"}
CID = None
RUN = uuid.uuid4().hex
ROLE = {"runtime": "pgtest_runtime", "identity": "pgtest_identity", "mail": "pgtest_mail", "maintenance": "pgtest_maintenance"}
SQL_ROLES = {"runtime": "cleanops_runtime", "identity": "cleanops_identity_service", "mail": "cleanops_mail_worker", "maintenance": "cleanops_auth_maintenance"}
A, B, U, V, W, P, Q, S, T, X, Y = [str(uuid.UUID(int=(0x40008000000000000000 + i))) for i in range(1, 12)]

def command(args, data=None, timeout=45):
    return subprocess.run(args, input=data, text=True, capture_output=True, env=ENV, timeout=timeout)

def docker(*args, data=None, timeout=45):
    return command(DOCKER + list(args), data, timeout)

def record(name, status, detail=None):
    item = {"name": name, "status": status}
    if detail is not None:
        item["detail"] = detail
    REPORT["checks"].append(item)
    print(json.dumps(item), flush=True)

def state(result):
    found = re.search(r"(?:ERROR|FATAL):\s+([0-9A-Z]{5}):", result.stderr)
    return found.group(1) if found else "TRANSPORT_OR_TOOL_ERROR"

def sql(text, role="postgres", database="core"):
    return docker("exec", "-i", CID, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                  "-v", "VERBOSITY=verbose", "-U", role, "-d", database, data=text)

def check(name, text, expected=None, role="postgres", failure=None):
    result = sql(text, role)
    ok = (result.returncode != 0 and state(result) == failure) if failure else (
        result.returncode == 0 and (expected is None or result.stdout.strip() == expected))
    record(name, "PASS" if ok else "FAIL", {"sqlstate": state(result)} if result.returncode else None)
    return ok

def footprint():
    result = {}
    for kind, args in [("containers", ["ps", "-aq"]), ("networks", ["network", "ls", "-q"]), ("volumes", ["volume", "ls", "-q"])]:
        value = docker(*args)
        if value.returncode:
            raise RuntimeError("DOCKER_UNAVAILABLE")
        result[kind] = set(value.stdout.split())
    return result

def session_sql(token):
    return "BEGIN; SELECT auth_api.begin_verified_context('" + token * 43 + "');"

def fixtures():
    values = json.loads((ROOT / "lib/b1/security-values.json").read_text())["values"]
    profile = {entry["key"]: entry["value"] for entry in values}
    setup = "INSERT INTO identity_private.configuration VALUES(true,true,'" + json.dumps(profile).replace("'", "''") + "'::jsonb,'PG-TEST-01-SYNTHETIC',1);\n"
    setup += f"""
INSERT INTO identity_private.principals VALUES
('{P}','u1@fixture.invalid','ACTIVE',now()),('{Q}','u2@fixture.invalid','ACTIVE',now());
INSERT INTO identity_private.credentials VALUES
('{P}','$argon2id$fixture-not-a-real-password',1,now()),('{Q}','$argon2id$fixture-not-a-real-password',1,now());
INSERT INTO app.organizations VALUES
('{A}','Synthetic A','ACTIVE',NULL,now(),1),('{B}','Synthetic B','ACTIVE',NULL,now(),1);
INSERT INTO app.users VALUES
('{A}','{U}','{P}','Synthetic A1','ACTIVE','SENSITIVE',now()),
('{A}','{V}','{Q}','Synthetic A2','ACTIVE','SENSITIVE',now()),
('{B}','{W}','{P}','Synthetic B1','ACTIVE','SENSITIVE',now());
INSERT INTO app.policy_versions VALUES('{A}',1),('{B}',1);
INSERT INTO app.self_service_rules
SELECT t, 'B1-SELF-0'||g, 'ALLOW','ACTIVE',now()-interval '1 minute',NULL,'PG-TEST-01-SYNTHETIC'
FROM unnest(ARRAY['{A}'::uuid,'{B}'::uuid]) t CROSS JOIN generate_series(1,8) g;
"""
    for tenant, sid, user, principal, token in [(A, S, U, P, "a"), (A, T, U, P, "b"), (A, X, V, Q, "c"), (B, Y, W, P, "d")]:
        setup += f"""INSERT INTO app.sessions VALUES('{tenant}','{sid}','{user}','{principal}',
crypto.digest(convert_to(repeat('{token}',43),'UTF8'),'sha256'),
crypto.digest(convert_to(repeat('e',43),'UTF8'),'sha256'),'ACTIVE',
now()-interval '1 minute',now(),now()+interval '1 hour',now()+interval '30 minute',
1800,NULL,now(),1,'Synthetic device','Synthetic browser');\n"""
    for purpose, login in ROLE.items():
        password = secrets.token_urlsafe(32)
        setup += f"CREATE ROLE {login} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{password}'; GRANT {SQL_ROLES[purpose]} TO {login};\n"
    return check("synthetic-fixtures-and-separated-logins", setup)

def checks_v4():
    check("rls-enabled-forced-21-tables", "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity;", "21")
    check("non-login-non-bypass-broker-owns-no-tables", "SELECT (NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relkind='r' AND relowner=r.oid))::text FROM pg_roles r WHERE rolname='cleanops_auth_broker';", "true")
    check("definer-owner-and-search-path", """SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth_api','identity_private') AND
(NOT p.prosecdef OR p.proowner<>'cleanops_auth_broker'::regrole OR NOT coalesce(p.proconfig,'{}') @> ARRAY['search_path=pg_catalog'] OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'));""", "0")
    tables = sql("SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r' ORDER BY 1;")
    for role in ROLE.values():
        check(role + "-no-super-create-bypass-membership", "SELECT (NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT pg_has_role(current_user,'cleanops_auth_broker','MEMBER') AND NOT pg_has_role(current_user,'cleanops_ddl_owner','MEMBER'))::text FROM pg_roles WHERE rolname=current_user;", "true", role)
        check(role + "-cannot-assume-broker", "SET ROLE cleanops_auth_broker;", role=role, failure="42501")
        check(role + "-cannot-create-schema", "CREATE SCHEMA unauthorized;", role=role, failure="42501")
        for table in tables.stdout.splitlines():
            check(role + "-no-table-" + table, "SELECT * FROM " + table + " LIMIT 1;", role=role, failure="42501")
        check(role + "-no-dml-acl", """SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) v WHERE n.nspname IN('app','identity_private') AND c.relkind='r' AND has_table_privilege(current_user,c.oid,v);""", "0", role)
    for token, tenant, user, count in [("a", A, U, 2), ("d", B, W, 1)]:
        check("bound-identity-" + token, session_sql(token) + f"SELECT tenant_id::text||'/'||id::text FROM auth_api.current_identity();ROLLBACK;", tenant + "/" + user, ROLE["runtime"])
        check("own-sessions-" + token, session_sql(token) + "SELECT count(*) FROM auth_api.own_sessions();ROLLBACK;", str(count), ROLE["runtime"])
    check("missing-context-denied", "SELECT * FROM auth_api.current_identity();", role=ROLE["runtime"], failure="42501")
    check("forged-guc-denied", f"SELECT set_config('app.tenant_id','{A}',false);SELECT * FROM auth_api.current_identity();", role=ROLE["runtime"], failure="42501")
    check("context-cannot-switch", session_sql("a") + "SELECT auth_api.begin_verified_context('" + "d"*43 + "');COMMIT;", role=ROLE["runtime"], failure="42501")
    for target in [X, Y]:
        check("foreign-revoke-" + target, session_sql("a") + f"SELECT auth_api.revoke_own_session('{target}','{uuid.uuid4()}');COMMIT;", role=ROLE["runtime"], failure="P0002")
    check("cross-tenant-fk", f"INSERT INTO app.recovery_codes VALUES('{B}','{uuid.uuid4()}','{U}','{uuid.uuid4()}',decode(repeat('ab',32),'hex'),now(),NULL,NULL);", failure="23503")
    check("explicit-rollback", f"BEGIN;UPDATE app.organizations SET name='Must rollback' WHERE id='{A}';ROLLBACK;SELECT name FROM app.organizations WHERE id='{A}';", "Synthetic A")
    check("transaction-error-rollback", f"BEGIN;UPDATE app.organizations SET name='Must rollback' WHERE id='{A}';SELECT 1/0;COMMIT;", failure="22012")
    check("rollback-confirmed", f"SELECT name FROM app.organizations WHERE id='{A}';", "Synthetic A")
    # Deterministic row-lock wait: independent service connection blocks behind setup lock.
    holder = subprocess.Popen(DOCKER + ["exec","-i",CID,"psql","-X","-qAt","-U","postgres","-d","core"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
    try:
        holder.stdin.write(f"BEGIN;SELECT id FROM app.sessions WHERE id='{T}' FOR UPDATE;\n")
        holder.stdin.flush()
        assert holder.stdout.readline().strip() == T
        check("service-row-lock-timeout", session_sql("a") + f"SET LOCAL lock_timeout='300ms';SELECT auth_api.revoke_own_session('{T}','{uuid.uuid4()}');COMMIT;", role=ROLE["runtime"], failure="55P03")
        holder.stdin.write("ROLLBACK;\n"); holder.stdin.close(); holder.wait(timeout=10)
    finally:
        if holder.poll() is None:
            holder.kill(); holder.wait()
    check("timeout-left-target-active", f"SELECT state FROM app.sessions WHERE id='{T}';", "ACTIVE")
    # Attempt COMMIT after server terminates that transaction. No replacement schema/constraint.
    peer = subprocess.Popen(DOCKER + ["exec","-i",CID,"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d","core"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
    try:
        peer.stdin.write(f"BEGIN;UPDATE app.organizations SET name='Uncommitted' WHERE id='{A}';SELECT pg_backend_pid();\n"); peer.stdin.flush()
        pid = int(peer.stdout.readline().strip())
        check("terminate-only-owned-transaction", f"SELECT pg_terminate_backend({pid});", "t")
        peer.stdin.write("COMMIT;\n"); peer.stdin.close()
        peer.wait(timeout=10)
        record("commit-transport-failure", "PASS" if peer.returncode != 0 else "FAIL", "Server-terminated transaction; not a simulation of committed-but-response-lost.")
    finally:
        if peer.poll() is None:
            peer.kill(); peer.wait()
    check("failed-commit-no-effects", f"SELECT name FROM app.organizations WHERE id='{A}';", "Synthetic A")
    check("revoke-own-after-lock-release", session_sql("a") + f"SELECT auth_api.revoke_own_session('{T}','{uuid.uuid4()}');COMMIT;", "1", ROLE["runtime"])
    check("revoked-token-denied", session_sql("b") + "COMMIT;", role=ROLE["runtime"], failure="42501")
    check("other-tenant-and-user-intact", f"SELECT count(*) FROM app.sessions WHERE id IN('{X}','{Y}') AND state='ACTIVE';", "2")
    check("success-audit-atomic", "SELECT count(*) FROM app.audit_logs WHERE action='self_sessions.revoke_self_session';", "1")
    fingerprint = "SELECT md5(string_agg(id::text||state,',' ORDER BY id)) FROM app.sessions;"
    original_state = sql(fingerprint).stdout.strip()
    dump = docker("exec",CID,"pg_dump","-U","postgres","-d","core","-Fc","-f","/tmp/pgtest.dump")
    check("create-owned-restore-db", "CREATE DATABASE restored;")
    restore = docker("exec",CID,"pg_restore","-U","postgres","--exit-on-error","-d","restored","/tmp/pgtest.dump")
    record("backup-restore", "PASS" if dump.returncode == 0 and restore.returncode == 0 else "FAIL")
    restored = sql(f"SELECT count(*) FROM app.sessions WHERE state='REVOKED';", database="restored")
    record("restore-revocation-preserved", "PASS" if restored.returncode == 0 and restored.stdout.strip() == "1" else "FAIL")
    restored = sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity_private') AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity;", database="restored")
    record("restore-rls-21-tables", "PASS" if restored.returncode == 0 and restored.stdout.strip() == "21" else "FAIL")

def main():
    global CID
    before = None
    try:
        payloads = []
        for name, path, expected in ARTIFACTS:
            raw = (ROOT/path).read_bytes()
            actual = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
            REPORT["artifacts"].append({"name":name,"gitBlob":actual,"verified":actual==expected})
            if actual != expected:
                raise RuntimeError("AUTHORIZED_BLOB_MISMATCH")
            if name != "D1-ACL":
                payloads.append((name, raw.decode()))
        record("authorized-four-blobs", "PASS")
        before = footprint()
        pulled = docker("pull","postgres:16-alpine",timeout=180)
        if pulled.returncode:
            raise RuntimeError("OFFICIAL_PG16_IMAGE_PULL_FAILED")
        image = docker("image","inspect","postgres:16-alpine","--format","{{index .RepoDigests 0}}").stdout.strip()
        if not re.fullmatch(r"postgres@sha256:[0-9a-f]{64}", image):
            raise RuntimeError("IMMUTABLE_OFFICIAL_IMAGE_UNRESOLVED")
        REPORT["image"] = image
        launched = docker("run","-d","--pull=never","--name","cleanops-pgtest01-"+RUN,"--label","cleanops.pgtest01="+RUN,
            "--network=none","--security-opt=no-new-privileges","--tmpfs","/var/lib/postgresql/data:rw,nosuid,nodev,size=1g",
            "--tmpfs","/tmp:rw,nosuid,nodev,size=128m","--shm-size=128m",
            "-e","POSTGRES_DB=core","-e","POSTGRES_PASSWORD="+secrets.token_urlsafe(32),image)
        if launched.returncode:
            raise RuntimeError("ISOLATED_CONTAINER_CREATION_FAILED")
        CID = launched.stdout.strip()
        meta = json.loads(docker("inspect",CID).stdout)[0]
        assert meta["HostConfig"]["NetworkMode"] == "none"
        assert not meta["HostConfig"]["PortBindings"]
        assert not any(m["Type"] in ["bind","volume"] for m in meta["Mounts"])
        record("new-container-network-none-no-ports-no-volumes", "PASS")
        for _ in range(60):
            if sql("SELECT current_setting('server_version_num')::integer BETWEEN 160000 AND 169999;").stdout.strip() == "t":
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("PG16_STARTUP_TIMEOUT")
        record("postgres16-ready", "PASS")
        base_ok = False
        blocked = False
        for name, text in payloads:
            if blocked:
                record("install-"+name,"BLOCKED","Dependency installation failed; original SQL not modified.")
                continue
            result = sql(text)
            if result.returncode:
                match = re.search(r"ERROR:\s+[0-9A-Z]{5}:\s+([^\n]+)",result.stderr)
                record("install-"+name,"FAIL",{"sqlstate":state(result),"message":match.group(1)[:220] if match else "No decoded PostgreSQL diagnostic"})
                blocked = True
            else:
                record("install-"+name,"PASS")
                base_ok = base_ok or name == "V4"
        if base_ok and fixtures():
            checks_v4()
        if blocked:
            for name in ["B1-X-credential-CAS","B1-X-global-TOTP-counter-CAS","D1-locked-material-and-challenge-generation","D1-concurrent-consume"]:
                record(name,"BLOCKED","Exact approved overlay not installed; no replacement/guard removal authorized.")
    except Exception as error:
        record("harness","FAIL",type(error).__name__+":"+str(error)[:120])
    finally:
        if CID:
            label = docker("inspect","--format",'{{index .Config.Labels "cleanops.pgtest01"}}',CID)
            if label.returncode == 0 and label.stdout.strip() == RUN:
                removed = docker("rm","-f",CID)
                REPORT["cleanup"] = "PASS" if removed.returncode == 0 else "FAIL"
            else:
                REPORT["cleanup"] = "FAIL"
        if before is not None:
            try:
                after = footprint()
                record("preexisting-containers-networks-volumes-unchanged","PASS" if before == after else "FAIL")
            except Exception:
                record("footprint-verification","FAIL")
        REPORT["result"] = "PASS" if REPORT["cleanup"] == "PASS" and all(x["status"]=="PASS" for x in REPORT["checks"]) else "FAIL"
        target = ROOT/"artifacts"/"pg-test-01"
        target.mkdir(parents=True,exist_ok=True)
        (target/"report.json").write_text(json.dumps(REPORT,indent=2)+"\n")
        print("PG-TEST-01 "+REPORT["result"],flush=True)
    return 0 if REPORT["result"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
