import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installTrustedRuntime, runtimeHandler, handleAuth } from '../../lib/b1/runtime.ts'
import type { PrivateRuntimeConfiguration } from '../../lib/b1/private-runtime.ts'

test('B1 HTTP runtime cannot be activated from an incomplete private configuration', () => {
  assert.throws(() => installTrustedRuntime({} as PrivateRuntimeConfiguration))
})

test('B1 HTTP runtime remains fail-closed without reviewed startup integration', async () => {
  const response = await handleAuth(new Request('https://example.invalid/auth/me'), 'getCurrentIdentity')
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('B1 public handler does not expose an install or toggle method', () => {
  assert.equal(typeof runtimeHandler, 'function')
  assert.equal((runtimeHandler as unknown as Record<string, unknown>).activate, undefined)
})
