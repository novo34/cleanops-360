import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { completeB1Installation } from '../../scripts/complete-b1-installation.mjs'

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const openssl = (() => { try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); return true } catch { return false } })()
const skip = (process.getuid?.() !== 0 && 'root required for root:999 files') || (!openssl && 'OpenSSL not available')

test('completion fills only verifiable null fields, never overwrites, backs up, is idempotent and reports what is pending', { skip }, async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'b1-complete-')), backups = await fs.mkdtemp(join(tmpdir(), 'b1-backup-'))
  try {
    const own = async (name: string, data: Buffer | string, mode = 0o440) => { const p = join(dir, name); await fs.writeFile(p, data); await fs.chown(p, 0, 999); await fs.chmod(p, mode); return p }
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '2', '-subj', '/CN=fixture', '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' })
    const cert = await fs.readFile(join(dir, 'c.pem')), key = await fs.readFile(join(dir, 'k.pem'))
    await fs.rm(join(dir, 'c.pem')); await fs.rm(join(dir, 'k.pem'))
    await own('postgres-ca.crt', cert); await own('bao-ca.pem', cert); await own('web-client.pem', cert); await own('web-client-key.pem', key)
    await own('identity.password', 'synthetic-password-without-newline')
    const corpus = sha('synthetic') + '\n'
    await own('password-corpus.sha256', corpus)
    const tenantId = '11111111-1111-4111-8111-111111111111'
    const original = { version: 2, origin: 'https://cleanops.nuvurent.com', lifetimeMs: 5000, catalog: { tenantId },
      corpus: { version: 'xato-minlen12-20261031', sha256: sha(corpus) }, sink: { mode: 0o640 } }
    const manifest = await own('installation.json', JSON.stringify(original))

    const dry = await completeB1Installation({ packageDir: dir })
    assert.equal(dry.applied, false)
    assert.equal(sha(await fs.readFile(manifest)), sha(JSON.stringify(original))) // report mode writes nothing
    const filled = new Map(dry.filled.map(f => [f.path, f.value]))
    assert.equal(filled.get('postgres.database'), 'cleanops_staging')
    assert.equal(filled.get('bao.origin'), 'https://openbao:8200')
    assert.equal(filled.get('baoClientIdentity.certificateSha256'), sha(cert))
    assert.equal(filled.get('sources'), '(contract block)')
    assert.ok(!filled.has('lifetimeMs') && !filled.has('origin'))              // valid existing data is untouched
    assert.ok(dry.differsFromContract.includes('sink.mode'))                   // conflicts are reported, not rewritten
    for (const need of ['catalog.keys', 'postgres.host', 'integration.approval', 'baoClientIdentity.approval', 'ingress.issuer', 'ingress.proxyCertificateSha256', 'maximumCorpusBytes'])
      assert.ok(dry.pendingValues.includes(need), need)
    const status = (label: string) => dry.files.find(f => f.label === label)?.status
    assert.equal(status('sources.postgresPassword'), 'OK')
    assert.equal(status('sources.baoKey'), 'OK')
    assert.equal(status('corpus.source'), 'OK')                                // corpus sha256 matches the manifest
    assert.equal(status('dummyPasswordHash'), 'MISSING_FILE')                  // contract path filled, file not installed
    assert.equal(dry.ready, false)
    assert.ok(!/BEGIN|synthetic-password/.test(JSON.stringify(dry)))           // no secret material in the report

    const applied = await completeB1Installation({ packageDir: dir, apply: true, backupDir: backups })
    assert.equal(applied.applied, true)
    const [bak] = await fs.readdir(backups)
    assert.equal(sha(await fs.readFile(join(backups, bak))), sha(JSON.stringify(original)))
    assert.equal((await fs.stat(join(backups, bak))).mode & 0o7777, 0o400)
    const stat = await fs.stat(manifest)
    assert.deepEqual([stat.uid, stat.gid, stat.mode & 0o7777], [0, 999, 0o440])
    const next = JSON.parse(await fs.readFile(manifest, 'utf8'))
    assert.equal(next.lifetimeMs, 5000); assert.equal(next.sink.mode, 0o640); assert.equal(next.origin, original.origin)
    assert.equal(next.postgres.database, 'cleanops_staging'); assert.equal(next.sources.baoKey.path, '/run/cleanops-b1-private/web-client-key.pem')
    assert.equal(next.postgres.host ?? null, null)                                    // template placeholder, still pending

    const again = await completeB1Installation({ packageDir: dir, apply: true, backupDir: backups })
    assert.equal(again.applied, false); assert.deepEqual(again.filled, [])
    assert.equal((await fs.readdir(backups)).length, 1)                        // idempotent: no new backup or write
    assert.deepEqual(again.pendingValues.sort(), applied.pendingValues.sort())
     // Correct mode but wrong owner must not be silently accepted.
     await fs.chown(manifest, 1000, 1000)
     const wrong = await completeB1Installation({ packageDir: dir })
     assert.ok(wrong.invalid.some(label => label.startsWith('installation.json metadata')))
     const repaired = await completeB1Installation({ packageDir: dir, apply: true, backupDir: backups })
     assert.equal(repaired.applied, true)
     const statAfter = await fs.stat(manifest)
     assert.deepEqual([statAfter.uid, statAfter.gid, statAfter.mode & 0o7777], [0, 999, 0o440])
     assert.equal((await fs.readdir(backups)).length, 1)

    await fs.writeFile(join(dir, 'identity.password'), 'trailing-newline\n')
    assert.match((await completeB1Installation({ packageDir: dir })).files.find(f => f.label === 'sources.postgresPassword')!.status, /INVALID_CONTENT/)
  } finally { await fs.rm(dir, { recursive: true, force: true }); await fs.rm(backups, { recursive: true, force: true }) }
})
