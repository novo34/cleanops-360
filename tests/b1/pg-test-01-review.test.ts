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
    const approval = JSON.parse(read('docs/implementation/b1/pg-test-01/PATCH_01_AUTHORIZATION.json').toString())
    assert.ok(approval.candidates.some((entry: { candidateBlob: string }) => entry.candidateBlob === artifact.candidateBlob))
  }
})


test('limited PATCH-01 authorization pins SHA-256 and forbids further SQL changes or activation', () => {
  const approval = JSON.parse(read('docs/implementation/b1/pg-test-01/PATCH_01_AUTHORIZATION.json').toString())
  assert.equal(approval.sourceHead, '66f97ea2bf7eaf49dd915b956879547753b496f1')
  assert.equal(approval.newSqlChangesAuthorized, false)
  assert.equal(approval.productionAuthorized, false)
  assert.equal(approval.runtime, 'closedBackend')
  assert.equal(approval.authGate05, 'OPEN')
  assert.equal(createHash('sha256').update(read(approval.manifest.path)).digest('hex'), approval.manifest.sha256)
  for (const entry of approval.candidates) {
    assert.equal(createHash('sha256').update(read(entry.candidate)).digest('hex'), entry.sha256)
  }
})

test('PATCH-02 stays uninstalled and changes only the demonstrated CASE and terminal transaction decision', () => {
  const proposal = JSON.parse(read('docs/proposals/pg-test-01-fix-02/manifest.json').toString())
  assert.equal(proposal.status, 'REVIEW_ONLY_NOT_AUTHORIZED_NOT_INSTALLED')
  assert.equal(proposal.sqlExecuted, false)
  assert.equal(proposal.activationAuthorized, false)
  const source = read('docs/proposals/pg-test-01-fix/b1-x.candidate.sql').toString()
  const fixed = source.replace("OR m.state<>CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END", "OR m.state<>(CASE WHEN purpose='ENROLLMENT' THEN 'PENDING' ELSE 'ACTIVE' END)")
  assert.notEqual(fixed, source)
  assert.equal(read(proposal.changes[0].path).toString(), fixed)
  assert.equal(read(proposal.changes[1].path).toString(), fixed.replace(/ROLLBACK;\n$/, 'COMMIT;\n'))
  assert.equal(read(proposal.changes[2].path).toString(), read('docs/proposals/pg-test-01-fix/d1.candidate.sql').toString().replace(/ROLLBACK;\n$/, 'COMMIT;\n'))
  for (const entry of proposal.changes) {
    assert.equal(gitBlob(read(entry.path)), entry.gitBlob)
    assert.equal(createHash('sha256').update(read(entry.path)).digest('hex'), entry.sha256)
    assert.ok(!read('scripts/pg-test-01.py').toString().includes(entry.path))
    assert.ok(!read('docs/implementation/b1/pg-test-01/PATCH_01_AUTHORIZATION.json').toString().includes(entry.gitBlob))
  }
})

