import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, X509Certificate, sign } from 'node:crypto'
import { createServer, request as httpsRequest } from 'node:https'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createIngressIssuer, createIngressVerifier, assertionHeader } from '../../lib/b1/ingress-assertion.ts'
import { createForwardAuthHandler } from '../../lib/b1/ingress-forward-auth.ts'
import { createInstallationContext } from '../../lib/b1/installation-context.ts'
import { canonical } from '../../lib/b1/contracts.ts'

/** Shared atomic replay store double: one claim per (issuer, audience, nonce). */
function replayStore() {
  const seen = new Set<string>()
  return { claims: 0, failNext: false,
    async claim(input: { issuer: string; audience: string; nonce: string; expiresAt: number }) {
      this.claims++
      if (this.failNext) { this.failNext = false; throw new Error('store unavailable') }
      const key = [input.issuer, input.audience, input.nonce].join('|')
      if (seen.has(key)) return 'duplicate' as const
      seen.add(key); return 'claimed' as const
    } }
}

function fixture() {
  let time = 100000
  const keys = generateKeyPairSync('ed25519')
  const common = { issuer: 'test-only-ingress', audience: 'https://fixture.invalid',
    contextLifetimeMs: 1000, maximumBodyBytes: 1024, bodyTimeoutMs: 50, clock: () => time }
  const issuer = createIngressIssuer({ ...common, privateKey: keys.privateKey, pseudonymKey: randomBytes(32) })
  const replay = replayStore()
  const verifierOptions = { ...common, internalOrigins: ['http://127.0.0.1:3000'], publicKey: keys.publicKey, replay,
    topology: 'shared-atomic-all-consumers' as const }
  const verifier = createIngressVerifier(verifierOptions)
  time++
  // No device pass exists: a plain browser request with session cookies only.
  const request = (body = 'hello') => new Request(common.audience + '/api/auth/login?q=1', {
    method: 'POST', headers: { host: 'fixture.invalid', 'content-type': 'application/json' }, body })
  const signed = async (r = request(), network = '192.0.2.1') => {
    const token = await issuer.issueForAuthenticatedIngress(r, network)
    const headers = new Headers(r.headers); headers.set(assertionHeader, token)
    return new Request(r, { headers })
  }
  return { issuer, verifier, verifierOptions, replay, request, signed, keys, advance(n: number) { time += n } }
}
const claimsOf = (request: Request) => JSON.parse(Buffer.from(request.headers.get(assertionHeader)!.split('.')[1], 'base64url').toString('utf8'))
const resign = (request: Request, claims: object, key: import('node:crypto').KeyObject) => {
  const signed = 'b1-context-v1.' + Buffer.from(canonical(claims)).toString('base64url')
  request.headers.set(assertionHeader, signed + '.' + sign(null, Buffer.from(signed), key).toString('base64url'))
  return request
}

test('assertion is issued and verified without any device pass, cookie or User-Agent', async () => {
  const f = fixture(), request = await f.signed()
  assert.deepEqual(Object.keys(claimsOf(request)).sort(), ['aud', 'binding', 'device', 'exp', 'iat', 'iss', 'network', 'nonce'])
  const context = await f.verifier.resolveRequestContext(request)
  assert.equal(context.network.length, 32); assert.equal(context.device.length, 32)
  assert.equal(context.labels.device, 'Dispositivo no identificado'); assert.equal(context.labels.browser, 'Navegador no identificado')
  assert.notDeepEqual(context.network, context.device)
})

test('dimensions derive only from the proxy-attested network and ignore User-Agent', async () => {
  const f = fixture()
  const first = await f.verifier.resolveRequestContext(await f.signed())
  const changed = f.request(); changed.headers.set('user-agent', 'Entirely different browser claim'); changed.headers.set('cookie', 'sid=other')
  const second = await f.verifier.resolveRequestContext(await f.signed(changed))
  assert.deepEqual(first.device, second.device); assert.deepEqual(first.network, second.network)
  const moved = await f.verifier.resolveRequestContext(await f.signed(f.request(), '192.0.2.2'))
  assert.notDeepEqual(first.network, moved.network); assert.notDeepEqual(first.device, moved.device)
  const v6 = await f.verifier.resolveRequestContext(await f.signed(f.request(), '2001:db8::1'))
  assert.equal(v6.network.length, 32)
})

test('issuer -> private integration scope preserves the body and isolates concurrent identities', async () => {
  const f = fixture()
  const scope = createInstallationContext({ normalizeEmail: email => email, resolveRequestContext: f.verifier.resolveRequestContext })
  const requests = await Promise.all(Array.from({ length: 16 }, (_, i) => f.signed(f.request(), `192.0.2.${i + 1}`)))
  const dimensions = await Promise.all(requests.map(r => scope.requestScope(r, async () => {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(await r.text(), 'hello')
    assert.equal(scope.sessionLabels().device, 'Dispositivo no identificado')
    const t = scope.transport(); return new Response(t.device.toString('hex') + t.network.toString('hex'))
  }).then(r => r.text())))
  assert.equal(new Set(dimensions).size, 16)
  assert.throws(() => scope.transport())
})

