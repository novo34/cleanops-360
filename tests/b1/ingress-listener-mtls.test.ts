import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { request } from 'node:https'
import { existsSync } from 'node:fs'
import { startB1IngressListener } from '../../lib/b1/ingress-listener.ts'

function opensslExecutable(): string | undefined {
  const candidates = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe']
  for (const executable of candidates) {
    if (executable !== 'openssl' && !existsSync(executable)) continue
    try { execFileSync(executable, ['version'], { stdio: 'ignore', timeout: 5000 }); return executable }
    catch { /* Candidate not available. */ }
  }
  return undefined
}

test('B1 ingress listener: real mutual TLS, readiness, path isolation and shutdown', async t => {
  const executable = opensslExecutable()
  if (!executable) { t.skip('OpenSSL executable not available; no fixture credentials bundled'); return }
  const directory = await mkdtemp(join(tmpdir(), 'cleanops-b1-ingress-'))
  const run = (...args: string[]) => execFileSync(executable, args, {
    cwd: directory, stdio: 'ignore', timeout: 15000,
  })
  let listener: Awaited<ReturnType<typeof startB1IngressListener>> | undefined
  try {
    run('req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
      '-subj', '/CN=CleanOps Test CA', '-keyout', 'ca.key', '-out', 'ca.crt')
    for (const role of ['server', 'client']) {
      run('req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=' + role,
        '-keyout', role + '.key', '-out', role + '.csr')
      await writeFile(join(directory, role + '.ext'),
        role === 'server'
          ? 'subjectAltName=DNS:localhost,IP:127.0.0.1\\nextendedKeyUsage=serverAuth\\n'
          : 'extendedKeyUsage=clientAuth\\n')
      run('x509', '-req', '-in', role + '.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key',
        '-CAcreateserial', '-days', '1', '-out', role + '.crt', '-extfile', role + '.ext')
    }
    const load = (name: string) => readFile(join(directory, name))
    const [ca, serverKey, serverCert, clientKey, clientCert] = await Promise.all([
      load('ca.crt'), load('server.key'), load('server.crt'), load('client.key'), load('client.crt'),
    ])
    let ready = false
    let calls = 0
    listener = await startB1IngressListener({
      binding: '127.0.0.1', port: 0x2601,
      tls: { ca, key: serverKey, cert: serverCert },
      allowedPaths: ['/auth/login'],
      ready: async () => ready,
      handle: async (_, response) => { calls++; response.writeHead(204); response.end() },
      drainTimeoutMs: 1500,
    })
    const port = listener.address.port
    const send = (path: string, client: boolean) => new Promise<number>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', servername: 'localhost', port, path,
        ca, ...(client ? { key: clientKey, cert: clientCert } : {}),
        method: 'GET', agent: false, timeout: 3000,
      }, response => { response.resume(); response.on('end', () => resolve(response.statusCode ?? 0)) })
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error('HTTPS_TIMEOUT')))
      req.end()
    })
    await assert.rejects(send('/auth/login', false))
    assert.equal(calls, 0)
    assert.equal(await send('/auth/login', true), 403)
    assert.equal(calls, 0)
    ready = true
    assert.equal(await send('/not-authorized', true), 403)
    assert.equal(calls, 0)
    assert.equal(await send('/auth/login', true), 204)
    assert.equal(calls, 1)
    await listener.close()
    await listener.close()
    await assert.rejects(send('/auth/login', true))
  } finally {
    await listener?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
