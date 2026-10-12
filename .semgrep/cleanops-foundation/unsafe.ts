import { exec } from "node:child_process"

// Deliberately insecure code: security-rule fixtures ONLY; never import into the app.
export function unsafe(input: string, db: { query: (sql: string) => unknown }, req: { url: string; query: string }) {
  exec(input)
  db.query(`select * from users where id = ${input}`)
  eval(input)
  void import(input)
  void fetch(req.url)
  db.query(req.query)
  const element = { innerHTML: "" }
  element.innerHTML = input
  const password = "TEST_ONLY_NOT_A_REAL_SECRET_1234"
  return { element, password }
}
