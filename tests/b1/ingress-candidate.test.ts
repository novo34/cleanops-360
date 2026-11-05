import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, X509Certificate, sign } from 'node:crypto'
import { createServer, request as httpsRequest } from 'node:https'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createCandidateIssuer, createCandidateVerifier, assertionHeader, credentialCookie } from '../../lib/b1/ingress-assertion.ts'
import { createForwardAuthHandler } from '../../lib/b1/ingress-forward-auth.ts'
import { createCandidateIntegration, renderPrivateIntegration } from '../../lib/b1/integration-candidate.ts'
import { normalizeCandidateEmail, checkEmailCompatibility, createApprovedEmailNormalizer, proposedEmailPolicy } from '../../lib/b1/email-normalization.ts'
import { canonical } from '../../lib/b1/contracts.ts'
import { createInstallationContext } from '../../lib/b1/installation-context.ts'

function fixture(capacity = 100) {
  let time = 100000
  const keys = generateKeyPairSync('ed25519')
  const common = { issuer: 'test-only-ingress', audience: 'https://fixture.invalid', maximumDeviceLifetimeMs: 60000,
    contextLifetimeMs: 1000, maximumBodyBytes: 1024, bodyTimeoutMs: 50, clock: () => time }
  const issuer = createCandidateIssuer({ ...common, privateKey: keys.privateKey, pseudonymKey: randomBytes(32) })
  const verifierOptions = { ...common, internalOrigins: ['http://127.0.0.1:3000'], publicKey: keys.publicKey, replayCapacity: capacity, topology: 'single-process-single-consumer' as const }
  const verifier = createCandidateVerifier(verifierOptions)
  time++
  const credential = issuer.issueDeviceCredential({ device: 'Enrolled profile', browser: 'Verified enrolment label' }, 30000)
  const request = (body = 'hello', cookie = credential) => new Request(common.audience + '/api/auth/login?q=1', {
    method: 'POST', headers: { host: 'fixture.invalid', cookie: credentialCookie + '=' + cookie, 'content-type': 'application/json' }, body })
  const signed = async (r = request(), network = '192.0.2.1') => {
    const token = await issuer.issueForAuthenticatedIngress(r, network)
    const headers = new Headers(r.headers); headers.set(assertionHeader, token)
    return new Request(r, { headers })
  }
  return { issuer, verifier, verifierOptions, request, signed, credential, keys, advance(n: number) { time += n } }
}

test('candidate email policy is versioned, conservative and shared; compatibility blocks mutation and collisions', () => {
  assert.equal(normalizeCandidateEmail('Mixed@EXAMPLE.COM'), 'Mixed@example.com')
  assert.notEqual(normalizeCandidateEmail('Mixed@example.com'), normalizeCandidateEmail('mixed@example.com'))
  for (const email of [' a@example.com', 'a@example.com ', 'é@example.com', 'a@例子.com', 'a@-example.com', 'a@@example.com']) assert.throws(() => normalizeCandidateEmail(email))
  const report = checkEmailCompatibility([{ id: '1', emailNormalized: 'Mixed@example.com' }])
  const approval = { reference: 'test-only-approval', policyVersion: proposedEmailPolicy.version, snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false }
  const normalizer = createApprovedEmailNormalizer(report, approval)
  assert.equal(normalizer, normalizeCandidateEmail)
  const bad = checkEmailCompatibility([{ id: '1', emailNormalized: 'a@EXAMPLE.COM' }, { id: '2', emailNormalized: 'a@example.com' }])
  assert.equal(bad.changedRows, 1); assert.equal(bad.collisionRows, 2)
  assert.throws(() => createApprovedEmailNormalizer(bad, approval))
  assert.throws(() => createApprovedEmailNormalizer(report, { ...approval, snapshotSha256: '0'.repeat(64) }))
  const empty = checkEmailCompatibility([])
  assert.throws(() => createApprovedEmailNormalizer(empty, { ...approval, snapshotSha256: empty.snapshotSha256 }))
  assert.equal(checkEmailCompatibility([{ id: '1', emailNormalized: 'invalid' }]).invalidRows, 1)
  assert.throws(() => checkEmailCompatibility([{ id: '1', emailNormalized: 'a@example.com' }, { id: '1', emailNormalized: 'b@example.com' }]))
  assert.equal(report.snapshotSha256, checkEmailCompatibility([{ id: '1', emailNormalized: 'Mixed@example.com' }]).snapshotSha256)
})

