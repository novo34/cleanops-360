type Database = { query: (sql: string, values?: unknown[]) => unknown; execute: (sql: string) => unknown; raw: (sql: string) => unknown }
type RequestInput = { query: string; body: { sql: string }; params: { sql: string }; json: () => Promise<{ sql: string }>; nextUrl: URL }

export async function unsafeSql(db: Database, req: RequestInput, parameterize: (sql: string) => string) {
  // ruleid: cleanops-sql-taint
  db.query(req.query)
  // ruleid: cleanops-sql-taint
  db.query(req.query, ["still unsafe"])
  const sql = req.body.sql
  // ruleid: cleanops-sql-taint
  db.execute(sql)
  // ruleid: cleanops-sql-taint
  db.raw(req.params.sql)
  // ruleid: cleanops-sql-taint
  db.query(req["query"])
  const body = await req.json()
  // ruleid: cleanops-sql-taint
  db.query(body.sql)
  const search = req.nextUrl.searchParams.get("sql") || ""
  // ruleid: cleanops-sql-taint
  db.query(search)
  // ruleid: cleanops-sql-taint
  db.query(parameterize(req.query))
}

export function safeSql(db: Database, req: RequestInput, config: { connection: string }, createPool: (config: { connectionString: string }) => Database) {
  // ok: cleanops-sql-taint
  db.query("SELECT * FROM organizations WHERE id = $1", [req.query])
  const configuredPool = createPool({ connectionString: config.connection })
  // ok: cleanops-sql-taint
  configuredPool.query("SELECT 1")
  // ok: cleanops-sql-taint
  configuredPool.query("BEGIN")
  // ok: cleanops-sql-taint
  configuredPool.query("COMMIT")
  // ok: cleanops-sql-taint
  configuredPool.query("ROLLBACK")
}
