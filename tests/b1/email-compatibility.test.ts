import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeCandidateEmail, checkEmailCompatibility, createApprovedEmailNormalizer, proposedEmailPolicy } from '../../lib/b1/email-normalization.ts'

test('candidate email policy is versioned, conservative and shared; compatibility blocks mutation and collisions', () => {
  assert.equal(normalizeCandidateEmail('Mixed@EXAMPLE.COM'), 'Mixed@example.com')
  assert.notEqual(normalizeCandidateEmail('Mixed@example.com'), normalizeCandidateEmail('mixed@example.com'))
  for (const email of [' a@example.com', 'a@example.com ', 'é@example.com', 'a@例子.com', 'a@-example.com', 'a@@example.com']) assert.throws(() => normalizeCandidateEmail(email))
  const report = checkEmailCompatibility([{ id: '1', emailNormalized: 'Mixed@example.com' }])
  const approval = { reference: 'test-only-approval', policyVersion: proposedEmailPolicy.version, snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false }
  const normalizer = createApprovedEmailNormalizer(report, approval)
  assert.equal(normalizer, normalizeCandidateEmail)
  const bad = checkEmailCompatibility([{ id: '1', emailNormalized: 'a@EXAMPLE.COM' }, { id: '2', emailNormalized: 'a@example.com' }])
  assert.equal(bad.changedRows, 1); assert.equal(bad.collisionRows, 2)
  assert.throws(() => createApprovedEmailNormalizer(bad, approval))
  assert.throws(() => createApprovedEmailNormalizer(report, { ...approval, snapshotSha256: '0'.repeat(64) }))
  const empty = checkEmailCompatibility([])
  assert.throws(() => createApprovedEmailNormalizer(empty, { ...approval, snapshotSha256: empty.snapshotSha256 }))
  assert.equal(checkEmailCompatibility([{ id: '1', emailNormalized: 'invalid' }]).invalidRows, 1)
  assert.throws(() => checkEmailCompatibility([{ id: '1', emailNormalized: 'a@example.com' }, { id: '1', emailNormalized: 'b@example.com' }]))
  assert.equal(report.snapshotSha256, checkEmailCompatibility([{ id: '1', emailNormalized: 'Mixed@example.com' }]).snapshotSha256)
})

test('offline compatibility command is read-only, private and independent of cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'b1-email-test-'))
  const checkoutDir = mkdtempSync(fileURLToPath(new URL('../../.b1-email-test-', import.meta.url)))
  const path = join(dir, 'identities.json')
  const source = JSON.stringify([{ id: 'private-id', emailNormalized: 'Secret@example.com' }])
  const script = fileURLToPath(new URL('../../scripts/check-b1-email-compatibility.mjs', import.meta.url))
  const call = (snapshot = path, mode = '0600') => execFileSync(process.execPath, ['--experimental-strip-types', script, snapshot,
    String(process.getuid!()), String(process.getgid!()), mode], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    writeFileSync(path, source, { mode: 0o600 })
    const output = call()
    assert.equal(JSON.parse(output).status, 'COMPATIBLE')
    assert.ok(!output.includes('Secret')); assert.ok(!output.includes('private-id'))
    assert.equal(readFileSync(path, 'utf8'), source)
    assert.throws(() => call(path, '0644'))
    const inside = join(checkoutDir, 'snapshot.json')
    writeFileSync(inside, source, { mode: 0o600 })
    assert.throws(() => call(inside)) // Must reject even when launched outside checkout.
    const linked = join(dir, 'linked.json'); symlinkSync(path, linked)
    assert.throws(() => call(linked))
    writeFileSync(path, Buffer.from([0x5b, 0xff, 0x5d]))
    assert.throws(() => call())
    writeFileSync(path, 'x'.repeat(65537))
    assert.throws(() => call())
    writeFileSync(path, JSON.stringify([{ id: 'private-id', emailNormalized: 'Secret@EXAMPLE.COM' }]))
    try { call(); assert.fail('incompatible snapshot accepted') }
    catch (error) {
      const result = error as { status?: number; stdout?: string; stderr?: string }
      assert.equal(result.status, 1)
      assert.equal(JSON.parse(result.stdout!).status, 'INCOMPATIBLE')
      assert.ok(!result.stdout!.includes('Secret')); assert.ok(!result.stdout!.includes('private-id'))
    }
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(checkoutDir, { recursive: true, force: true }) }
})