test('issuer -> private integration -> existing request scope preserves body and isolates concurrent identities', async () => {
  const f = fixture(), report = checkEmailCompatibility([{ id: '1', emailNormalized: 'Mixed@example.com' }])
  const integration = createCandidateIntegration({ report,
    approval: { reference: 'test-only', policyVersion: report.policyVersion, snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false },
    verifier: f.verifierOptions })
  f.advance(1)
  const scope = createInstallationContext(integration)
  const requests = await Promise.all(Array.from({ length: 16 }, async (_, i) => {
    const credential = f.issuer.issueDeviceCredential({ device: `Profile ${i}`, browser: 'Enrolled' }, 30000)
    return f.signed(f.request('hello', credential), `192.0.2.${i + 1}`)
  }))
  const dimensions = await Promise.all(requests.map((r, i) => scope.requestScope(r, async () => {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(scope.sessionLabels().device, `Profile ${i}`)
    assert.equal(await r.text(), 'hello')
    const t = scope.transport(); assert.equal(t.network.length, 32); assert.equal(t.device.length, 32)
    return new Response(t.device.toString('hex') + t.network.toString('hex'))
  }).then(r => r.text())))
  assert.equal(new Set(dimensions).size, 16)
  assert.throws(() => scope.transport())
  assert.equal(integration.normalizeEmail('Mixed@EXAMPLE.COM'), 'Mixed@example.com')
})

test('missing context, arbitrary headers, User-Agent and forged device credentials fail closed', async () => {
  const f = fixture()
  await assert.rejects(() => f.verifier.resolveRequestContext(f.request()))
  const forged = f.request('hello', 'forged')
  forged.headers.set('user-agent', 'Trusted device'); forged.headers.set('x-forwarded-for', '192.0.2.1')
  forged.headers.set(assertionHeader, 'forged')
  await assert.rejects(() => f.verifier.resolveRequestContext(forged))
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(forged, '192.0.2.1'))
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(f.request(), '192.0.2.1, 192.0.2.2'))
  const missing = f.request(); missing.headers.delete('cookie')
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(missing, '192.0.2.1'))
  const duplicate = f.request(); duplicate.headers.append('cookie', credentialCookie + '=' + f.credential)
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(duplicate, '192.0.2.1'))
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
  const f = fixture()
  const signed = await f.signed()
  const privateUrl = 'http://127.0.0.1:3000/api/auth/login?q=1'
  const externalUrl = 'http://attacker.invalid/api/auth/login?q=1'
  await assert.rejects(f.verifier.resolveRequestContext(new Request(externalUrl, {
    method: 'POST', headers: new Headers(signed.headers), body: 'hello',
  })))
  const forged = new Headers(signed.headers)
  forged.set('host', 'attacker.invalid')
  await assert.rejects(f.verifier.resolveRequestContext(new Request(privateUrl, {
    method: 'POST', headers: forged, body: 'hello',
  })))
  const actual = await f.verifier.resolveRequestContext(new Request(privateUrl, {
    method: 'POST', headers: new Headers(signed.headers), body: 'hello',
  }))
  assert.equal(actual.network.length, 32)
  assert.equal(actual.device.length, 32)
  await assert.rejects(f.verifier.resolveRequestContext(new Request(privateUrl, {
    method: 'POST', headers: new Headers(signed.headers), body: 'different',
  })))
})

test('concurrent replay has exactly one winner; capacity fails closed without evicting live nonces', async () => {
  const f = fixture(1), request = await f.signed()
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => f.verifier.resolveRequestContext(request.clone())))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  await assert.rejects(() => f.verifier.resolveRequestContext(request.clone()))
  await assert.rejects(async () => f.verifier.resolveRequestContext(await f.signed()))
  f.advance(1001)
  await f.verifier.resolveRequestContext(await f.signed())
})

test('expiry, wrong signing identity, restart epoch, clock rollback and disposed issuer fail closed', async () => {
  const f = fixture(), request = await f.signed()
  await assert.rejects(() => fixture().verifier.resolveRequestContext(request.clone()))
  f.advance(1000)
  await assert.rejects(() => f.verifier.resolveRequestContext(request.clone()))
  const beforeRestart = await f.signed()
  const restarted = createCandidateVerifier(f.verifierOptions)
  await assert.rejects(() => restarted.resolveRequestContext(beforeRestart))
  f.advance(1); await restarted.resolveRequestContext(await f.signed())
  f.advance(-1); await assert.rejects(() => restarted.resolveRequestContext(request.clone()))
  f.advance(30000); await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(f.request(), '192.0.2.1'))
  f.issuer.dispose(); assert.throws(() => f.issuer.issueDeviceCredential({ device: 'x', browser: 'x' }, 10))
})

