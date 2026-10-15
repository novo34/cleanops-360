import process from "node:process"
import pg from "pg"
import { loadTrustedMigrations } from "./trusted-migrations.mjs"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
// Verify the entire manifest before connecting or executing any SQL.
const migrations = await loadTrustedMigrations()
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const client = await pool.connect()
try {
  await client.query("BEGIN")
  for (const migration of migrations) await client.query(migration.sql)
  await client.query("COMMIT")
  console.log(`Applied ${migrations.length} migration file(s)`)
} catch (error) {
  await client.query("ROLLBACK")
  throw error
} finally {
  client.release()
  await pool.end()
}
