#!/usr/bin/env python3
"""CI: real non-root PG16 packaging and exact SQL installer, isolated synthetic only."""
import importlib.util
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


NATIVE_MIGRATION_CHECKS = r"""
// Native tests ONLY inside the existing owned packaging harness. Never a DSN.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import pg from 'pg'
import { runMigrations, migrationLock, migrationProvenance } from './scripts/migrate-postgres.mjs'
import { loadTrustedMigrations, loadTrustedB1Baseline } from './scripts/trusted-migrations.mjs'
const socket = process.env.CLEANOPS_NATIVE_SOCKET
assert(socket && socket.startsWith('/tmp/cleanops-staging-pg-'))
const password = fs.readFileSync(process.env.CLEANOPS_NATIVE_PASSWORD_FILE, 'utf8')
const results = []
const config = database => ({ host: socket, port: 5432, database,
  user: 'cleanops_bootstrap', password, ssl: false, options: '',
  application_name: 'owned-migrations-native-harness', connectionTimeoutMillis: 3000, max: 4 })
async function withPool(database, work) {
  const pool = new pg.Pool(config(database))
  try { return await work(pool) } finally { await pool.end() }
}
const [migration] = await loadTrustedMigrations()
const source = await migrationProvenance([migration], 'CI_MIGRATIONS_NATIVE_ONLY_NO_HOSTINGER')
const baseline = await loadTrustedB1Baseline()
const baselineSource = await migrationProvenance([baseline], 'CI_SYNTHETIC_ONLY_NO_HOSTINGER')
const check = name => results.push({ name, status: 'PASS' })
const present = async (pool, name) => (await pool.query('SELECT to_regclass($1)::oid AS value', [name])).rows[0].value
await withPool('cleanops_staging', async pool => {
  const plan = await runMigrations({ connect: () => pool.connect(), profile: 'b1', mode: 'plan' })
  assert.equal(plan.baseline.applied, true)
  assert.equal(plan.history.length, 1)
  const row = plan.history[0]
  assert.equal(row.id, baseline.id); assert.equal(row.checksum, baseline.sha256)
  assert.equal(row.profile, 'b1'); assert.equal(row.source_file, baseline.sourceFile)
  assert.equal(row.source_commit, baselineSource.sourceCommit)
  assert.equal(row.runner_sha256, baselineSource.runnerSha256)
  assert.equal(row.approval_reference, baselineSource.approvalReference)
  assert.equal(row.applied_by, 'cleanops_bootstrap')
  assert.ok(row.applied_at instanceof Date && Number.isFinite(row.applied_at.getTime()))
  const nullable = await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='_migrations' AND is_nullable='YES'")
  assert.equal(nullable.rows[0].n, 0)
  check('native-baseline-complete-checksum-provenance-and-not-null-history')
  // Fixed names, new databases in THIS owned network-none container only.
  for (const name of ['migration_foundation', 'migration_legacy', 'migration_concurrency', 'migration_rollback']) {
    await pool.query('CREATE DATABASE ' + name)
  }
})
await withPool('migration_foundation', async pool => {
  const before = await runMigrations({ connect: () => pool.connect(), mode: 'plan' })
  assert.deepEqual(before.pending, [migration.id]); assert.equal(await present(pool, 'public._migrations'), null)
  check('native-absent-plan-does-not-create-registry')
  let executions = 0
  const connect = async () => {
    const client = await pool.connect()
    return { query(sql, values) { if (sql === migration.sql) executions++; return client.query(sql, values) }, release(discard) { client.release(discard) } }
  }
  assert.deepEqual((await runMigrations({ connect, source })).applied, [migration.id])
  const first = (await pool.query('SELECT * FROM public._migrations')).rows[0]
  const oid = await present(pool, 'public.organizations')
  assert.equal(first.checksum, migration.sha256); assert.equal(first.source_commit, source.sourceCommit)
  assert.equal(first.runner_sha256, source.runnerSha256); assert.equal(first.applied_by, 'cleanops_bootstrap')
  assert.deepEqual((await runMigrations({ connect, source })).applied, [])
  assert.equal(executions, 1); assert.equal(await present(pool, 'public.organizations'), oid)
  assert.deepEqual((await pool.query('SELECT * FROM public._migrations')).rows[0], first)
  check('native-foundation-first-apply-and-second-no-repeat')
  await pool.query('UPDATE public._migrations SET checksum=$1 WHERE id=$2', ['0'.repeat(64), migration.id])
  await assert.rejects(runMigrations({ connect, source }), /APPLIED_MIGRATION_CHECKSUM_MISMATCH/)
  assert.equal((await pool.query('SELECT checksum FROM public._migrations')).rows[0].checksum, '0'.repeat(64))
  await pool.query('UPDATE public._migrations SET checksum=$1 WHERE id=$2', [migration.sha256, migration.id])
  await pool.query("UPDATE public._migrations SET id='unapproved-fixture'")
  await assert.rejects(runMigrations({ connect, source }), /UNEXPECTED_MIGRATION_HISTORY/)
  check('native-tampered-checksum-and-unexpected-history-rejected')
})
await withPool('migration_legacy', async pool => {
  await pool.query('CREATE TABLE public._migrations(id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  await pool.query("INSERT INTO public._migrations(id) VALUES('0001_system_status')")
  await assert.rejects(runMigrations({ connect: () => pool.connect(), source }), /INCOMPATIBLE_MIGRATION_REGISTRY/)
  const columns = await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='_migrations'")
  assert.equal(columns.rows[0].n, 2); assert.equal(await present(pool, 'public.organizations'), null)
  check('native-legacy-registry-not-adopted-or-upgraded')
})
await withPool('migration_concurrency', async pool => {
  let entered, resume
  const acquired = new Promise(resolve => { entered = resolve })
  const barrier = new Promise(resolve => { resume = resolve })
  const connect = async () => {
    const client = await pool.connect()
    return { async query(sql, values) {
      const result = await client.query(sql, values)
      if (sql === migrationLock && result.rows[0].locked) { entered(); await barrier }
      return result
    }, release(discard) { client.release(discard) } }
  }
  const first = runMigrations({ connect, source })
  const firstOutcome = first.then(value => ({ value }), error => ({ error }))
  try {
    // Bound the synchronization wait without sleeps or a synthetic advisory-lock result.
    let timer
    try { await Promise.race([acquired, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('NATIVE_LOCK_NOT_ACQUIRED')), 10000) }), first.then(() => { throw Error('FIRST_COMPLETED_BEFORE_BARRIER') })]) }
    finally { clearTimeout(timer) }
    await assert.rejects(runMigrations({ connect: () => pool.connect(), source }), /MIGRATION_BUSY/)
    assert.equal(await present(pool, 'public._migrations'), null)
  } finally { resume() }
  const outcome = await firstOutcome
  if (outcome.error) throw outcome.error
  assert.deepEqual(outcome.value.applied, [migration.id])
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public._migrations')).rows[0].n, 1)
  check('native-two-real-connections-exclude-concurrent-execution')
})
await withPool('migration_rollback', async pool => {
  let effectsReached = false
  const connect = async () => {
    const client = await pool.connect()
    return { async query(sql, values) {
      const result = await client.query(sql, values)
      if (sql === migration.sql) {
        // Execute the EXACT trusted migration, then fail on the SAME PG transaction.
        effectsReached = true
        await client.query('SELECT 1 / 0')
      }
      return result
    }, release(discard) { client.release(discard) } }
  }
  await assert.rejects(runMigrations({ connect, source }), /MIGRATION_DATABASE_FAILURE/)
  assert.equal(effectsReached, true)
  for (const name of ['organizations', 'feature_flags', 'audit_logs', 'security_events', '_migrations']) {
    assert.equal(await present(pool, 'public.' + name), null)
  }
  check('native-failure-rolls-back-effects-and-history-together')
})
process.stdout.write(JSON.stringify(results))
"""


