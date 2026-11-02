import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRequest, publicState } from '../../scripts/b1-private-operator-input.mjs'

const base = { version: 1, operatorLoginRole: 'cleanops_b1_operator_login' }
test('rejects undeclared operations, missing values and runtime-looking injections', () => {
  for (const r of [
    { ...base, operation: 'device.recover' },
    { ...base, operation: 'device.issue', reference: 'test', browser: 'A', device: 'B' },
    { ...base, operation: 'first-actor.prepare', manifest: {}, keyVersion: 'totp-v1' },
    { ...base, operation: 'first-actor.confirm', manifest: {}, keyVersion: 'totp-v1', capability: 'x', proof: '000000', recoveryAcknowledged: false },
    { ...base, operatorLoginRole: 'postgres', operation: 'first-actor.status', manifest: {}, keyVersion: 'totp-v1', unexpected: true },
    { ...base, operation: 'device.revoke', id: 'x', revision: '1', authorizationReference: 'ok', extra: 'bad' },
  ]) assert.throws(() => validateRequest(r), /B1_OPERATOR_UNAVAILABLE/)
})
test('permits the reviewed, explicitly declared private paths', () => {
  assert.equal(validateRequest({ ...base, operation: 'first-actor.status', manifest: {}, keyVersion: 'totp-v1' }).operation, 'first-actor.status')
  assert.equal(validateRequest({ ...base, operation: 'device.issue', device: 'machine', browser: 'browser', lifetimeMs: 60000, reference: 'owner-evidence', authorizationReference: 'approval' }).operation, 'device.issue')
})
test('status output never serializes SQL receipts or private ceremony material', () => {
  assert.deepEqual(publicState({ state: 'COMMITTED', generation: 1, receipt: { credentials: 'SECRET' }, provisioningUri: 'SECRET' }), { state: 'COMMITTED', generation: 1 })
  assert.throws(() => publicState({ state: 'BACKDOOR', receipt: 'bad' }), /B1_OPERATOR_UNAVAILABLE/)
})
