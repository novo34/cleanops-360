import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url))
test('authorized consolidated run records exact submitted SQL, atomic failure and cleanup without accepting B1', () => {
  const prefix = 'docs/implementation/b1/consolidated-test-01/'
  const approval = JSON.parse(read(prefix + 'AUTHORIZATION.json').toString())
  const report = JSON.parse(read(prefix + 'EXECUTION_REPORT.json').toString())
  assert.equal(approval.ownerApproved, true)
  assert.equal(report.candidate.gitBlob, approval.candidate.gitBlob)
  assert.equal(report.submittedSqlSha256, approval.candidate.sha256)
  assert.equal(createHash('sha256').update(read(approval.candidate.path)).digest('hex'), approval.candidate.sha256)
  assert.equal(report.result, 'FAIL')
  assert.equal(report.cleanup, 'PASS')
  const find = (name: string) => report.checks.find((check: { name: string }) => check.name === name)
  assert.equal(find('install-consolidated').detail.sqlstate, '42601')
  assert.equal(find('failed-install-transaction-rolled-back').status, 'PASS')
  assert.equal(find('failed-install-roles-rolled-back').status, 'PASS')
  assert.equal(find('preexisting-containers-networks-volumes-unchanged').status, 'PASS')
  assert.equal(find('credential-and-global-TOTP-CAS').status, 'BLOCKED')
  assert.equal(find('backup-restore-integrity').status, 'BLOCKED')
  assert.equal(report.b1RequirementsComplete.count, 0)
  assert.equal(report.b1RequirementsComplete.total, 44)
  assert.equal(report.runtime, 'closedBackend')
  assert.equal(report.authGate05, 'OPEN')
})
