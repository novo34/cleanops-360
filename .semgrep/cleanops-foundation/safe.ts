import { execFile } from "node:child_process"

// ok: cleanops-child-process-shell
export function safe(input: string, db: { query: (sql: string, values: string[]) => unknown }) {
  execFile("cleanops", ["--id", input])
  return db.query("select * from users where id = $1", [input])
}
