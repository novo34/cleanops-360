import test from 'node:test'
import assert from 'node:assert/strict'
import { createInstallationContext } from '../../lib/b1/installation-context.ts'

const request = new Request('https://fixture.invalid/auth/me')
test('trusted installation context is absent outside a request and isolated across concurrent requests', async () => {
  const context = createInstallationContext({ normalizeEmail: email => email.toLowerCase(), async resolveRequestContext(r) {
    // Synthetic trusted resolver only; production must authenticate this metadata.
    const n = r.url.endsWith('/a') ? 1 : 2
    return { network: Buffer.alloc(32, n), device: Buffer.alloc(32, n + 2), labels: { device: `Fixture ${n}`, browser: 'Fixture' } }
  } })
  assert.throws(context.transport, /AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.throws(context.sessionLabels, /AUTH_DEPENDENCY_UNAVAILABLE/)
  let release!: () => void
  const barrier = new Promise<void>(resolve => { release = resolve })
  await Promise.all(['a', 'b'].map(async path => context.requestScope(new Request('https://fixture.invalid/' + path), async () => {
    const before = context.transport()
    if (path === 'a') await barrier; else release()
    assert.equal(context.transport().network[0], path === 'a' ? 1 : 2)
    assert.equal(context.transport().device[0], before.device[0])
    assert.equal(context.sessionLabels().device, path === 'a' ? 'Fixture 1' : 'Fixture 2')
    return new Response()
  })))
  assert.throws(context.transport, /AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.equal(context.normalizeEmail('USER@example.invalid'), 'user@example.invalid')
})

test('unvalidated or missing metadata never reaches request work', async () => {
  for (const result of [undefined, { network: Buffer.alloc(1), device: Buffer.alloc(32), labels: {} },
    { network: Buffer.alloc(32), device: Buffer.alloc(32), labels: { device: '', browser: 'Fixture' } }]) {
    let effects = 0
    const context = createInstallationContext({ normalizeEmail: x => x, async resolveRequestContext() { return result as never } })
    await assert.rejects(context.requestScope(request, async () => { effects++; return new Response() }), /AUTH_DEPENDENCY_UNAVAILABLE/)
    assert.equal(effects, 0)
  }
  const context = createInstallationContext({ normalizeEmail: () => '\n', async resolveRequestContext() { throw Error('private resolver unavailable') } })
  assert.throws(() => context.normalizeEmail('a'), /AUTH_DEPENDENCY_UNAVAILABLE/)
  await assert.rejects(context.requestScope(request, async () => new Response()), /private resolver unavailable/)
})

test('resolver body inspection does not consume the HTTP handler body', async () => {
  const context = createInstallationContext({ normalizeEmail: x => x, async resolveRequestContext(r) {
    assert.equal(await r.text(), 'body')
    return { network: Buffer.alloc(32, 1), device: Buffer.alloc(32, 2), labels: { device: 'Fixture', browser: 'Fixture' } }
  } })
  const r = new Request('https://fixture.invalid/auth/login', { method: 'POST', body: 'body' })
  await context.requestScope(r, async () => { assert.equal(await r.text(), 'body'); return new Response() })
})

test('async work detached from a completed request cannot reuse its cleared context', async () => {
  const context = createInstallationContext({ normalizeEmail: x => x, async resolveRequestContext() {
    return { network: Buffer.alloc(32, 1), device: Buffer.alloc(32, 2), labels: { device: 'Fixture', browser: 'Fixture' } }
  } })
  let release!: () => void, late!: Promise<unknown>
  const gate = new Promise<void>(resolve => { release = resolve })
  await context.requestScope(request, async () => {
    late = gate.then(() => context.transport())
    return new Response()
  })
  const rejected = assert.rejects(late, /AUTH_DEPENDENCY_UNAVAILABLE/)
  release()
  await rejected
})
