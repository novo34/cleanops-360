import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const matrix = JSON.parse(read('docs/implementation/b1/closure/requirements.json'))
test('B1 closure inventory includes every AuthSpec SRS requirement without pretending real acceptance', () => {
  const srs = read('docs/CLEANOPS_360_SRS_V1_1.md')
  const required = [...srs.matchAll(/^\*\*(REQ-(?:AUTH-\d+|AUTHZ-\d+|TEN-\d+|SEC-020|SEC-021|AUD-001|PR-006|PR-007))\b[^\n]*$/gm)].map(match => match[1])
  assert.equal(required.length, 44)
  assert.deepEqual(matrix.requirements.map((row: { id: string }) => row.id).sort(), required.sort())
  assert.equal(new Set(matrix.requirements.map((row: { id: string }) => row.id)).size, required.length)
  for (const row of matrix.requirements) {
    assert.equal(row.realIntegration, 'NOT_VERIFIED')
    assert.equal(row.acceptance, 'OPEN')
    assert.equal(row.testsExecuted, 'SIMULATED_ONLY_NOT_PRODUCT_ACCEPTANCE')
    assert.ok(row.pending.length && row.evidence.length && row.tests.length)
  }
  assert.equal(matrix.status, 'B1_OPEN')
  assert.equal(matrix.authGate05, 'OPEN')
  assert.equal(matrix.runtime, 'closedBackend')
  assert.equal(matrix.databaseExecutionAuthorized, false)
  assert.equal(matrix.productionActivationAuthorized, false)
  assert.deepEqual(matrix.decisions, ['D1', 'D2', 'D3', 'D4'])
  assert.deepEqual(matrix.scopeConflicts, ['C-SCOPE', 'C-LOGIN'])
})
test('closure inventory preserves all canonical cases and effective HTTP operations', () => {
  const expectedCases = [...read('docs/canonical/auth-review/v4/block-1-test-cases.yaml').matchAll(/^- id: (\S+)/gm)].map(match => match[1])
  assert.equal(expectedCases.length, 26)
  assert.deepEqual(matrix.canonicalCases, expectedCases)
  for (const row of matrix.requirements) for (const id of row.tests) assert.ok(expectedCases.includes(id), row.id + ':' + id)
  const spec = JSON.parse(read('lib/b1/openapi.json'))
  const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods as Record<string, { operationId: string }>).map(([method, operation]) => ({ id: operation.operationId, method: method.toUpperCase(), path })))
  assert.equal(operations.length, 14)
  assert.deepEqual(matrix.httpOperations.map(({ id, method, path }: { id: string; method: string; path: string }) => ({ id, method, path })), operations)
  for (const operation of matrix.httpOperations) {
    assert.equal(operation.integration, 'NOT_VERIFIED')
    assert.equal(operation.acceptance, 'OPEN')
  }
})
test('SQL authorization request pins unexecuted artifacts and does not alter runtime safety', () => {
  assert.equal(matrix.sqlPackages.length, 4)
  for (const artifact of matrix.sqlPackages) {
    const bytes = Buffer.from(read(artifact.path))
    const sha = createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex')
    assert.equal(sha, artifact.gitBlob, artifact.path)
    assert.equal(artifact.installed, false)
  }
  assert.equal(matrix.sqlPackages[2].gitBlob, '6454a7551e61e5857ef39090b24b93fcbdb03bb1')
  assert.equal(matrix.sqlPackages[3].gitBlob, '50590047d35467b2473945731384ae3da5729f28')
  assert.match(read('lib/b1/runtime.ts'), /createAuthHandler\(closedBackend, origin\)/)
  const controls = matrix.operationalControls.map((control: { id: string }) => control.id)
  for (const gate of ['AUTH-GATE-01', 'AUTH-GATE-02', 'AUTH-GATE-03', 'AUTH-GATE-04', 'AUTH-GATE-05', 'D2', 'D3', 'D4', 'INFRA-AUTH']) assert.ok(controls.includes(gate))
})
