import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { createServer as createTcpServer, type Server } from 'node:net'
import { request } from 'node:https'
import { X509Certificate } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startTrustedB1Server, stopTrustedB1Server } from '../../lib/b1/server-startup.ts'
import { loadReviewedB1Installation } from '../../lib/b1/reviewed-site-installation.ts'
import type { InstallationBootstrapInputs } from '../../lib/b1/installation-bootstrap.ts'
import { createDurableCandidateIssuer, credentialCookie } from '../../lib/b1/ingress-assertion.ts'
import { handleAuth } from '../../lib/b1/runtime.ts'
import { createInstallationFixture } from './helpers/installation-fixture.ts'

const ingress = { binding: '127.0.0.1', port: 9443, sources: {} }

test('B1 trusted server startup rejects absent installation custody without activating HTTP', async () => {
  await assert.rejects(startTrustedB1Server({ bindIngress() {}, ingress } as unknown as InstallationBootstrapInputs), /INSTALLATION_CONFIG_INVALID/)
  await assert.rejects(stopTrustedB1Server(), /B1_SERVER_NOT_STARTED/)
})

test('B1 invalid trusted startup never becomes a runtime selector', async () => {
  const malformed = { inputs: {}, postgres: { environment: 'production' }, bao: { environment: 'staging', mount: 'b1-keys' }, catalog: {}, sources: {}, bindIngress() {}, ingress }
  await assert.rejects(startTrustedB1Server(malformed as unknown as InstallationBootstrapInputs), /INSTALLATION_CONFIG_INVALID/)
})

test('B1 private startup without durable ingress binding rejects before custody access', async () => {
  const withoutBinding = { inputs: {}, postgres: { environment: 'staging' }, bao: { environment: 'staging', mount: 'b1-keys' }, catalog: {}, sources: {}, ingress }
  await assert.rejects(startTrustedB1Server(withoutBinding as unknown as InstallationBootstrapInputs), /B1_INGRESS_BINDING_REQUIRED/)
  await assert.rejects(stopTrustedB1Server(), /B1_SERVER_NOT_STARTED/)
})

test('B1 refuses private runtime activation when the reviewed mTLS ingress is absent', async () => {
  const spec = { bindIngress() {}, inputs: {}, postgres: { environment: 'staging' }, bao: { environment: 'staging', mount: 'b1-keys' }, catalog: {}, sources: {} }
  await assert.rejects(startTrustedB1Server(spec as unknown as InstallationBootstrapInputs), /B1_INGRESS_LISTENER_REQUIRED/)
  await assert.rejects(stopTrustedB1Server(), /B1_SERVER_NOT_STARTED/)
})

function opensslAvailable(): boolean {
  try { execFileSync('openssl', ['version'], { stdio: 'ignore', timeout: 5000 }); return true } catch { return false }
}
const freePort = () => new Promise<number>((resolve, reject) => {
  const probe = createTcpServer().once('error', reject).listen(0, '127.0.0.1', () => {
    const { port } = probe.address() as { port: number }
    probe.close(() => resolve(port))
  })
})

