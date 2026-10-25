import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UiRequestKeys } from '../../lib/b1/ui-request-keys.ts'
test('uncertain mutation retries keep identity, changed body/path and confirmed actions do not', async () => {
  const keys = new UiRequestKeys()
  const first = await keys.forRequest('verifyMfa','/auth/mfa/verify',{ proof:'123456' })
  assert.equal((await keys.forRequest('verifyMfa','/auth/mfa/verify',{ proof:'123456' })).key,first.key)
  assert.notEqual((await keys.forRequest('verifyMfa','/auth/mfa/verify',{ proof:'654321' })).key,first.key)
  assert.notEqual((await keys.forRequest('verifyMfa','/other',{ proof:'123456' })).key,first.key)
  first.confirmed()
  assert.notEqual((await keys.forRequest('verifyMfa','/auth/mfa/verify',{ proof:'123456' })).key,first.key)
})
test('ceremony cancellation drops request keys and delayed confirmation cannot clear a new key', async () => {
  const keys = new UiRequestKeys()
  const first = await keys.forRequest('logout','/auth/logout',undefined)
  keys.clear()
  const next = await keys.forRequest('logout','/auth/logout',undefined)
  first.confirmed()
  assert.notEqual(next.key,first.key)
  assert.equal((await keys.forRequest('logout','/auth/logout',undefined)).key,next.key)
})

test('cancellation during asynchronous hashing cannot reserve a key for a later ceremony', async () => {
  const keys = new UiRequestKeys()
  const pending = keys.forRequest('verifyMfa','/auth/mfa/verify',{ proof:'123456' })
  keys.clear()
  await assert.rejects(pending, /CEREMONY_CLOSED/)
})
