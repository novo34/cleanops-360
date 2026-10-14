import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import pg from "pg"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const client = await pool.connect()
try {
  await client.query("BEGIN")
  const directory = path.join(process.cwd(), "db/migrations")
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()
  for (const file of files) await client.query(await readFile(path.join(directory, file), "utf8"))
  await client.query("COMMIT")
  console.log(`Applied ${files.length} migration file(s)`)
} catch (error) {
  await client.query("ROLLBACK")
  throw error
} finally {
  client.release()
  await pool.end()
}
