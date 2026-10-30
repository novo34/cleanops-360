import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reviewedB1Installation } from '../../lib/b1/reviewed-site-installation.ts'
import { register } from '../../instrumentation.ts'
import { handleAuth } from '../../lib/b1/runtime.ts'

test('Next instrumentation does not activate B1 without reviewed private installation', async () => {
  assert.equal(reviewedB1Installation(), undefined)
  const original = process.env.NEXT_RUNTIME
  try {
    process.env.NEXT_RUNTIME = 'nodejs'
    await register()
    const response = await handleAuth(new Request('https://example.invalid/auth/me'), 'getCurrentIdentity')
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('set-cookie'), null)
  } finally {
    if (original === undefined) delete process.env.NEXT_RUNTIME
    else process.env.NEXT_RUNTIME = original
  }
})
