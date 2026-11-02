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
    cwd: directory, stdio: ['ignore', 'ignore', 'pipe'], timeout: 15000,
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
          ? 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n'
          : 'extendedKeyUsage=clientAuth\n')
      run('x509', '-req', '-in', role + '.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key',
        '-CAcreateserial', '-days', '1', '-out', role + '.crt', '-extfile', role + '.ext')
    }
    const load = (name: string) => readFile(join(directory, name))
    const [ca, serverKey, serverCert, clientKey, clientCert] = await Promise.all([
      load('ca.crt'), load('server.key'), load('server.crt'), load('client.key'), load('client.crt'),
    ])
    let ready = false
    let calls = 0
    let hold = false
    let releaseHandler = () => {}
    let signalStarted = () => {}
    const handlerGate = new Promise<void>(resolve => { releaseHandler = resolve })
    const handlerStarted = new Promise<void>(resolve => { signalStarted = resolve })
    listener = await startB1IngressListener({
      binding: '127.0.0.1', port: 0x2601,
      tls: { ca, key: serverKey, cert: serverCert },
      allowedPaths: ['/auth/login'],
      ready: async () => ready,
      handle: async (_, response) => { calls++; if (hold) { signalStarted(); await handlerGate } response.writeHead(204); response.end() },
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
    hold = true
    const inFlight = send('/auth/login', true)
    await handlerStarted
    let finished = false
    const draining = listener.close().then(() => { finished = true })
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(finished, false, 'close must not complete while a handler is running')
    releaseHandler()
    assert.equal(await inFlight, 204)
    await draining
    await listener.close()
    await assert.rejects(send('/auth/login', true))

    // A handler that never completes must not turn drain timeout into success.
    let releaseBlocked = () => {}
    let enteredBlocked = () => {}
    const block = new Promise<void>(resolve => { releaseBlocked = resolve })
    const entered = new Promise<void>(resolve => { enteredBlocked = resolve })
    const blockedListener = await startB1IngressListener({
      binding: '127.0.0.1', port: 0x2602,
      tls: { ca, key: serverKey, cert: serverCert },
      allowedPaths: ['/auth/login'], ready: async () => true,
      handle: async () => { enteredBlocked(); await block },
      drainTimeoutMs: 100,
    })
    try {
      const blockedRequest = new Promise<void>((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', servername: 'localhost',
          port: blockedListener.address.port, path: '/auth/login', method: 'GET',
          ca, key: clientKey, cert: clientCert, agent: false, timeout: 2000 },
        res => { res.resume(); res.on('end', resolve) })
        req.on('error', reject)
        req.on('timeout', () => req.destroy(new Error('HTTPS_TIMEOUT')))
        req.end()
      })
      // An aborted socket is expected when bounded drain fails.
      void blockedRequest.catch(() => {})
      await entered
      await assert.rejects(blockedListener.close(), /B1_INGRESS_DRAIN_TIMEOUT/)
      await assert.rejects(blockedListener.close(), /B1_INGRESS_DRAIN_TIMEOUT/)
      releaseBlocked()
      await assert.rejects(blockedRequest)
    } finally {
      releaseBlocked()
      await blockedListener.close().catch(() => {})
    }
  } finally {
    await listener?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('B1 ingress listener: allowed-path validation matches the plan validator', async () => {
  const input = (path: string) => ({
    binding: '127.0.0.1', port: 1, tls: { key: 'k', cert: 'c', ca: 'a' }, allowedPaths: [path],
    ready: async () => true, handle: async () => {}, drainTimeoutMs: 100,
  })
  for (const path of ['/a b', '/a\tb', '/a\\b', '//x', '/a?b', '/a#b', '/a%2fb']) {
    await assert.rejects(startB1IngressListener(input(path)), /B1_INGRESS_LISTENER_CONFIG_INVALID/, JSON.stringify(path))
  }
  // A path with an ordinary letter such as "s" must pass path validation (TLS material is bogus, so it fails later).
  await assert.rejects(startB1IngressListener(input('/sessions')), (error: Error) => error.message !== 'B1_INGRESS_LISTENER_CONFIG_INVALID')
})
