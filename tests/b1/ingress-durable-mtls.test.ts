import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpsRequest } from 'node:https'
import { createIngressIssuer, assertionHeader } from '../../lib/b1/ingress-assertion.ts'
import { createForwardAuthHandler } from '../../lib/b1/ingress-forward-auth.ts'
import { startB1IngressListener } from '../../lib/b1/ingress-listener.ts'

function openssl(): string | undefined {
  for (const name of ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe']) {
    if (name !== 'openssl' && !existsSync(name)) continue
    try { execFileSync(name, ['version'], { stdio: 'ignore' }); return name } catch { /* unavailable */ }
  }
  return undefined
}

test('B1 ForwardAuth: HTTPS/mTLS pinned proxy issues an assertion without a device pass; disposed issuer denies', async t => {
  const binary = openssl()
  if (!binary) { t.skip('OpenSSL unavailable for ephemeral TLS fixture'); return }
  const dir = await mkdtemp(join(tmpdir(), 'b1-durable-mtls-'))
  const run = (...args: string[]) => execFileSync(binary, args, { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'], timeout: 15000 })
  let listener: Awaited<ReturnType<typeof startB1IngressListener>> | undefined
  try {
    run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=test-only-ca', '-keyout', 'ca.key', '-out', 'ca.crt')
    for (const name of ['server', 'proxy', 'other']) {
      run('req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=' + name,
        '-keyout', name + '.key', '-out', name + '.csr')
      run('x509', '-req', '-in', name + '.csr', '-CA', 'ca.crt',
        '-CAkey', 'ca.key', '-CAcreateserial', '-out', name + '.crt', '-days', '1')
    }
    const read = (name: string) => readFile(join(dir, name))
    const [ca, serverKey, serverCert, proxyKey, proxyCert, otherKey, otherCert] = await Promise.all([
      read('ca.crt'), read('server.key'), read('server.crt'),
      read('proxy.key'), read('proxy.crt'), read('other.key'), read('other.crt'),
    ])
    const keys = generateKeyPairSync('ed25519')
    const now = Date.now()
    const issuer = createIngressIssuer({
      issuer: 'fixture', audience: 'https://fixture.invalid', contextLifetimeMs: 3000,
      maximumBodyBytes: 1024, bodyTimeoutMs: 500, clock: () => now,
      privateKey: keys.privateKey, pseudonymKey: randomBytes(32),
    })
    const pinned = new X509Certificate(proxyCert).fingerprint256
    let sanitizedIngressHeaders = false
    const handler = createForwardAuthHandler({
      issuer: {
        async issueForAuthenticatedIngress(request, canonicalNetwork) {
          sanitizedIngressHeaders = ['forwarded', 'x-real-ip', 'x-forwarded-for',
            'x-forwarded-method', 'x-forwarded-host', 'x-forwarded-uri',
            'x-forwarded-proto', assertionHeader].every(name => !request.headers.has(name))
          return issuer.issueForAuthenticatedIngress(request, canonicalNetwork)
        },
      }, audience: 'https://fixture.invalid', proxyCertificateSha256: pinned,
      maximumBodyBytes: 1024, timeoutMs: 500,
    })
    listener = await startB1IngressListener({
      binding: '127.0.0.1', port: 9543,
      tls: { ca, key: serverKey, cert: serverCert },
      allowedPaths: ['/private-forward-auth'],
      ready: async () => true, handle: handler, drainTimeoutMs: 1500,
    })
    const port = listener.address.port
    const call = (client: 'proxy' | 'other' | 'none') =>
      new Promise<{ status: number; assertion?: string }>((resolve, reject) => {
        const identity = client === 'proxy' ? { key: proxyKey, cert: proxyCert } :
          client === 'other' ? { key: otherKey, cert: otherCert } : {}
        const req = httpsRequest({ hostname: '127.0.0.1', port,
          method: 'POST', path: '/private-forward-auth', ca,
          checkServerIdentity: () => undefined, // Fixture lacks SAN; never a production setting.
          ...identity, agent: false, timeout: 2000,
          headers: { 'x-forwarded-method': 'POST', 'x-forwarded-proto': 'https',
            'x-forwarded-host': 'fixture.invalid', 'x-forwarded-uri': '/api/auth/login',
            'x-forwarded-for': '192.0.2.1', 'content-type': 'application/json' },
        }, res => { res.resume(); res.on('end', () => resolve({
          status: res.statusCode ?? 0, assertion: res.headers[assertionHeader] as string | undefined,
        })) })
        req.on('error', reject)
        req.on('timeout', () => req.destroy(new Error('HTTPS_TIMEOUT')))
        req.end('{}')
      })
    assert.equal((await call('other')).status, 403)
    await assert.rejects(call('none'))
    const accepted = await call('proxy')
    assert.equal(accepted.status, 204)
    assert.ok(accepted.assertion)
    assert.equal(sanitizedIngressHeaders, true, 'issuer must not receive forwarded or assertion headers')
    // Disposed issuer (shutdown) can no longer mint: the proxy gets a denial, never an assertion.
    issuer.dispose()
    assert.equal((await call('proxy')).status, 403)
  } finally {
    await listener?.close()
    await rm(dir, { recursive: true, force: true })
  }
})
