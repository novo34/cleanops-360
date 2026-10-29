import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { open } from "node:fs/promises"

// Reviewed, versioned SQL only. New or changed migrations require an explicit
// manifest update; filesystem discovery must never become an execution allowlist.
const migrations = [
  {
    id: "0001_system_status",
    profile: "foundation",
    file: "0001_system_status.sql",
    sha256: "a9392c9c0632117b6fe7e924cf9c7d3fc1bfe348bb1adb6460bdcaf9a907f357",
  },
  {
    id: "0002_first_actor",
    profile: "b1",
    proposed: true,
    file: "0002_first_actor.review.sql",
    sha256: "89cf831220d23e01c528640412f06143eda5d52e1230217e8dfad0f7f89d5102",
  },
]

export async function loadTrustedMigrations(directory = new URL("../db/migrations/", import.meta.url), profile = "foundation", proposalsOnly = false) {
  if (!["foundation", "b1"].includes(profile)) throw new Error("Unknown migration profile")
  if (typeof proposalsOnly !== 'boolean') throw new Error('Explicit proposal selection required')
  const verified = []
  for (const migration of migrations.filter(m => m.profile === profile && Boolean(m.proposed) === proposalsOnly)) {
    const file = await open(new URL(migration.file, directory), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      if (!(await file.stat()).isFile()) throw new Error(`Migration must be a regular file: ${migration.file}`)
      const contents = await file.readFile()
      if (createHash("sha256").update(contents).digest("hex") !== migration.sha256) {
        throw new Error(`Migration checksum mismatch: ${migration.file}`)
      }
      verified.push({ ...migration, sourceFile: `db/migrations/${migration.file}`, sql: contents.toString("utf8") })
    } finally {
      await file.close()
    }
  }
  return verified.filter(migration => migration.profile === profile)
}

// Initial B1 installation is explicit and separate from incremental migrations.
export async function loadTrustedB1Baseline() {
  const sourceFile = "docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql"
  const sha256 = "965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa"
  const file = await open(new URL(`../${sourceFile}`, import.meta.url), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    if (!(await file.stat()).isFile()) throw new Error("Baseline must be a regular file")
    const contents = await file.readFile()
    if (createHash("sha256").update(contents).digest("hex") !== sha256) throw new Error("Baseline checksum mismatch")
    return { id: "b1_sql14", file: "schema.review.sql", sourceFile, sha256, sql: contents.toString("utf8") }
  } finally { await file.close() }
}
