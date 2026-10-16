import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url))
const manifest = JSON.parse(read('docs/proposals/pg-test-01-fix/manifest.json').toString())
const gitBlob = (bytes: Buffer) => createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex')
test('PG-TEST-01 proposed execution copies change only the reviewed syntax and stop guards', () => {
  const guard = "DO $review_only$ BEGIN\n RAISE EXCEPTION 'REVIEW_ONLY_OWNER_APPROVAL_AND_EXECUTION_AUTHORIZATION_REQUIRED';\nEND $review_only$;\n"
  for (const [index, artifact] of manifest.changes.entries()) {
    const original = read(artifact.source)
    const candidate = read(artifact.candidate)
    assert.equal(gitBlob(original), artifact.sourceBlob)
    assert.equal(gitBlob(candidate), artifact.candidateBlob)
    let expected = original.toString()
    if (index === 0) {
      expected = expected.replace("IF absolute_seconds<>CASE WHEN risk='SENSITIVE' THEN identity_private.cfg('absolute_sensitive') ELSE identity_private.cfg('absolute_operational') END\n OR idle_seconds<>CASE WHEN risk='SENSITIVE' THEN 1800 ELSE 28800 END THEN",
        "IF absolute_seconds<>(CASE WHEN risk='SENSITIVE' THEN identity_private.cfg('absolute_sensitive') ELSE identity_private.cfg('absolute_operational') END)\n OR idle_seconds<>(CASE WHEN risk='SENSITIVE' THEN 1800 ELSE 28800 END) THEN")
    } else {
      assert.ok(expected.includes(guard))
      expected = expected.replace(guard, '')
    }
    assert.equal(candidate.toString(), expected)
  }
  assert.equal(manifest.sqlExecuted, false)
  assert.equal(manifest.activationAuthorized, false)
  assert.equal(manifest.status, 'REVIEW_ONLY_NOT_AUTHORIZED_NOT_INSTALLED')
})
test('PG-TEST-01 evidence reports failed compilation and blocked product tests without accepting B1', () => {
  const report = JSON.parse(read('docs/implementation/b1/pg-test-01/execution-report.json').toString())
  assert.equal(report.result, 'FAIL')
  assert.equal(report.cleanup, 'PASS')
  assert.equal(report.b1, 'OPEN')
  assert.equal(report.authGate05, 'OPEN')
  assert.equal(report.runtime, 'closedBackend')
  assert.equal(report.checks.find((check: { name: string }) => check.name === 'install-V4').detail.sqlstate, '42601')
  assert.equal(report.checks.find((check: { name: string }) => check.name === 'RLS-21-tables').status, 'BLOCKED')
  assert.ok(report.artifacts.every((artifact: { verified: boolean }) => artifact.verified))
  const harness = read('scripts/pg-test-01.py').toString()
  for (const artifact of manifest.changes) {
    assert.ok(harness.includes(artifact.sourceBlob))
    assert.ok(!harness.includes(artifact.candidateBlob))
  }
})
