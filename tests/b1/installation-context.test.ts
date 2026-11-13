import test from 'node:test'
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createInstallationContext, type InstallationRequestContext } from '../../lib/b1/installation-context.ts'
import { AuthError } from '../../lib/b1/service.ts'

const request = new Request('https://fixture.invalid/auth/me')

/** Test-only server channel, NOT an ingress authenticator or deployable integration.
 * Models the consumer boundary after a real producer has authenticated metadata.
 * Nothing in Request (including headers/cookies/body) can populate this channel.
 */
function serverContextFixture() {
  const server = new AsyncLocalStorage<unknown>()
  const context = createInstallationContext({
    normalizeEmail: email => email,
    async resolveRequestContext() {
      await Promise.resolve()
      const value = server.getStore()
      if (value === undefined) throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
      return value as InstallationRequestContext
    },
  })
  return { context, run<T>(value: unknown, work: () => T) { return server.run(value, work) } }
}

const fixtureMetadata = (n: number) => ({
  network: Buffer.alloc(32, n), device: Buffer.alloc(32, n + 1),
  labels: { device: `Fixture server ${n}`, browser: 'Fixture server browser' },
})

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

test('forwarding headers, user agent, cookies, custom claims and body cannot replace missing server context', async () => {
  const { context } = serverContextFixture()
  const claims: Record<string, string>[] = [
    { 'x-forwarded-for': '192.0.2.40', forwarded: 'for=192.0.2.40;proto=https' },
    { 'user-agent': 'Fixture claimed browser', 'x-real-ip': '192.0.2.40' },
    { 'x-cleanops-context': JSON.stringify({ network: '1'.repeat(64), device: '2'.repeat(64) }) },
    { 'x-device-id': 'fixture-device', 'x-client-cert': 'fixture-claimed-certificate' },
    { cookie: '__Host-cleanops-device=' + 'x'.repeat(43) },
    { 'x-forwarded-host': 'fixture.invalid', 'x-forwarded-proto': 'https', origin: 'https://fixture.invalid' },
  ]
  let effects = 0
  for (const headers of claims) {
    const r = new Request('https://fixture.invalid/auth/login', {
      method: 'POST', headers,
      body: JSON.stringify({ network: '1'.repeat(64), device: '2'.repeat(64), device_label: 'Claimed device', browser: 'Claimed browser' }),
    })
    await assert.rejects(context.requestScope(r, async () => { effects++; return new Response() }), /AUTH_DEPENDENCY_UNAVAILABLE/)
    assert.throws(context.transport, /AUTH_DEPENDENCY_UNAVAILABLE/)
  }
  assert.equal(effects, 0)
})

test('two overlapping server contexts ignore identical spoofed claims and admit no third contextless request', async () => {
  const fixture = serverContextFixture()
  let release!: () => void, ready!: () => void, entered = 0
  const barrier = new Promise<void>(resolve => { release = resolve })
  const bothReady = new Promise<void>(resolve => { ready = resolve })
  const makeRequest = () => new Request('https://fixture.invalid/auth/me', {
    headers: { 'x-forwarded-for': '192.0.2.99', 'x-device-id': 'same-claim', 'user-agent': 'Same claimed browser' },
  })
  const pending = [11, 21].map(n => fixture.run(fixtureMetadata(n), () => fixture.context.requestScope(makeRequest(), async () => {
    if (++entered === 2) ready()
    await barrier
    assert.equal(fixture.context.transport().network[0], n)
    assert.equal(fixture.context.transport().device[0], n + 1)
    assert.equal(fixture.context.sessionLabels().device, `Fixture server ${n}`)
    return new Response()
  })))
  await bothReady
  let unauthorizedEffects = 0
  try {
    await assert.rejects(fixture.context.requestScope(makeRequest(), async () => { unauthorizedEffects++; return new Response() }), /AUTH_DEPENDENCY_UNAVAILABLE/)
  } finally { release() }
  await Promise.all(pending)
  assert.equal(unauthorizedEffects, 0)
  assert.throws(fixture.context.transport, /AUTH_DEPENDENCY_UNAVAILABLE/)
  assert.throws(fixture.context.sessionLabels, /AUTH_DEPENDENCY_UNAVAILABLE/)
})

test('malformed server metadata fails before effects, including both dimension types and label limits', async () => {
  const fixture = serverContextFixture(), valid = fixtureMetadata(7)
  const invalid = [null, {}, 'serialized claims',
    { ...valid, network: Buffer.alloc(31) }, { ...valid, device: Buffer.alloc(33) },
    { ...valid, network: new Uint8Array(32) }, { ...valid, device: '2'.repeat(64) },
    { ...valid, labels: undefined }, { ...valid, labels: { device: 'Fixture', browser: '' } },
    { ...valid, labels: { device: 'd'.repeat(121), browser: 'Fixture' } },
    { ...valid, labels: { device: 'Fixture', browser: 'bad\0label' } },
    { ...valid, labels: { ...valid.labels, unreviewed: true } },
  ]
  let effects = 0
  for (const value of invalid) {
    await assert.rejects(fixture.run(value, () => fixture.context.requestScope(request, async () => { effects++; return new Response() })), /AUTH_DEPENDENCY_UNAVAILABLE/)
    assert.throws(fixture.context.transport, /AUTH_DEPENDENCY_UNAVAILABLE/)
  }
  assert.equal(effects, 0)
})

test('owned request snapshots survive producer mutation and work failure does not leak into a later request', async () => {
  const fixture = serverContextFixture(), source = fixtureMetadata(9)
  await assert.rejects(fixture.run(source, () => fixture.context.requestScope(request, async () => {
    const copy = fixture.context.transport()
    copy.network.fill(0); copy.device.fill(0)
    source.network.fill(99); source.device.fill(99); source.labels.device = 'Changed after resolution'
    assert.equal(fixture.context.transport().network[0], 9)
    assert.equal(fixture.context.transport().device[0], 10)
    assert.equal(fixture.context.sessionLabels().device, 'Fixture server 9')
    throw Error('fixture work failed')
  })), /fixture work failed/)
  assert.throws(fixture.context.transport, /AUTH_DEPENDENCY_UNAVAILABLE/)
  await fixture.run(fixtureMetadata(19), () => fixture.context.requestScope(request, async () => {
    assert.equal(fixture.context.transport().network[0], 19)
    assert.equal(fixture.context.sessionLabels().device, 'Fixture server 19')
    return new Response()
  }))
})

test('email normalization remains delegated without an inferred case or trimming policy', () => {
  const fixture = serverContextFixture()
  const email = 'MiXeD@Example.invalid'
  assert.equal(fixture.context.normalizeEmail(email), email)
  // The callback above is a fixture only; it supplies no productive policy.
  // A provisioner's stored lowercase example alone cannot prove its transformation.
})