test('missing assertion, forged headers and invalid proxy network fail closed', async () => {
  const f = fixture()
  await assert.rejects(() => f.verifier.resolveRequestContext(f.request()))
  const forged = f.request()
  forged.headers.set('user-agent', 'Trusted device'); forged.headers.set('x-forwarded-for', '192.0.2.1'); forged.headers.set(assertionHeader, 'forged')
  await assert.rejects(() => f.verifier.resolveRequestContext(forged))
  for (const network of ['192.0.2.1, 192.0.2.2', '', 'not-an-ip', '192.0.2.1:80']) {
    await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(f.request(), network), network)
  }
})

test('tampering with method, path, query, body, bound headers or signed bytes is rejected', async () => {
  for (const mutation of ['method', 'path', 'query', 'body', 'origin', 'authorization', 'cookie', 'token']) {
    const f = fixture(), original = await f.signed(), headers = new Headers(original.headers)
    let url = original.url, method = 'POST', body = 'hello'
    if (mutation === 'method') method = 'PUT'
    if (mutation === 'path') url = url.replace('/login', '/logout')
    if (mutation === 'query') url += '&changed=1'
    if (mutation === 'body') body = 'tampered'
    if (['origin', 'authorization', 'cookie'].includes(mutation)) headers.set(mutation, 'tampered')
    if (mutation === 'token') { const token = headers.get(assertionHeader)!; headers.set(assertionHeader, token.slice(0, -3) + 'AAA') }
    await assert.rejects(() => f.verifier.resolveRequestContext(new Request(url, { method, headers, body })), mutation)
  }
})

test('signed public ForwardAuth request verifies at a private Next listener URL without weakening binding', async () => {
  const f = fixture(), signed = await f.signed()
  const privateUrl = 'http://127.0.0.1:3000/api/auth/login?q=1'
  await assert.rejects(f.verifier.resolveRequestContext(new Request('http://attacker.invalid/api/auth/login?q=1', {
    method: 'POST', headers: new Headers(signed.headers), body: 'hello' })))
  const forged = new Headers(signed.headers); forged.set('host', 'attacker.invalid')
  await assert.rejects(f.verifier.resolveRequestContext(new Request(privateUrl, { method: 'POST', headers: forged, body: 'hello' })))
  const actual = await f.verifier.resolveRequestContext(new Request(privateUrl, { method: 'POST', headers: new Headers(signed.headers), body: 'hello' }))
  assert.equal(actual.network.length, 32)
  await assert.rejects(f.verifier.resolveRequestContext(new Request(privateUrl, { method: 'POST', headers: new Headers(signed.headers), body: 'different' })))
})

test('concurrent replay has exactly one winner through the shared store; unavailable store denies', async () => {
  const f = fixture(), request = await f.signed()
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => f.verifier.resolveRequestContext(request.clone())))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  await assert.rejects(() => f.verifier.resolveRequestContext(request.clone()))
  // A second verifier process sharing the store cannot accept the same assertion either.
  const other = createIngressVerifier({ ...f.verifierOptions })
  await assert.rejects(() => other.resolveRequestContext(request.clone()))
  f.replay.failNext = true
  await assert.rejects(async () => f.verifier.resolveRequestContext(await f.signed()))
  await f.verifier.resolveRequestContext(await f.signed())
})

test('expiry, wrong signing identity, restart epoch, clock rollback and disposed issuer fail closed', async () => {
  const f = fixture(), request = await f.signed()
  await assert.rejects(() => fixture().verifier.resolveRequestContext(request.clone()))
  f.advance(1000)
  await assert.rejects(() => f.verifier.resolveRequestContext(request.clone()))
  const beforeRestart = await f.signed()
  const restarted = createIngressVerifier(f.verifierOptions)
  await assert.rejects(() => restarted.resolveRequestContext(beforeRestart))
  f.advance(1); await restarted.resolveRequestContext(await f.signed())
  f.advance(-1); await assert.rejects(() => restarted.resolveRequestContext(request.clone()))
  f.advance(30000); f.issuer.dispose()
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(f.request(), '192.0.2.1'))
})

test('even validly signed malformed metadata, legacy device claims, wrong scope and excess lifetime are denied', async () => {
  for (const change of [
    { network: 'short' }, { device: 'short' }, { nonce: 'short' }, { iss: 'other' }, { aud: 'https://other.invalid' },
    { iat: 100002 }, { exp: 200000 }, { extra: 'unexpected' },
    // Claims of the retired device-pass protocol must never be accepted.
    { credential: 'a'.repeat(64) }, { deviceLabel: 'Enrolled profile' }, { browserLabel: 'forged' },
  ]) {
    const f = fixture(), request = await f.signed()
    resign(request, { ...claimsOf(request), ...change }, f.keys.privateKey)
    await assert.rejects(() => f.verifier.resolveRequestContext(request), JSON.stringify(change))
  }
  const f = fixture(), request = await f.signed(), missing: Record<string, unknown> = { ...claimsOf(request) }
  delete missing.network
  await assert.rejects(() => f.verifier.resolveRequestContext(resign(request, missing, f.keys.privateKey)))
})