test('B1 server owns the reviewed mTLS ingress lifecycle from the private manifest', async t => {
  if (!opensslAvailable()) { t.skip('OpenSSL executable not available; no fixture credentials bundled'); return }
  const dir = await mkdtemp(join(tmpdir(), 'b1-startup-'))
  const run = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'], timeout: 15000 })
  let pg: Server | undefined
  let fixture: Awaited<ReturnType<typeof createInstallationFixture>> | undefined
  let running = false
  try {
    run('req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1', '-subj', '/CN=Test CA', '-keyout', 'ca.key', '-out', 'ca.crt')
    for (const role of ['server', 'proxy', 'other']) {
      run('req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=' + role, '-keyout', role + '.key', '-out', role + '.csr')
      await writeFile(join(dir, role + '.ext'), role === 'server' ? 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' : 'extendedKeyUsage=clientAuth\n')
      run('x509', '-req', '-in', role + '.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '1', '-out', role + '.crt', '-extfile', role + '.ext')
    }
    const load = (name: string) => readFile(join(dir, name))
    const [ca, serverKey, serverCert, proxyKey, proxyCert, otherKey, otherCert] =
      await Promise.all(['ca.crt', 'server.key', 'server.crt', 'proxy.key', 'proxy.crt', 'other.key', 'other.crt'].map(load))
    // A stand-in PostgreSQL socket only counts connection attempts of the canonical pool.
    let databaseAttempts = 0
    pg = createTcpServer(socket => { databaseAttempts++; socket.destroy() })
    await new Promise<void>(resolve => pg!.listen(0, '127.0.0.1', resolve))
    const port = await freePort()
    fixture = await createInstallationFixture({
      tls: { cert: serverCert, key: serverKey, ca },
      postgres: { host: '127.0.0.1', port: (pg.address() as { port: number }).port },
      ingress: { port, proxyCertificateSha256: new X509Certificate(proxyCert).fingerprint256 },
    })
    const spec = await loadReviewedB1Installation(fixture.manifestSource)

    // A startup failure after the runtime was installed must release everything.
    const brokenPort = { ...spec, ingress: { ...spec.ingress, port: 0 } }
    await assert.rejects(startTrustedB1Server(brokenPort), /INSTALLATION_CONFIG_INVALID/)
    assert.equal((await handleAuth(new Request('https://fixture.invalid/auth/me'), 'getCurrentIdentity')).status, 503)

    const before = { term: process.listeners('SIGTERM'), int: process.listeners('SIGINT') }
    await startTrustedB1Server(spec)
    running = true
    assert.equal(process.listenerCount('SIGTERM'), before.term.length + 1)
    assert.equal(process.listenerCount('SIGINT'), before.int.length + 1)
    await assert.rejects(startTrustedB1Server(spec), /B1_STARTUP_ALREADY_ATTEMPTED/)

    const send = (path: string, identity?: { key: Buffer; cert: Buffer }, cookie?: string) => new Promise<number>((resolve, reject) => {
      const headers: Record<string, string> = identity ? {
        'x-forwarded-method': 'GET', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'fixture.invalid',
        'x-forwarded-uri': '/auth/me', 'x-forwarded-for': '192.0.2.1', ...(cookie ? { cookie } : {}),
      } : {}
      const req = request({ hostname: '127.0.0.1', servername: 'localhost', port, path, ca, ...(identity ?? {}), method: 'GET', agent: false, timeout: 4000, headers },
        response => { response.resume(); response.on('end', () => resolve(response.statusCode ?? 0)) })
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error('HTTPS_TIMEOUT')))
      req.end()
    })
    const proxy = { key: proxyKey, cert: proxyCert }
    // mTLS is mandatory and only the reviewed path exists.
    await assert.rejects(send('/forward-auth'))
    assert.equal(await send('/other', proxy), 403)
    // Device credentials signed by the manifest signer; enrolment itself stays blocked at runtime.
    const enrolled = createDurableCandidateIssuer({
      issuer: 'fixture-issuer', audience: 'https://fixture.invalid', maximumDeviceLifetimeMs: 86400000, contextLifetimeMs: 5000,
      maximumBodyBytes: 16384, bodyTimeoutMs: 2000, clock: Date.now, privateKey: fixture.signingKey, pseudonymKey: Buffer.alloc(32, 7),
      credentials: { read: async () => null, enroll: async () => {}, revoke: async () => {}, recover: async () => {} },
    })
    const cookie = credentialCookie + '=' + await enrolled.issueDeviceCredential({ device: 'Test device', browser: 'Test browser' }, 60000, { reference: 'synthetic', authorizationReference: 'synthetic' })
    enrolled.dispose()
    // A CA-signed peer that is not the pinned proxy is denied before any database access.
    assert.equal(await send('/forward-auth', { key: otherKey, cert: otherCert }, cookie), 403)
    assert.equal(databaseAttempts, 0)
    // The pinned proxy reaches the durable credential repository; with no usable store it still denies.
    assert.equal(await send('/forward-auth', proxy, cookie), 403)
    assert.ok(databaseAttempts >= 1)

    // Termination begins with the listener, then drains runtime and zeroes private material.
    const handler = process.listeners('SIGTERM').find(listener => !before.term.includes(listener))
    assert.ok(handler)
    const completed: string[] = []
    const info = console.info
    console.info = (...args: unknown[]) => { completed.push(String(args[0])) }
    try {
      handler('SIGTERM')
      running = false
      for (let i = 0; i < 50 && process.listenerCount('SIGTERM') !== before.term.length; i++) await new Promise(resolve => setTimeout(resolve, 20))
      assert.equal(process.listenerCount('SIGTERM'), before.term.length)
      // Observable completion marker (D4), emitted after drain, pool close and key zeroing.
      for (let i = 0; i < 50 && !completed.includes('B1_SHUTDOWN_COMPLETE'); i++) await new Promise(resolve => setTimeout(resolve, 20))
      assert.ok(completed.includes('B1_SHUTDOWN_COMPLETE'))
    } finally { console.info = info }
    await assert.rejects(send('/forward-auth', proxy, cookie))
    await assert.rejects(stopTrustedB1Server(), /B1_SERVER_NOT_STARTED/)
    assert.equal((await handleAuth(new Request('https://fixture.invalid/auth/me'), 'getCurrentIdentity')).status, 503)
  } finally {
    if (running) await stopTrustedB1Server().catch(() => {})
    await fixture?.cleanup()
    await new Promise<void>(resolve => pg ? pg.close(() => resolve()) : resolve())
    await rm(dir, { recursive: true, force: true })
  }
})
