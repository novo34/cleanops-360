import { afterEach, describe, expect, it } from "vitest"
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { loadTrustedMigrations } from "../scripts/trusted-migrations.mjs"

const temporaryDirectories: string[] = []
const committedSql = new URL("../db/migrations/0001_system_status.sql", import.meta.url)

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "cleanops-migrations-"))
  temporaryDirectories.push(directory)
  return { directory, url: pathToFileURL(`${directory}/`), file: join(directory, "0001_system_status.sql") }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe("trusted migration manifest", () => {
  it("loads the reviewed SQL from a location anchored to the module", async () => {
    const migrations = await loadTrustedMigrations()
    expect(migrations.map(migration => migration.file)).toEqual(["0001_system_status.sql"])
    expect(migrations[0].sql).toContain("CREATE TABLE IF NOT EXISTS organizations")
  })

  it("ignores SQL files outside the explicit manifest", async () => {
    const { directory, url, file } = await fixture()
    await copyFile(committedSql, file)
    await writeFile(join(directory, "9999_untrusted.sql"), "DROP SCHEMA public CASCADE;")
    expect((await loadTrustedMigrations(url)).map(migration => migration.file)).toEqual(["0001_system_status.sql"])
  })

  it("rejects modified SQL even when its filename is trusted", async () => {
    const { url, file } = await fixture()
    await writeFile(file, "DROP SCHEMA public CASCADE;")
    await expect(loadTrustedMigrations(url)).rejects.toThrow("Migration checksum mismatch")
  })

  it("rejects missing manifest files", async () => {
    const { url } = await fixture()
    await expect(loadTrustedMigrations(url)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects symlinks even when they point to trusted SQL", async () => {
    const { url, file } = await fixture()
    await symlink(committedSql, file)
    await expect(loadTrustedMigrations(url)).rejects.toMatchObject({ code: "ELOOP" })
  })

  it("rejects non-regular files", async () => {
    const { url, file } = await fixture()
    await mkdir(file)
    await expect(loadTrustedMigrations(url)).rejects.toThrow("Migration must be a regular file")
  })
})
