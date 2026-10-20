import { Pool, type PoolClient } from "pg"

let pool: Pool | undefined

export function getPool() {
  if (!process.env.DATABASE_URL) return null
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 3000 })
  return pool
}

export async function withDatabase<T>(callback: (client: PoolClient) => Promise<T>) {
  const database = getPool()
  if (!database) throw new Error("DATABASE_URL is not configured")
  const client = await database.connect()
  try { return await callback(client) } finally { client.release() }
}

export async function checkDatabase() {
  const database = getPool()
  if (!database) return { status: "disconnected" as const, detail: "DATABASE_URL is not configured" }
  try {
    await database.query("SELECT 1")
    return { status: "operational" as const }
  } catch {
    return { status: "degraded" as const, detail: "Database connection failed" }
  }
}
