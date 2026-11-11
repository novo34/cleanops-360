// Applies the hash-pinned, reviewed B1 incrementals (0002, 0003) that the standard runner excludes
// (`proposed: true`). Reuses loadTrustedMigrations + migrationProvenance; one transaction, advisory lock,
// journal rows in public._migrations. Requires the SQL14 baseline row. DATABASE_URL only from env (never printed).
import { createRequire } from "node:module"
import { loadTrustedMigrations } from "./trusted-migrations.mjs"
import { migrationProvenance, migrationLock } from "./migrate-postgres.mjs"

const fail = code => { console.error(code); process.exit(1) }
const queue = await loadTrustedMigrations(undefined, "b1", true)
if (!process.env.DATABASE_URL || queue.length !== 2) fail("B1_INCREMENTAL_PRECONDITION")
const source = await migrationProvenance(queue)
const pg = createRequire(import.meta.url)("pg")
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const client = await pool.connect()
let committed = false
try {
  await client.query("BEGIN")
  await client.query("SET LOCAL search_path=public,pg_catalog,pg_temp")
  if ((await client.query(migrationLock)).rows[0]?.locked !== true) fail("MIGRATION_BUSY")
  const rows = (await client.query("SELECT id FROM public._migrations")).rows.map(r => r.id)
  if (!rows.includes("b1_sql14")) fail("B1_BASELINE_REQUIRED")
  const pending = queue.filter(m => !rows.includes(m.id))
  for (const m of pending) {
    await client.query("INSERT INTO public._migrations (id,checksum,profile,source_file,source_commit,runner_sha256,approval_reference) VALUES ($1,$2,'b1',$3,$4,$5,$6)",
      [m.id, m.sha256, m.sourceFile, source.sourceCommit, source.runnerSha256, source.approvalReference])
    await client.query(m.sql)
  }
  await client.query("COMMIT"); committed = true
  console.log(JSON.stringify({ applied: pending.map(m => m.id) }))
} catch { if (!committed) await client.query("ROLLBACK").catch(() => {}); fail("B1_INCREMENTAL_FAILED") }
finally { client.release(); await pool.end() }