test('oversize and stalled bodies fail closed; invalid configuration is rejected', async () => {
  const f = fixture()
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(f.request('x'.repeat(1025)), '192.0.2.1'))
  const stalled = new Request('https://fixture.invalid/api/auth/login', { method: 'POST', headers: f.request().headers,
    body: new ReadableStream({ start() {} }), duplex: 'half' } as ConstructorParameters<typeof Request>[1])
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(stalled, '192.0.2.1'))
  assert.throws(() => f.issuer.issueDeviceCredential({ device: '', browser: 'x' }, 100))
  assert.throws(() => f.issuer.issueDeviceCredential({ device: 'x', browser: 'x\n' }, 100))
  await assert.rejects(() => f.issuer.issueForAuthenticatedIngress(new Request('https://evil.invalid/api/auth/login', { method: 'POST', headers: f.request().headers, body: 'hello' }), '192.0.2.1'))
  assert.throws(() => createCandidateVerifier({ ...f.verifierOptions, topology: 'multiple' as 'single-process-single-consumer' }))
  assert.throws(() => createCandidateVerifier({ ...f.verifierOptions, contextLifetimeMs: 30001 }))

})

test('real local mTLS ForwardAuth authenticates a pinned proxy and produces an assertion accepted by verifier', async () => {
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
          'x-forwarded-uri': '/api/auth/login?q=1', 'x-forwarded-for': '192.0.2.1',
          cookie: credentialCookie + '=' + f.credential, 'content-type': 'application/json', ...extra } }, res => {
        res.resume(); res.on('end', () => resolve({ status: res.statusCode!, token: res.headers[assertionHeader] as string | undefined }))
      }); req.on('error', reject); req.end(body)
    })
    try {
      const result = await call('proxy', { [assertionHeader]: 'browser-forgery', 'user-agent': 'Untrusted' })
      assert.equal(result.status, 204); assert.ok(result.token)
      const request = f.request(); request.headers.set(assertionHeader, result.token)
      const context = await f.verifier.resolveRequestContext(request)
      assert.equal(context.network.length, 32); assert.equal(context.labels.device, 'Enrolled profile')
      assert.equal((await call('other')).status, 403)
      await assert.rejects(() => call(null))
      for (const extra of [{ 'x-forwarded-for': '192.0.2.1, 192.0.2.2' }, { 'x-forwarded-host': 'evil.invalid' },
        { 'x-forwarded-uri': '//evil.invalid/' }, { cookie: 'forged' }] as Record<string, string>[]) assert.equal((await call('proxy', extra)).status, 403)
      assert.equal((await call('proxy', {}, 'x'.repeat(1025))).status, 403)
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})


