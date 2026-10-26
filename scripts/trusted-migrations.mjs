import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { open } from "node:fs/promises"

// Reviewed, versioned SQL only. New or changed migrations require an explicit
// manifest update; filesystem discovery must never become an execution allowlist.
const migrations = [
  {
    file: "0001_system_status.sql",
    sha256: "a9392c9c0632117b6fe7e924cf9c7d3fc1bfe348bb1adb6460bdcaf9a907f357",
  },
]

export async function loadTrustedMigrations(directory = new URL("../db/migrations/", import.meta.url)) {
  const verified = []
  for (const migration of migrations) {
    const file = await open(new URL(migration.file, directory), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      if (!(await file.stat()).isFile()) throw new Error(`Migration must be a regular file: ${migration.file}`)
      const contents = await file.readFile()
      if (createHash("sha256").update(contents).digest("hex") !== migration.sha256) {
        throw new Error(`Migration checksum mismatch: ${migration.file}`)
      }
      verified.push({ file: migration.file, sql: contents.toString("utf8") })
    } finally {
      await file.close()
    }
  }
  return verified
}
