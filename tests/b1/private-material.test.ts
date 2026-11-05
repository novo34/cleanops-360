import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPrivatePgPassword, loadPrivateTls } from '../../lib/b1/private-material.ts'

test('private PG password is read on demand and rejects newline material', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanops-material-'))
  const path = join(dir, 'password')
  try {
    await writeFile(path, 'synthetic-value')
    await chmod(path, 0o600)
    const metadata = await stat(path)
    const source = { path, uid: metadata.uid, gid: metadata.gid, mode: 0o600 as const, maxBytes: 128 }
    const password = createPrivatePgPassword(source)
    assert.equal(await password(), 'synthetic-value')
    await assert.rejects(createPrivatePgPassword({ ...source, path: join(dir, 'absent') })(), /PRIVATE_MATERIAL_UNAVAILABLE/)
    await writeFile(path, 'synthetic-value\n')
    await assert.rejects(password(), /PRIVATE_MATERIAL_UNAVAILABLE/)
    await writeFile(path, 'second-value')
    assert.equal(await password(), 'second-value')
    const tls = await loadPrivateTls({ postgresCa: source, baoCa: source, baoCert: source, baoKey: source })
    assert.equal(tls.bao.cert.toString(), 'second-value')
    tls.postgresCa.fill(0)
    tls.bao.ca.fill(0)
    tls.bao.cert.fill(0)
    tls.bao.key.fill(0)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
