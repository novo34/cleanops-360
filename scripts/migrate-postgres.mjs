import process from "node:process"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { loadTrustedMigrations, loadTrustedB1Baseline } from "./trusted-migrations.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
class MigrationFault extends Error {}
const fail = code => { throw new MigrationFault(code) }
const hash = value => createHash("sha256").update(value).digest("hex")
// Stable across both profiles and the SQL14 installer; transaction-scoped, fail-fast.
export const migrationLock = "SELECT pg_try_advisory_xact_lock(1869764913, 1) AS locked"
const columns = [
  ["id", "text", true], ["checksum", "text", true], ["profile", "text", true], ["source_file", "text", true],
  ["source_commit", "text", true], ["runner_sha256", "text", true], ["approval_reference", "text", true],
  ["applied_by", "text", true], ["applied_at", "timestamp with time zone", true],
]
// Metadata is nullable only DURING the initial transaction so unchanged 0001's
// ID-only INSERT reaches ON CONFLICT. Seal NOT NULL before COMMIT. No committed
// nullable/legacy registry is accepted or auto-upgraded.
const journalDDL = `CREATE TABLE public._migrations (
  id text PRIMARY KEY, checksum text, profile text,
  source_file text, source_commit text, runner_sha256 text,
  approval_reference text, applied_by text NOT NULL DEFAULT CURRENT_USER,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
)`
const sealJournal = "ALTER TABLE public._migrations " + columns.slice(1, 7).map(([name]) => `ALTER COLUMN ${name} SET NOT NULL`).join(", ")
const freshPredicate = `NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'))
 AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'_migrations')
 AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
 AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql')`
export const freshB1Predicate = `${freshPredicate}
 AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname LIKE 'cleanops_%' AND rolname<>'cleanops_bootstrap')`

async function artifacts(profile) {
  if (profile === "foundation") return { queue: await loadTrustedMigrations(), baseline: null }
  if (profile === "b1") return { queue: await loadTrustedMigrations(undefined, "b1"), baseline: await loadTrustedB1Baseline() }
  return fail("UNKNOWN_MIGRATION_PROFILE")
}

export async function migrationProvenance(entries, approval = process.env.MIGRATION_APPROVAL_REFERENCE ?? "local-cli") {
  const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  for (const entry of entries) {
    if (hash(execFileSync("git", ["-C", root, "show", `${commit}:${entry.sourceFile}`], { stdio: ["ignore", "pipe", "pipe"] })) !== entry.sha256) fail("SOURCE_COMMIT_MISMATCH")
  }
  return {
    sourceCommit: commit,
    runnerSha256: hash(Buffer.concat([await readFile(new URL(import.meta.url)), await readFile(new URL("./trusted-migrations.mjs", import.meta.url))])),
    approvalReference: approval,
  }
}
function validateSource(source) {
  if (!source || !/^[a-f0-9]{40}$/.test(source.sourceCommit) || !/^[a-f0-9]{64}$/.test(source.runnerSha256) ||
      typeof source.approvalReference !== "string" || !source.approvalReference.trim() || source.approvalReference.length > 512 || Array.from(source.approvalReference).some(c => c.codePointAt(0) < 32)) fail("MIGRATION_PROVENANCE_REQUIRED")
}
async function history(client) {
  const { rows: present } = await client.query("SELECT to_regclass('public._migrations') AS registry")
  if (!present[0]?.registry) return null
  const { rows: structure } = await client.query(`SELECT a.attname AS name, pg_catalog.format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required
    FROM pg_catalog.pg_attribute a WHERE a.attrelid='public._migrations'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`)
  if (structure.length !== columns.length || structure.some((c, i) => c.name !== columns[i][0] || c.type !== columns[i][1] || c.required !== columns[i][2])) fail("INCOMPATIBLE_MIGRATION_REGISTRY")
  const { rows: safety } = await client.query(`SELECT c.relkind='r' AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid=c.oid AND i.indisprimary AND i.indkey::text='1')
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS safe
    FROM pg_catalog.pg_class c WHERE c.oid='public._migrations'::regclass`)
  if (safety[0]?.safe !== true) fail("INCOMPATIBLE_MIGRATION_REGISTRY")
  return (await client.query("SELECT id, checksum, profile, source_file, source_commit, runner_sha256, approval_reference, applied_by, applied_at FROM public._migrations ORDER BY id")).rows
}
function validateHistory(rows, profile, queue, baseline) {
  if (rows !== null && rows.length === 0) fail("INCOMPATIBLE_EMPTY_MIGRATION_HISTORY")
  const known = new Map([...queue, ...(baseline ? [baseline] : [])].map(m => [m.id, m]))
  const seen = new Set()
  for (const row of rows ?? []) {
    const entry = known.get(row.id)
    if (!entry || seen.has(row.id) || row.profile !== profile || row.source_file !== entry.sourceFile) fail("UNEXPECTED_MIGRATION_HISTORY")
    if (row.checksum !== entry.sha256) fail("APPLIED_MIGRATION_CHECKSUM_MISMATCH")
    validateSource({ sourceCommit: row.source_commit, runnerSha256: row.runner_sha256, approvalReference: row.approval_reference })
    if (typeof row.applied_by !== "string" || !row.applied_by.trim() || row.applied_at == null || !Number.isFinite(new Date(row.applied_at).getTime())) fail("INCOMPATIBLE_MIGRATION_HISTORY")
    seen.add(row.id)
  }
  const applied = queue.map(m => seen.has(m.id))
  if (applied.some((value, i) => value && applied.slice(0, i).includes(false))) fail("NON_PREFIX_MIGRATION_HISTORY")
  return seen
}

