import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, chmod, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { archive } from './staging-archive.mjs'

async function fixture(work) {
  const dir = await mkdtemp(join(tmpdir(), 'cleanops-synthetic-archive-'))
  const path = name => join(dir, name)
  try {
    await writeFile(path('key'), randomBytes(32), { mode: 0o600 })
    await writeFile(path('input'), randomBytes(1024 * 128))
    await work(path)
  } finally { await rm(dir, { recursive: true, force: true }) }
}
test('authenticated staging archive roundtrip and no plaintext in ciphertext', async () => fixture(async p => {
  await archive('encrypt', p('input'), p('encrypted'), p('key'), 'STAGING_SYNTHETIC')
  await archive('decrypt', p('encrypted'), p('restored'), p('key'), 'STAGING_SYNTHETIC')
  assert.deepEqual(await readFile(p('restored')), await readFile(p('input')))
  assert.equal((await readFile(p('encrypted'))).includes((await readFile(p('input'))).subarray(0, 32)), false)
}))
test('wrong key, tag tampering and truncation never publish restore output', async () => fixture(async p => {
  await archive('encrypt', p('input'), p('encrypted'), p('key'), 'STAGING_SYNTHETIC')
  await writeFile(p('wrong'), randomBytes(32), { mode: 0o600 })
  await assert.rejects(archive('decrypt', p('encrypted'), p('rejected'), p('wrong'), 'STAGING_SYNTHETIC'))
  const original = await readFile(p('encrypted'))
  for (const candidate of [Buffer.from(original), original.subarray(0, 10)]) {
    if (candidate.length === original.length) candidate[candidate.length - 1] ^= 1
    await writeFile(p('tampered'), candidate)
    await assert.rejects(archive('decrypt', p('tampered'), p('rejected'), p('key'), 'STAGING_SYNTHETIC'))
  }
  assert.equal((await readdir(p('.'))).some(n => n === 'rejected' || n.includes('.partial-')), false)
}))
test('scope, key file permissions and overwrite checks preserve existing files', async () => fixture(async p => {
  await assert.rejects(archive('encrypt', p('input'), p('encrypted'), p('key'), 'PRODUCTION'))
  await chmod(p('key'), 0o644)
  await assert.rejects(archive('encrypt', p('input'), p('encrypted'), p('key'), 'STAGING_SYNTHETIC'))
  await chmod(p('key'), 0o600)
  await writeFile(p('encrypted'), 'existing')
  await assert.rejects(archive('encrypt', p('input'), p('encrypted'), p('key'), 'STAGING_SYNTHETIC'))
  assert.equal((await readFile(p('encrypted'))).toString(), 'existing')
}))
