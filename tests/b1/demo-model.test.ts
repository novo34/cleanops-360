import test from 'node:test'
import assert from 'node:assert/strict'
import { demoSnapshot, jobIssues, matches, moduleFromPath } from '../../lib/demo/model.ts'

test('public demo scenarios have isolated coherent synthetic references and no shared mutable state', () => {
  const a = demoSnapshot('leman'), b = demoSnapshot('alpes')
  for (const snapshot of [a,b]) {
    assert.ok(snapshot.companies.every(c => c.email.endsWith('@example.invalid')))
    assert.equal(new Set(snapshot.jobs.map(j => j.id)).size, snapshot.jobs.length)
    for (const job of snapshot.jobs) {
      assert.ok(snapshot.companies.some(c => c.id === job.companyId))
      assert.ok(job.assigned.every(id => snapshot.employees.some(e => e.id === id)))
      assert.ok(job.start < job.end)
    }
    assert.equal(new Set(snapshot.jobs.map(j => j.type)).size, 4)
  }
  assert.ok(!a.jobs.some(j => b.jobs.some(other => other.id === j.id)))
  a.employees[0].name = 'Changed only in this instance'
  assert.notEqual(demoSnapshot('leman').employees[0].name, a.employees[0].name)
})
test('demo coverage explains gaps and overlaps without asserting compliance or publishing', () => {
  const snapshot = demoSnapshot('leman')
  assert.deepEqual(jobIssues(snapshot.jobs[0], snapshot), ['Solapamiento de equipo'])
  assert.deepEqual(jobIssues(snapshot.jobs[2], snapshot), ['Faltan 2 personas'])
  const other = demoSnapshot('alpes')
  assert.deepEqual(jobIssues(other.jobs[0], other), [])
})
test('module allowlist and accent-insensitive search reject unknown/deep routes', () => {
  assert.equal(moduleFromPath(), 'dashboard')
  assert.equal(moduleFromPath(['planning']), 'planning')
  assert.equal(moduleFromPath(['admin']), undefined)
  assert.equal(moduleFromPath(['empleados','private']), undefined)
  assert.ok(matches('lucia', 'Lucía Ejemplo'))
})