/** One runner, one transaction. connect is injectable for offline protocol tests only. */
export async function runMigrations({ connect, mode = "apply", profile = "foundation", source } = {}) {
  if (!["apply", "plan", "offline-plan"].includes(mode)) fail("UNKNOWN_MIGRATION_MODE")
  const { queue, baseline } = await artifacts(profile) // ALL hashes before any connect.
  if (mode === "offline-plan") return { profile, registry: "UNKNOWN_NOT_CONNECTED", migrations: queue.map(({ id, sha256 }) => ({ id, sha256 })), baseline: baseline ? { id: baseline.id, sha256: baseline.sha256, sourceFile: baseline.sourceFile, automatic: false } : null }
  if (mode === "apply") validateSource(source)
  const client = await connect()
  let begun = false, committed = false
  try {
    await client.query(mode === "plan" ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN")
    begun = true
    await client.query("SET LOCAL search_path=public,pg_catalog,pg_temp")
    if (mode === "apply" && (await client.query(migrationLock)).rows[0]?.locked !== true) fail("MIGRATION_BUSY")
    const rows = await history(client)
    const seen = validateHistory(rows, profile, queue, baseline)
    let fresh = null
    if (!rows?.length) fresh = (await client.query(`SELECT (${profile === "b1" ? freshB1Predicate : freshPredicate}) AS fresh`)).rows[0]?.fresh === true
    if (fresh === false) fail("UNREGISTERED_OBJECTS_NO_AUTOMATIC_ADOPTION")
    const pending = queue.filter(m => !seen.has(m.id))
    if (mode === "apply") {
      if (baseline && !seen.has(baseline.id)) fail("B1_BASELINE_REQUIRES_EXPLICIT_INSTALLER")
      if (!rows && pending.length) await client.query(journalDDL)
      for (const migration of pending) {
        // 0001 self-inserts its ID. Pre-register in the SAME transaction so its
        // unchanged ON CONFLICT sees complete metadata; failure rolls both back.
        await client.query("INSERT INTO public._migrations (id,checksum,profile,source_file,source_commit,runner_sha256,approval_reference) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [migration.id, migration.sha256, profile, migration.sourceFile, source.sourceCommit, source.runnerSha256, source.approvalReference])
        await client.query(migration.sql)
        await client.query("UPDATE public._migrations SET applied_at=clock_timestamp() WHERE id=$1", [migration.id])
      }
      if (!rows && pending.length) await client.query(sealJournal)
    }
    await client.query("COMMIT")
    committed = true
    return { profile, registry: rows === null ? "ABSENT_AT_INSPECTION" : "PRESENT", applied: mode === "apply" ? pending.map(m => m.id) : [],
      pending: mode === "plan" ? pending.map(m => m.id) : [], history: mode === "plan" ? rows ?? [] : undefined, baseline: baseline ? { id: baseline.id, sha256: baseline.sha256, applied: seen.has(baseline.id), automatic: false } : null }
  } catch (error) {
    if (begun && !committed) { try { await client.query("ROLLBACK") } catch { /* discard */ } }
    if (error instanceof MigrationFault) throw error
    fail("MIGRATION_DATABASE_FAILURE")
  } finally { try { client.release(!committed) } catch { fail("MIGRATION_CONNECTION_RELEASE_FAILED") } }
}

function literal(value) { return "'" + value.replaceAll("'", "''") + "'" }
/** Offline SQL envelope only. Execution remains behind staging-sql14 ownership/auth guards. */
export async function sql14InstallBatch(record, source) {
  const baseline = await loadTrustedB1Baseline()
  validateSource(source)
  const canonical = JSON.parse(await readFile(new URL("../deploy/staging/RESOURCE_RECORD.json", import.meta.url), "utf8")).STAGING_SYNTHETIC
  const s = record?.STAGING_SYNTHETIC
  if (!s || s.composeProject !== canonical.composeProject || s.composePath !== canonical.composePath || s.databaseName !== canonical.databaseName ||
      s.branch !== "staging" || s.syntheticOnly !== true || ["realPersonalData", "productionDatabaseCopies", "externalCommunications"].some(k => s[k] !== false) ||
      s.deploymentAuthorized !== true || s.sql14FreshInstallAuthorized !== true || !s.deploymentApprovalReference || source.approvalReference !== s.deploymentApprovalReference) fail("EXACT_FRESH_INSTALL_AUTHORIZATION_REQUIRED")
  // Outer BEGIN and historical BEGIN share one PG transaction (nested BEGIN warns,
  // not a savepoint). The historical final COMMIT atomically commits the journal.
  // Original SQL bytes, including both boundary statements, remain intact.
  return `BEGIN;
SET LOCAL standard_conforming_strings=on;
SET LOCAL search_path=public,pg_catalog,pg_temp;
DO $migration_guard$ BEGIN
 IF NOT pg_catalog.pg_try_advisory_xact_lock(1869764913,1) THEN RAISE EXCEPTION 'MIGRATION_BUSY'; END IF;
 IF current_database()<>${literal(canonical.databaseName)} THEN RAISE EXCEPTION 'DATABASE_MISMATCH'; END IF;
 IF to_regclass('public._migrations') IS NOT NULL OR NOT (${freshB1Predicate}) THEN RAISE EXCEPTION 'EMPTY_CLUSTER_REQUIRED'; END IF;
END $migration_guard$;
${journalDDL};
INSERT INTO public._migrations (id,checksum,profile,source_file,source_commit,runner_sha256,approval_reference)
VALUES (${[baseline.id, baseline.sha256, "b1", baseline.sourceFile, source.sourceCommit, source.runnerSha256, source.approvalReference].map(literal).join(",")});
${sealJournal};
${baseline.sql}`
}

export async function main(argv = process.argv.slice(2)) {
  const allowed = ["--apply", "--plan", "--offline-plan", "--emit-sql14-batch", "--profile=foundation", "--profile=b1"]
  if (argv.some(a => !allowed.includes(a)) || new Set(argv).size !== argv.length || argv.filter(a => !a.startsWith("--profile=")).length > 1 || argv.filter(a => a.startsWith("--profile=")).length > 1) fail("MIGRATION_ARGUMENTS_INVALID")
  const profile = argv.includes("--profile=b1") ? "b1" : "foundation"
  if (argv.includes("--emit-sql14-batch")) {
    if (argv.some(a => a.startsWith("--profile="))) fail("MIGRATION_ARGUMENTS_INVALID")
    let input = ""
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 65536) fail("MIGRATION_RECORD_TOO_LARGE") }
    const record = JSON.parse(input)
    const baseline = await loadTrustedB1Baseline()
    process.stdout.write(await sql14InstallBatch(record, await migrationProvenance([baseline], record.STAGING_SYNTHETIC?.deploymentApprovalReference)))
    return
  }
  const mode = argv.includes("--plan") ? "plan" : argv.includes("--offline-plan") ? "offline-plan" : "apply"
  const entries = await artifacts(profile)
  const source = mode === "apply" ? await migrationProvenance([...entries.queue, ...(entries.baseline ? [entries.baseline] : [])]) : undefined
  let pool
  try {
    const result = await runMigrations({ mode, profile, source, connect: async () => {
      if (!process.env.DATABASE_URL) fail("MIGRATION_DATABASE_URL_REQUIRED")
      const { default: pg } = await import("pg")
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
      return pool.connect()
    } })
    console.log(JSON.stringify(result))
  } finally { if (pool) await pool.end() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof MigrationFault ? error.message : "MIGRATION_REJECTED"); process.exitCode = 1 })
}
