import { exec } from "node:child_process"

export function unsafe(input: string, db: { query: (sql: string) => unknown }) {
  exec(input)
  return db.query(`select * from users where id = ${input}`)
}
