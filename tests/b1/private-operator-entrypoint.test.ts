import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRequest, publicState } from '../../scripts/b1-private-operator-input.mjs'

const base = { version: 1, operatorLoginRole: 'cleanops_b1_operator_login' }
test('rejects undeclared operations, missing values and runtime-looking injections', () => {
  for (const r of [
    { ...base, operation: 'device.recover' },
    // The ingress device pass is retired: its operations are no longer declared.
    { ...base, operation: 'device.issue', device: 'machine', browser: 'browser', lifetimeMs: 60000, reference: 'owner-evidence', authorizationReference: 'approval' },
    { ...base, operation: 'device.revoke', id: 'x', revision: '1', authorizationReference: 'ok' },
    { ...base, operation: 'first-actor.prepare', manifest: {}, keyVersion: 'totp-v1' },
    { ...base, operation: 'first-actor.confirm', manifest: {}, keyVersion: 'totp-v1', capability: 'x', proof: '000000', recoveryAcknowledged: false },
    { ...base, operatorLoginRole: 'postgres', operation: 'first-actor.status', manifest: {}, keyVersion: 'totp-v1', unexpected: true },
  ]) assert.throws(() => validateRequest(r), /B1_OPERATOR_UNAVAILABLE/)
})
test('permits the reviewed, explicitly declared private paths', () => {
  assert.equal(validateRequest({ ...base, operation: 'first-actor.status', manifest: {}, keyVersion: 'totp-v1' }).operation, 'first-actor.status')
})
test('status output never serializes SQL receipts or private ceremony material', () => {
  assert.deepEqual(publicState({ state: 'COMMITTED', generation: 1, receipt: { credentials: 'SECRET' }, provisioningUri: 'SECRET' }), { state: 'COMMITTED', generation: 1 })
  assert.throws(() => publicState({ state: 'BACKDOOR', receipt: 'bad' }), /B1_OPERATOR_UNAVAILABLE/)
})

test('operator manifest source is derived from root-owned file metadata, never a fixed GID', { skip: process.getuid?.() !== 0 && 'root required for chown' }, async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { readOperatorManifestSource } = await import('../../scripts/b1-private-operator.mjs')
  const folder = await fs.mkdtemp(join(tmpdir(), 'b1-operator-manifest-'))
  const path = join(folder, 'installation.json')
  try {
    const input = { sink: { uid: 1000, gid: 1000, directoryUid: 1000, directoryGid: 1000 } }
    await fs.writeFile(path, JSON.stringify(input))
    await fs.chown(path, 0, 1000)
    await fs.chmod(path, 0o440)
    assert.deepEqual((await readOperatorManifestSource(path)).gid, 1000)
    await fs.writeFile(path, JSON.stringify({ ...input, sink: { ...input.sink, gid: 999 } }))
    await assert.rejects(readOperatorManifestSource(path), /B1_OPERATOR_UNAVAILABLE/)
  } finally { await fs.rm(folder, { recursive: true, force: true }) }
})
