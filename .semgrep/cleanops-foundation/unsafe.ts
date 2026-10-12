import { exec } from "node:child_process"

export function unsafe(input: string, db: { query: (sql: string) => unknown }) {
  // ruleid: cleanops-child-process-shell
  exec(input)
  // ruleid: cleanops-sql-string-interpolation
  return db.query(`select * from users where id = ${input}`)
}