test('rendered private module exposes exactly the two exports and performs real verification', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'b1-private-candidate-test-'))
  try {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const common = { issuer: 'test-only-module', audience: 'https://fixture.invalid', maximumDeviceLifetimeMs: 60000,
      contextLifetimeMs: 1000, maximumBodyBytes: 1024, bodyTimeoutMs: 100, clock: Date.now }
    const report = checkEmailCompatibility([{ id: 'test-only', emailNormalized: 'A@example.com' }])
    const approval = { reference: 'test-only', policyVersion: report.policyVersion, snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false }
    const options = { report, approval, verifier: { ...common, publicKey, replayCapacity: 10, topology: 'single-process-single-consumer' as const } }
    const source = renderPrivateIntegration(new URL('../../lib/b1/integration-candidate.ts', import.meta.url).href, options)
    assert.throws(() => renderPrivateIntegration('https://example.com/a', options))
    const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
    assert.deepEqual(Object.keys(module).sort(), ['normalizeEmail', 'resolveRequestContext'])
    assert.equal(module.normalizeEmail('A@EXAMPLE.COM'), 'A@example.com')
    await new Promise(resolve => setTimeout(resolve, 2))
    const issuer = createCandidateIssuer({ ...common, privateKey, pseudonymKey: randomBytes(32) })
    const credential = issuer.issueDeviceCredential({ device: 'Enrolled', browser: 'Enrolled' }, 10000)
    const request = new Request('https://fixture.invalid/api/auth/login', { method: 'POST', headers: { cookie: credentialCookie + '=' + credential }, body: '{}' })
    request.headers.set(assertionHeader, await issuer.issueForAuthenticatedIngress(request, '192.0.2.1'))
    assert.equal((await module.resolveRequestContext(request)).device.length, 32)
    await assert.rejects(() => module.resolveRequestContext(request.clone()))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('offline compatibility command is read-only, private and independent of cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'b1-email-test-'))
  const checkoutDir = mkdtempSync(fileURLToPath(new URL('../../.b1-email-test-', import.meta.url)))
  const path = join(dir, 'identities.json')
  const source = JSON.stringify([{ id: 'private-id', emailNormalized: 'Secret@example.com' }])
  const script = fileURLToPath(new URL('../../scripts/check-b1-email-compatibility.mjs', import.meta.url))
  const call = (snapshot = path, mode = '0600') => execFileSync(process.execPath, ['--experimental-strip-types', script, snapshot,
    String(process.getuid!()), String(process.getgid!()), mode], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    writeFileSync(path, source, { mode: 0o600 })
    const output = call()
    assert.equal(JSON.parse(output).status, 'COMPATIBLE')
    assert.ok(!output.includes('Secret')); assert.ok(!output.includes('private-id'))
    assert.equal(readFileSync(path, 'utf8'), source)
    assert.throws(() => call(path, '0644'))
    const inside = join(checkoutDir, 'snapshot.json')
    writeFileSync(inside, source, { mode: 0o600 })
    assert.throws(() => call(inside)) // Must reject even when launched outside checkout.
    const linked = join(dir, 'linked.json'); symlinkSync(path, linked)
    assert.throws(() => call(linked))
    writeFileSync(path, Buffer.from([0x5b, 0xff, 0x5d]))
    assert.throws(() => call())
    writeFileSync(path, 'x'.repeat(65537))
    assert.throws(() => call())
    writeFileSync(path, JSON.stringify([{ id: 'private-id', emailNormalized: 'Secret@EXAMPLE.COM' }]))
    try { call(); assert.fail('incompatible snapshot accepted') }
    catch (error) {
      const result = error as { status?: number; stdout?: string; stderr?: string }
      assert.equal(result.status, 1)
      assert.equal(JSON.parse(result.stdout!).status, 'INCOMPATIBLE')
      assert.ok(!result.stdout!.includes('Secret')); assert.ok(!result.stdout!.includes('private-id'))
    }
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(checkoutDir, { recursive: true, force: true }) }
})


test('even validly signed malformed metadata, wrong scope, future timestamps and excess lifetime are denied', async () => {
  for (const change of [
    { network: 'short' }, { device: 'short' }, { nonce: 'short' }, { deviceLabel: '' },
    { browserLabel: 'forged' }, { iss: 'other' }, { aud: 'https://other.invalid' },
    { iat: 100002 }, { exp: 200000 }, { extra: 'unexpected' },
  ]) {
    const f = fixture(), request = await f.signed()
    const parts = request.headers.get(assertionHeader)!.split('.')
    const claims = { ...JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')), ...change }
    const signed = parts[0] + '.' + Buffer.from(canonical(claims)).toString('base64url')
    request.headers.set(assertionHeader, signed + '.' + sign(null, Buffer.from(signed), f.keys.privateKey).toString('base64url'))
    await assert.rejects(() => f.verifier.resolveRequestContext(request))
  }
})

test('stable credential dimensions ignore User-Agent and separate network from device', async () => {
  const f = fixture()
  const first = await f.verifier.resolveRequestContext(await f.signed())
  const changed = f.request(); changed.headers.set('user-agent', 'Entirely different browser claim')
  const second = await f.verifier.resolveRequestContext(await f.signed(changed))
  assert.deepEqual(first.device, second.device); assert.deepEqual(first.network, second.network)
  assert.deepEqual(first.labels, second.labels)
  const moved = await f.verifier.resolveRequestContext(await f.signed(f.request(), '192.0.2.2'))
  assert.deepEqual(first.device, moved.device); assert.notDeepEqual(first.network, moved.network)
  const other = f.issuer.issueDeviceCredential({ device: 'Different enrolled profile', browser: 'Enrolled' }, 30000)
  const different = await f.verifier.resolveRequestContext(await f.signed(f.request('hello', other)))
  assert.notDeepEqual(first.device, different.device); assert.deepEqual(first.network, different.network)
})
