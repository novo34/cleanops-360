import { afterEach, describe, expect, it, vi } from "vitest"
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { loadTrustedMigrations, loadTrustedB1Baseline } from "../scripts/trusted-migrations.mjs"
import * as trusted from "../scripts/trusted-migrations.mjs"
import { runMigrations, migrationLock, sql14InstallBatch } from "../scripts/migrate-postgres.mjs"
import { readFile } from "node:fs/promises"

const temporaryDirectories: string[] = []
const committedSql = new URL("../db/migrations/0001_system_status.sql", import.meta.url)

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "cleanops-migrations-"))
  temporaryDirectories.push(directory)
  return { directory, url: pathToFileURL(`${directory}/`), file: join(directory, "0001_system_status.sql") }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe("trusted migration manifest", () => {
  it("loads the reviewed SQL from a location anchored to the module", async () => {
    const migrations = await loadTrustedMigrations()
    expect(migrations.map(migration => migration.file)).toEqual(["0001_system_status.sql"])
    expect(migrations[0].sql).toContain("CREATE TABLE IF NOT EXISTS organizations")
  })

  it("ignores SQL files outside the explicit manifest", async () => {
    const { directory, url, file } = await fixture()
    await copyFile(committedSql, file)
    await writeFile(join(directory, "9999_untrusted.sql"), "DROP SCHEMA public CASCADE;")
    expect((await loadTrustedMigrations(url)).map(migration => migration.file)).toEqual(["0001_system_status.sql"])
  })

  it("rejects modified SQL even when its filename is trusted", async () => {
    const { url, file } = await fixture()
    await writeFile(file, "DROP SCHEMA public CASCADE;")
    await expect(loadTrustedMigrations(url)).rejects.toThrow("Migration checksum mismatch")
  })

  it("rejects missing manifest files", async () => {
    const { url } = await fixture()
    await expect(loadTrustedMigrations(url)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects symlinks even when they point to trusted SQL", async () => {
    const { url, file } = await fixture()
    await symlink(committedSql, file)
    await expect(loadTrustedMigrations(url)).rejects.toMatchObject({ code: "ELOOP" })
  })

  it("rejects non-regular files", async () => {
    const { url, file } = await fixture()
    await mkdir(file)
    await expect(loadTrustedMigrations(url)).rejects.toThrow("Migration must be a regular file")
  })
})

// Protocol model ONLY: no PostgreSQL parser/server or SQL execution in these tests.
const source = { sourceCommit: "a".repeat(40), runnerSha256: "b".repeat(64), approvalReference: "OFFLINE_TEST_ONLY" }
const expectedColumns = [["id","text"],["checksum","text"],["profile","text"],["source_file","text"],["source_commit","text"],["runner_sha256","text"],["approval_reference","text"],["applied_by","text"],["applied_at","timestamp with time zone"]]
type Entry = { id: string; checksum: string; profile: string; source_file: string; source_commit: string; runner_sha256: string; approval_reference: string; applied_by: string; applied_at: Date }
function database(options: { occupied?: boolean; legacy?: boolean; failSql?: boolean; failCommit?: boolean; lostCommitAck?: boolean; pause?: () => Promise<void> } = {}) {
  let durable = { registry: false, rows: [] as Entry[], effects: 0 }
  let locked: symbol | null = null
  const calls: string[] = [], releases: boolean[] = []
  const connect = vi.fn(async () => {
    const owner = Symbol(); let tx = structuredClone(durable)
    return {
      async query(sql: string, values: unknown[] = []) {
        calls.push(sql)
        if (sql.startsWith("BEGIN")) { tx = structuredClone(durable); return { rows: [] } }
        if (sql === migrationLock) {
          if (locked) return { rows: [{ locked: false }] }
          locked = owner; return { rows: [{ locked: true }] }
        }
        if (sql.startsWith("SET LOCAL")) return { rows: [] }
        if (sql.includes("SELECT to_regclass")) return { rows: [{ registry: tx.registry ? "_migrations" : null }] }
        if (sql.includes("pg_catalog.pg_attribute")) return { rows: (options.legacy ? expectedColumns.slice(0, 2) : expectedColumns).map(([name, type]) => ({ name, type, required: true })) }
        if (sql.includes("AS safe")) return { rows: [{ safe: true }] }
        if (sql.startsWith("SELECT id, checksum")) return { rows: structuredClone(tx.rows) }
        if (sql.endsWith("AS fresh")) return { rows: [{ fresh: !options.occupied && tx.effects === 0 }] }
        if (sql.startsWith("CREATE TABLE public._migrations")) { tx.registry = true; return { rows: [] } }
        if (sql.startsWith("INSERT INTO public._migrations")) {
          const [id, checksum, profile, source_file, source_commit, runner_sha256, approval_reference] = values as string[]
          tx.rows.push({ id, checksum, profile, source_file, source_commit, runner_sha256, approval_reference, applied_by: "offline-model", applied_at: new Date() })
          return { rows: [] }
        }
        if (sql.startsWith("CREATE TABLE IF NOT EXISTS organizations")) {
          await options.pause?.(); tx.effects++
          if (options.failSql) throw Error("private server diagnostic")
          return { rows: [] }
        }
        if (sql.startsWith("UPDATE public._migrations") || sql.startsWith("ALTER TABLE public._migrations")) return { rows: [] }
        if (sql === "COMMIT") {
          if (options.failCommit) throw Error("commit failed")
          durable = structuredClone(tx); if (locked === owner) locked = null
          if (options.lostCommitAck) { options.lostCommitAck = false; throw Error("lost ack") }
          return { rows: [] }
        }
        if (sql === "ROLLBACK") { if (locked === owner) locked = null; return { rows: [] } }
        throw Error("Unexpected protocol statement")
      },
      release(discard = false) { releases.push(discard) },
    }
  })
  return { connect, calls, releases, state: () => durable, seed(rows: Entry[]) { durable.registry = true; durable.rows = rows }, registry() { durable.registry = true } }
}
async function appliedEntry(): Promise<Entry> {
  const [migration] = await loadTrustedMigrations()
  return { id: migration.id, checksum: migration.sha256, profile: "foundation", source_file: migration.sourceFile, source_commit: source.sourceCommit, runner_sha256: source.runnerSha256, approval_reference: source.approvalReference, applied_by: "offline-model", applied_at: new Date() }
}

describe("migration journal protocol (offline simulation)", () => {
  it("plans an absent registry without DDL, writes or creating history", async () => {
    const db = database()
    const plan = await runMigrations({ connect: db.connect, mode: "plan" })
    expect(plan.pending).toEqual(["0001_system_status"])
    expect(db.state()).toEqual({ registry: false, rows: [], effects: 0 })
    expect(db.calls[0]).toContain("READ ONLY")
    expect(db.calls.some(q => /^(CREATE|INSERT|UPDATE)/.test(q))).toBe(false)
  })
  it("registers checksum/provenance with effects and runs only pending", async () => {
    const db = database()
    expect((await runMigrations({ connect: db.connect, source })).applied).toEqual(["0001_system_status"])
    expect(db.state().rows[0]).toMatchObject({ checksum: (await appliedEntry()).checksum, source_commit: source.sourceCommit })
    expect(db.state().effects).toBe(1)
    expect(db.calls.findIndex(q => q.startsWith("INSERT INTO public._migrations"))).toBeLessThan(db.calls.findIndex(q => q.startsWith("CREATE TABLE IF NOT EXISTS organizations")))
    expect(db.calls.find(q => q.startsWith("CREATE TABLE public._migrations"))).toContain("checksum text, profile text")
    expect(db.calls.findIndex(q => q.startsWith("ALTER TABLE public._migrations"))).toBeLessThan(db.calls.indexOf("COMMIT"))
    expect((await runMigrations({ connect: db.connect, source })).applied).toEqual([])
    expect(db.state().effects).toBe(1)
  })
  it("rejects changed applied checksums, unexpected IDs/profiles and legacy schemas", async () => {
    const entry = await appliedEntry()
    for (const change of [{ checksum: "0".repeat(64) }, { id: "unreviewed" }, { profile: "b1" }]) {
      const db = database(); db.seed([{ ...entry, ...change }])
      await expect(runMigrations({ connect: db.connect, source })).rejects.toThrow(/CHECKSUM|HISTORY/)
      expect(db.state().effects).toBe(0)
      expect(db.calls.some(q => q.startsWith("INSERT"))).toBe(false)
    }
    const legacy = database({ legacy: true }); legacy.registry()
    await expect(runMigrations({ connect: legacy.connect, source })).rejects.toThrow("INCOMPATIBLE_MIGRATION_REGISTRY")
  })
  it("rejects empty or forged provenance histories instead of adopting them", async () => {
    const empty = database(); empty.registry()
    await expect(runMigrations({ connect: empty.connect, source })).rejects.toThrow("EMPTY_MIGRATION_HISTORY")
    const entry = await appliedEntry()
    for (const change of [{ source_commit: "unverified" }, { applied_by: "" }, { applied_at: null }]) {
      const db = database(); db.seed([{ ...entry, ...change } as Entry])
      await expect(runMigrations({ connect: db.connect, source })).rejects.toThrow(/PROVENANCE|HISTORY/)
      expect(db.state().effects).toBe(0)
    }
  })
  it("rejects unregistered objects instead of IF NOT EXISTS adoption", async () => {
    const db = database({ occupied: true })
    await expect(runMigrations({ connect: db.connect, source })).rejects.toThrow("NO_AUTOMATIC_ADOPTION")
    expect(db.state().registry).toBe(false)
  })
  it("rejects checksum failures before connecting", async () => {
    const connect = vi.fn()
    vi.spyOn(trusted, "loadTrustedMigrations").mockRejectedValue(new Error("Migration checksum mismatch"))
    await expect(runMigrations({ connect, source })).rejects.toThrow("checksum mismatch")
    expect(connect).not.toHaveBeenCalled()
  })
  it("serializes concurrent attempts with the shared fail-fast transaction lock", async () => {
    let resume!: () => void, entered!: () => void
    const inside = new Promise<void>(r => { entered = r })
    const barrier = new Promise<void>(r => { resume = r })
    const db = database({ pause: async () => { entered(); await barrier } })
    const first = runMigrations({ connect: db.connect, source })
    await inside
    await expect(runMigrations({ connect: db.connect, source })).rejects.toThrow("MIGRATION_BUSY")
    expect(db.state().effects).toBe(0)
    resume(); await first
    expect(db.state().effects).toBe(1)
  })
  it("rolls back effects and history on failure; discards uncertain commits without retry", async () => {
    for (const options of [{ failSql: true }, { failCommit: true }]) {
      const db = database(options)
      await expect(runMigrations({ connect: db.connect, source })).rejects.toThrow("MIGRATION_DATABASE_FAILURE")
      expect(db.state()).toEqual({ registry: false, rows: [], effects: 0 })
      expect(db.calls).toContain("ROLLBACK"); expect(db.releases).toEqual([true])
    }
    const uncertain = database({ lostCommitAck: true })
    await expect(runMigrations({ connect: uncertain.connect, source })).rejects.toThrow("MIGRATION_DATABASE_FAILURE")
    expect(uncertain.state().effects).toBe(1)
    expect((await runMigrations({ connect: uncertain.connect, source })).applied).toEqual([])
    expect(uncertain.state().effects).toBe(1)
  })
  it("separates B1 from foundation and never auto-installs SQL14", async () => {
    const db = database()
    const plan = await runMigrations({ connect: db.connect, mode: "plan", profile: "b1" })
    expect(plan.baseline).toMatchObject({ id: "b1_sql14", applied: false, automatic: false })
    await expect(runMigrations({ connect: db.connect, profile: "b1", source })).rejects.toThrow("EXPLICIT_INSTALLER")
    expect(db.calls.some(q => q.includes("CREATE ROLE"))).toBe(false)
  })
  it("accepts the exact recorded B1 baseline without rerunning it or mixing foundation", async () => {
    const baseline = await loadTrustedB1Baseline(), entry = await appliedEntry()
    const db = database(); db.seed([{ ...entry, id: baseline.id, checksum: baseline.sha256, profile: "b1", source_file: baseline.sourceFile }])
    const result = await runMigrations({ connect: db.connect, profile: "b1", source })
    expect(result.baseline?.applied).toBe(true)
    expect(result.applied).toEqual([])
    expect(db.state().effects).toBe(0)
    await expect(runMigrations({ connect: db.connect, source })).rejects.toThrow("UNEXPECTED_MIGRATION_HISTORY")
  })
  it("offline plan verifies artifacts without requiring or connecting a database", async () => {
    const connect = vi.fn()
    expect((await runMigrations({ connect, mode: "offline-plan" })).registry).toBe("UNKNOWN_NOT_CONNECTED")
    expect(connect).not.toHaveBeenCalled()
  })
  it("renders the explicit baseline envelope with unmodified SQL14 after metadata", async () => {
    const record = JSON.parse(await readFile(new URL("../deploy/staging/RESOURCE_RECORD.json", import.meta.url), "utf8"))
    Object.assign(record.STAGING_SYNTHETIC, { deploymentAuthorized: true, sql14FreshInstallAuthorized: true, deploymentApprovalReference: source.approvalReference })
    const baseline = await loadTrustedB1Baseline()
    const batch = await sql14InstallBatch(record, source)
    expect(batch.endsWith(baseline.sql)).toBe(true)
    expect(batch.indexOf("INSERT INTO public._migrations")).toBeLessThan(batch.indexOf(baseline.sql))
    expect(batch).toContain("pg_catalog.pg_try_advisory_xact_lock(1869764913,1)")
    expect(batch).toContain(baseline.sha256)
    expect(batch).toContain("current_database()<>'cleanops_staging'")
    record.STAGING_SYNTHETIC.composeProject = "other"
    await expect(sql14InstallBatch(record, source)).rejects.toThrow("AUTHORIZATION_REQUIRED")
  })
})