def isolated_environment(inherited):
    env = dict(inherited)
    for k in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
        env.pop(k, None)

    # Node pg receives an explicit owned Unix socket/config; discard operational hints.
    for key in ["DATABASE_URL", "CLEANOPS_TEST_DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD",
                "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGSSLMODE", "PGOPTIONS"]:
        env.pop(key, None)

    return env


def main():
    owner = "cleanops-staging-pg-" + uuid.uuid4().hex
    container = None
    checks = []
    volume_created = False
    env = isolated_environment(os.environ)

    def docker(*args, data=None, check=True):
        r = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", *args], input=data,
                           capture_output=True, env=env, timeout=120)
        if check and r.returncode:
            code = re.search(rb"ERROR:\s+([0-9A-Z]{5})\b", r.stderr)
            raise RuntimeError("STAGING_PG_PROCESS_FAILED_" + (code[1].decode() if code else "REDACTED"))
        return r

    def load():
        spec = importlib.util.spec_from_file_location("actual_sql_installer", ROOT / "scripts/staging-sql14.py")
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        return m

    status = "FAIL"
    try:
        # Existing CI installs the reviewed lock with scripts disabled before this harness.
        probe = subprocess.run(["node", "--input-type=module", "-e", "await import('pg')"],
                               cwd=ROOT, env=env, capture_output=True, timeout=30)
        if probe.returncode:
            raise RuntimeError("LOCKED_NODE_PG_DEPENDENCIES_REQUIRED")
        docker("volume", "create", "--label", "cleanops.staging-pg=" + owner, owner)
        volume_created = True
        with tempfile.TemporaryDirectory(prefix=owner, dir="/tmp") as d:
            socket = Path(d) / "pg-socket"; socket.mkdir(mode=0o770)
            password = Path(d) / "synthetic-password"
            password.write_text(uuid.uuid4().hex)
            subprocess.run(["sudo", "chgrp", "999", d, str(password), str(socket)], check=True, capture_output=True)
            Path(d).chmod(0o750); password.chmod(0o640); socket.chmod(0o770)
            args = ["run", "-d", "--network=none", "--cap-drop=ALL", "--security-opt=no-new-privileges",
                    "--label", "cleanops.staging-pg=" + owner,
                    "--label", "com.docker.compose.project=" + json.loads((ROOT / "deploy/staging/RESOURCE_RECORD.json").read_text())["STAGING_SYNTHETIC"]["composeProject"],
                    "--label", "com.docker.compose.service=postgres",
                    "-e", "POSTGRES_DB=cleanops_staging", "-e", "POSTGRES_USER=cleanops_bootstrap",
                    "-e", "POSTGRES_PASSWORD_FILE=/run/secrets/password",
                    "--mount", "type=bind,src=" + str(password) + ",dst=/run/secrets/password,readonly",
                    "--mount", "type=bind,src=" + str(socket) + ",dst=/run/cleanops-native-socket",
                    "-v", owner + ":/var/lib/postgresql/data"]
            server = ["postgres:16-bookworm", "-c", "unix_socket_directories=/var/run/postgresql,/run/cleanops-native-socket"]
            # Reproduce the old root+drop-ALL incompatibility before testing the fixed recipe.
            container = docker(*args, *server).stdout.decode().strip()
            for _ in range(30):
                meta = json.loads(docker("inspect", container).stdout)[0]
                if not meta["State"]["Running"]: break
                time.sleep(0.25)
            assert not meta["State"]["Running"], "ROOT_DROP_ALL_FAILURE_NOT_REPRODUCED"
            checks.append({"name": "old-root-drop-all-startup-failure-reproduced", "status": "PASS"})
            docker("rm", "-f", container); container = None
            container = docker(*args, "--user=postgres", *server).stdout.decode().strip()
            for _ in range(100):
                logs = docker("logs", container, check=False)
                initialized = b"init process complete; ready for start up" in logs.stdout + logs.stderr
                probe = docker("exec", container, "psql", "-XqAt", "-U", "cleanops_bootstrap", "-d", "cleanops_staging", "-c", "SELECT 1", check=False)
                if initialized and probe.returncode == 0 and probe.stdout.strip() == b"1": break
                time.sleep(0.25)
            else: raise RuntimeError("NONROOT_PG16_NOT_READY")
            checks.append({"name": "fixed-nonroot-pg16-starts-with-drop-all", "status": "PASS"})
            m = load()
            compose_env = Path(d) / "staging.env"
            # Synthetic fixture outside checkout. No operational env file is consulted.
            compose_env.write_text("COMPOSE_NATIVE_FIXTURE_ONLY=yes\n")
            compose_env.chmod(0o600)

            def runner(arguments, data=None):
                if arguments[0] == "inspect": return docker(*arguments).stdout.decode()
                if "ps" in arguments: return container
                command = arguments[arguments.index("psql"):]
                return docker("exec", "-i", container, *command, data=data).stdout.decode().strip()

            record = json.loads((ROOT / "deploy/staging/RESOURCE_RECORD.json").read_text())
            record["STAGING_SYNTHETIC"].update(deploymentAuthorized=True,
                deploymentApprovalReference="CI_SYNTHETIC_ONLY_NO_HOSTINGER", sql14FreshInstallAuthorized=True)
            assert m.install(record, True, runner, compose_env_file=compose_env).startswith("EXACT_SQL14_INSTALLED")
            checks.append({"name": "exact-sql14-verified-installer-fresh-real-pg16", "status": "PASS"})
            try: m.install(record, True, runner, compose_env_file=compose_env)
            except ValueError: pass
            else: raise RuntimeError("REINSTALL_NOT_DENIED")
            checks.append({"name": "existing-installed-state-rejected-no-overwrite", "status": "PASS"})
            meta = json.loads(docker("inspect", container).stdout)[0]
            if (meta["Config"]["Labels"].get("cleanops.staging-pg") != owner
                or meta["HostConfig"].get("NetworkMode") != "none"
                or meta["HostConfig"].get("PortBindings")
                or not any(v.get("Source") == str(socket) and v.get("Destination") == "/run/cleanops-native-socket" for v in meta["Mounts"])):
                raise RuntimeError("NATIVE_SOCKET_OWNERSHIP_REQUIRED")
            native_env = dict(env, CLEANOPS_NATIVE_SOCKET=str(socket), CLEANOPS_NATIVE_PASSWORD_FILE=str(password))
            result = subprocess.run(["node", "--input-type=module", "-"], cwd=ROOT, env=native_env,
                                    input=NATIVE_MIGRATION_CHECKS.encode(), capture_output=True, timeout=120)
            if result.returncode:
                raise RuntimeError("NATIVE_MIGRATION_CHECKS_FAILED_REDACTED")
            native_checks = json.loads(result.stdout)
            if len(native_checks) != 7 or any(item.get("status") != "PASS" for item in native_checks):
                raise RuntimeError("NATIVE_MIGRATION_CHECKS_INCOMPLETE")
            checks.extend(native_checks)
            status = "PASS"
    except Exception as error:
        checks.append({"name": "native-pg-execution", "status": "FAIL", "detail":
                       str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__})
    finally:
        if container:
            meta = json.loads(docker("inspect", container).stdout)[0]
            if meta["Config"]["Labels"].get("cleanops.staging-pg") != owner: raise RuntimeError("CLEANUP_OWNER_MISMATCH")
            docker("rm", "-f", container)
        if volume_created:
            meta = json.loads(docker("volume", "inspect", owner).stdout)[0]
            if meta["Labels"].get("cleanops.staging-pg") != owner: raise RuntimeError("CLEANUP_VOLUME_MISMATCH")
            docker("volume", "rm", owner)
        report = {"scope": "STAGING_SYNTHETIC_PG_PACKAGING", "result": status, "checks": checks, "cleanup": "PASS",
                  "runtime": "closedBackend", "hostingerAccessed": False}
        path = ROOT / "artifacts/staging-synthetic"; path.mkdir(parents=True, exist_ok=True)
        (path / "postgres-smoke.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception: raise SystemExit("STAGING_PG_SMOKE_FAILED_REDACTED")
