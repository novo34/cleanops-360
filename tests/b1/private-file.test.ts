import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, lstat, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTrustedPrivateFile } from '../../lib/b1/private-file.ts'

test('private file reader requires exact owner, mode and bounded bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanops-private-file-'))
  const file = join(dir, 'secret')
  try {
    await writeFile(file, 'synthetic-only')
    await chmod(file, 0o600)
    const stat = await lstat(file)
    const config = { path: file, uid: stat.uid, gid: stat.gid, mode: 0o600 as const, maxBytes: 64 }
    const read = await readTrustedPrivateFile(config)
    try { assert.equal(read.toString(), 'synthetic-only') } finally { read.fill(0) }
    await assert.rejects(readTrustedPrivateFile({ ...config, uid: stat.uid + 1 }), /PRIVATE_FILE_UNAVAILABLE/)
    await assert.rejects(readTrustedPrivateFile({ ...config, maxBytes: 4 }), /PRIVATE_FILE_UNAVAILABLE/)
    await assert.rejects(readTrustedPrivateFile({ ...config, path: file + '/..' }), /PRIVATE_FILE_UNAVAILABLE/)
    await chmod(file, 0o644)
    await assert.rejects(readTrustedPrivateFile(config), /PRIVATE_FILE_UNAVAILABLE/)
    await chmod(file, 0o600)
    const link = join(dir, 'alias')
    await symlink(file, link)
    await assert.rejects(readTrustedPrivateFile({ ...config, path: link }), /PRIVATE_FILE_UNAVAILABLE/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
