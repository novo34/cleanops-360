import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url))
test('sequential B1 progress counts real accepted requirements and never treats demo as complete', () => {
  const status = JSON.parse(read('docs/implementation/b1/SEQUENTIAL_STATUS.json').toString())
  const rows = JSON.parse(read('docs/implementation/b1/closure/requirements.json').toString()).requirements
  const verified = rows.filter((row: { realIntegration: string; acceptance: string }) => row.realIntegration === 'VERIFIED' && row.acceptance === 'ACCEPTED')
  assert.equal(status.verifiedEndToEnd.denominator, rows.length)
  assert.equal(status.verifiedEndToEnd.numerator, verified.length)
  assert.equal(status.verifiedEndToEnd.percent, 100 * verified.length / rows.length)
  assert.equal(status.state, 'OPEN')
  assert.equal(status.demo, 'UI IMPLEMENTED')
  assert.equal(status.demoFurtherDevelopment, 'SUSPENDED_UNTIL_CURRENT_MODULE_CLOSURE')
  assert.equal(status.foundationAcceptance, 'NOT_EVIDENCED_NOT_INFERRED')
  assert.equal(status.runtime, 'closedBackend')
})
test('consolidated execution request pins reviewed SQL/diff/ACL without granting execution', () => {
  const request = JSON.parse(read('docs/proposals/b1-consolidated-sql/EXECUTION_REQUEST.json').toString())
  const manifest = JSON.parse(read('docs/proposals/b1-consolidated-sql/manifest.json').toString())
  const review = JSON.parse(read('docs/proposals/b1-consolidated-sql/static-review.json').toString())
  assert.deepEqual(request.candidate, manifest.candidate)
  assert.equal(createHash('sha256').update(read(request.fullDiff.path)).digest('hex'), request.fullDiff.sha256)
  assert.equal(request.fullDiff.sha256, review.diffSha256)
  assert.equal(request.ownerApproved, false)
  assert.equal(request.executed, false)
  assert.equal(review.sqlCompiled, false)
  assert.equal(review.installed, false)
  assert.equal(request.environment.network, 'none')
  assert.equal(request.environment.publicPorts, false)
  assert.equal(request.environment.sharedVolumes, false)
  assert.equal(request.environment.data, 'SYNTHETIC_ONLY')
  assert.equal(request.authGate05, 'OPEN')
  assert.equal(request.pgTest01, 'OPEN')
  assert.equal(request.b1, 'OPEN')
})
