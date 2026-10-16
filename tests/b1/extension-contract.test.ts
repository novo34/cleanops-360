import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url))
const contract = JSON.parse(read('docs/proposals/b1-v4-extension/contract.json').toString())
test('extension is an unapplied owner-review proposal, never an implementation unblock', () => {
  assert.equal(contract.status, 'PROPOSED_REQUIRES_OWNER_APPROVAL')
  assert.equal(contract.reviewOnly, true)
  assert.equal(contract.implementationUnblocked, false)
  assert.equal(contract.authGate05, 'OPEN')
  assert.equal(contract.runtime, 'closedBackend')
  assert.deepEqual(contract.decisions.map((d: { id: string }) => d.id), ['B1-X-CREDENTIAL', 'B1-X-TOTP', 'B1-X-BINDING'])
  assert.ok(contract.decisions.every((d: { approval: string }) => d.approval === 'REQUIRED'))
})
test('canonical V4 SQL remains byte-for-byte unchanged at the reviewed base', () => {
  const bytes = read(contract.canonical.path)
  const hash = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
  assert.equal(hash, contract.canonical.gitBlob)
})
test('proposal preserves closed runtime, transaction ordering and no execution authority', () => {
  const runtime = read('lib/b1/runtime.ts').toString()
  assert.match(runtime, /createAuthHandler\(closedBackend, origin\)/)
  assert.deepEqual(contract.lockOrder.slice(0, 2), ['principal', 'credential'])
  assert.ok(contract.approvalDoesNotAuthorize.includes('SQL execution'))
  assert.ok(contract.approvalDoesNotAuthorize.includes('runtime wiring'))
  const proposal = read('docs/proposals/b1-v4-extension/PROPOSAL.md').toString()
  for (const signature of ['credential_material_locked', 'rehash_credential_cas', 'new_preauth_verified',
    'totp_material_locked', 'consume_totp_cas', 'resolve_binding', 'binding_authorization', 'reserve_owned', 'discard_owned', 'complete_owned']) assert.ok(proposal.includes(signature))
})