test('oversize and stalled bodies fail closed; invalid configuration is rejected', async () => {
  const f = fixture()
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(f.request('x'.repeat(1025)), '192.0.2.1'))
  const stalled = new Request('https://fixture.invalid/api/auth/login', { method: 'POST', headers: f.request().headers,
    body: new ReadableStream({ start() {} }), duplex: 'half' } as ConstructorParameters<typeof Request>[1])
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(stalled, '192.0.2.1'))
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(new Request('https://evil.invalid/api/auth/login', { method: 'POST', headers: f.request().headers, body: 'hello' }), '192.0.2.1'))
  assert.throws(() => createIngressVerifier({ ...f.verifierOptions, topology: 'multiple' as 'shared-atomic-all-consumers' }))
  assert.throws(() => createIngressVerifier({ ...f.verifierOptions, contextLifetimeMs: 30001 }))
  assert.throws(() => createIngressVerifier({ ...f.verifierOptions, replay: undefined as never }))
  assert.throws(() => createIngressIssuer({ issuer: 'x', audience: 'http://fixture.invalid', contextLifetimeMs: 1000, maximumBodyBytes: 1024,
    bodyTimeoutMs: 50, clock: Date.now, privateKey: f.keys.privateKey, pseudonymKey: randomBytes(32) }))
  assert.throws(() => createIngressIssuer({ ...f.verifierOptions, privateKey: f.keys.privateKey, pseudonymKey: randomBytes(31) }))
})

test('real local mTLS ForwardAuth authenticates a pinned proxy and issues an assertion without a device cookie', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'b1-ingress-test-'))
  const openssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' })
  try {
    // Ephemeral TEST certificates only. No installed certificate or secret is read.
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-subj', '/CN=test-only-ca', '-days', '1')
    for (const name of ['server', 'proxy', 'other']) {
      openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', name + '.key', '-out', name + '.csr', '-subj', '/CN=' + name)
      openssl('x509', '-req', '-in', name + '.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', name + '.crt', '-days', '1')
    }
    const read = (file: string) => readFileSync(join(dir, file))
    const f = fixture()
    const server = createServer({ key: read('server.key'), cert: read('server.crt'), ca: read('ca.crt'), requestCert: true, rejectUnauthorized: true },
      createForwardAuthHandler({ issuer: f.issuer, audience: 'https://fixture.invalid',
        proxyCertificateSha256: new X509Certificate(read('proxy.crt')).fingerprint256, maximumBodyBytes: 1024, timeoutMs: 500 }))
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const address = server.address(); assert.ok(address && typeof address === 'object')
    const call = (client: string | null, extra: Record<string, string> = {}, body = 'hello') => new Promise<{ status: number; token?: string }>((resolve, reject) => {
      const req = httpsRequest({ hostname: '127.0.0.1', port: address.port, method: 'POST', path: '/private-forward-auth', ca: read('ca.crt'),
        checkServerIdentity: () => undefined, // Test certificate has no SAN; never used by the production adapter.
        ...(client ? { key: read(client + '.key'), cert: read(client + '.crt') } : {}),
        headers: { 'x-forwarded-method': 'POST', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'fixture.invalid',
          'x-forwarded-uri': '/api/auth/login?q=1', 'x-forwarded-for': '192.0.2.1', 'content-type': 'application/json', ...extra } }, res => {
        res.resume(); res.on('end', () => resolve({ status: res.statusCode!, token: res.headers[assertionHeader] as string | undefined }))
      }); req.on('error', reject); req.end(body)
    })
    try {
      // Pinned proxy with NO device cookie succeeds; a browser-supplied assertion header is ignored.
      const result = await call('proxy', { [assertionHeader]: 'browser-forgery', 'user-agent': 'Untrusted' })
      assert.equal(result.status, 204); assert.ok(result.token)
      const request = f.request(); request.headers.set(assertionHeader, result.token)
      const context = await f.verifier.resolveRequestContext(request)
      assert.equal(context.network.length, 32); assert.equal(context.labels.device, 'Dispositivo no identificado')
      // Any other client certificate, or none, is refused before any assertion is minted.
      assert.equal((await call('other')).status, 403)
      await assert.rejects(() => call(null))
      for (const extra of [{ 'x-forwarded-for': '192.0.2.1, 192.0.2.2' }, { 'x-forwarded-host': 'evil.invalid' },
        { 'x-forwarded-uri': '//evil.invalid/' }, { 'x-forwarded-proto': 'http' }] as Record<string, string>[]) assert.equal((await call('proxy', extra)).status, 403)
      assert.equal((await call('proxy', {}, 'x'.repeat(1025))).status, 403)
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
