import { exec, execFile } from "node:child_process"

export function unsafe(input: string, db: { query: (sql: string) => unknown }) {
  // ruleid: cleanops-child-process-shell
  exec(input)
  // ruleid: cleanops-sql-string-interpolation
  return db.query(`select * from users where id = ${input}`)
}

export function safe(input: string, db: { query: (sql: string, values: string[]) => unknown }) {
  // ok: cleanops-child-process-shell
  execFile("cleanops", ["--id", input])
  // ok: cleanops-sql-string-interpolation
  return db.query("select * from users where id = $1", [input])
}
