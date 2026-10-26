import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url))
test('consolidated proposal is deterministic, byte-pinned, uninstalled and preserves all original contracts', () => {
  const manifest = JSON.parse(read('docs/proposals/b1-consolidated-sql/manifest.json').toString())
  assert.equal(manifest.installationAuthorized, false)
  assert.equal(manifest.sqlCompiled, false)
  assert.equal(manifest.installed, false)
  assert.equal(manifest.runtime, 'closedBackend')
  assert.equal(manifest.authGate05, 'OPEN')
  const sql = read(manifest.candidate.path)
  assert.equal(createHash('sha256').update(sql).digest('hex'), manifest.candidate.sha256)
  for (const source of manifest.sources) {
    const raw = read(source.path)
    assert.equal(createHash('sha1').update(Buffer.from('blob ' + raw.length + '\0')).update(raw).digest('hex'), source.gitBlob)
  }
  const workflow = read('.github/workflows/pg-test-01.yml').toString()
  assert.match(workflow, /workflow_dispatch:/)
  assert.ok(!workflow.includes('pull_request:'))
  assert.ok(!read('scripts/pg-test-01.py').toString().includes(manifest.candidate.path))
})
