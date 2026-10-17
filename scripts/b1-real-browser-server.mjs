// Test process only: actual browser -> TLS -> actual handler -> identity role -> PG16.
// Never imported by application routes. No HTTP endpoint for fixture keys/proofs/admin.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createServer } from 'node:https'
import { request } from 'node:http'

export async function startRealBrowserServer(scenario = 'existing') {
  const input = JSON.parse(process.env.B1_BROWSER_FIXTURE || '{}')
  if (!/^[a-f0-9]{64}$/.test(input.container || '')) throw Error('OWNED_CONTAINER_REQUIRED')
  if (!['existing','enrollment'].includes(scenario)) throw Error('UNKNOWN_TEST_SCENARIO')
  input.scenario = scenario
  const environment = { ...process.env }
  for (const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) delete environment[name]
  if (!/^[a-f0-9]{32}$/.test(input.run || '')) throw Error('OWNERSHIP_LABEL_REQUIRED')
  const metadata = JSON.parse(execFileSync('docker', ['--host=unix:///var/run/docker.sock', 'inspect', input.container], { env: environment, encoding: 'utf8' }))[0]
  if (metadata.Config.Labels?.['cleanops.pgtest01'] !== input.run || metadata.HostConfig.NetworkMode !== 'none'
    || Object.keys(metadata.HostConfig.PortBindings || {}).length || metadata.Mounts.some(m => ['bind','volume'].includes(m.Type))) throw Error('ISOLATION_OR_OWNERSHIP_MISMATCH')
  const child = spawn('docker', ['--host=unix:///var/run/docker.sock', 'exec', '-i', input.container, '/opt/b1-pg05/node', '--experimental-strip-types', '/opt/b1-pg05/scripts/pg05-browser-backend.ts'], { env: environment, stdio: ['pipe','pipe','ignore'] })
  const pending = []
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    const item = pending.shift()
    if (!item) return
    try { item.resolve(JSON.parse(line)) } catch { item.reject(Error('REDACTED_RPC_FAILURE')) }
  })
  child.on('exit', () => { for (const item of pending.splice(0)) item.reject(Error('REDACTED_RPC_EXIT')) })
  function rpc(message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('REDACTED_RPC_TIMEOUT')), 20000)
      pending.push({ resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
      child.stdin.write(JSON.stringify(message) + '\n')
    })
  }
  const directory = mkdtempSync(join(tmpdir(), 'cleanops-real-browser-'))
  let server
  try {
    if (!(await rpc(input)).ready) throw Error('PRIVATE_BACKEND_NOT_READY')
    execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost'], { stdio: 'ignore' })
    const specification = JSON.parse(readFileSync('lib/b1/openapi.json', 'utf8'))
    const operations = Object.entries(specification.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => ({ path, method: method.toUpperCase(), operation: op.operationId })))
    server = createServer({ key: readFileSync(join(directory,'key.pem')), cert: readFileSync(join(directory,'cert.pem')) }, async (incoming, outgoing) => {
      try {
        const path = new URL(incoming.url, 'https://127.0.0.1:3000').pathname
        const operation = operations.find(op => op.method === incoming.method && (op.path === path || (op.path.includes('{session_id}') && /^\/me\/sessions\/[0-9a-f-]{36}$/.test(path))))
        if (operation) {
          const chunks = []; let size = 0
          for await (const chunk of incoming) { size += chunk.length; if (size > 16384) throw Error('BODY_LIMIT'); chunks.push(chunk) }
          // Forward browser-generated Cookie/Origin/Fetch Metadata without inventing authority.
          const result = await rpc({ kind: 'request', path: incoming.url, operation: operation.operation, method: incoming.method, headers: incoming.headers, body: Buffer.concat(chunks).toString() })
          outgoing.writeHead(result.status, { ...Object.fromEntries(result.headers || []), 'set-cookie': result.cookies || [] }); outgoing.end(result.body); return
        }
        let bootstrap
        if (path === '/login' && !incoming.headers.cookie?.includes('__Host-cleanops_session=')) {
          bootstrap = await rpc({ kind: 'bootstrap' })
          if (bootstrap.status !== 200) { outgoing.writeHead(503); outgoing.end(); return }
        }
        const upstream = request({ hostname: '127.0.0.1', port: 3001, path: incoming.url, method: incoming.method, headers: incoming.headers }, response => {
          outgoing.writeHead(response.statusCode ?? 502, { ...response.headers, ...(bootstrap ? { 'set-cookie': bootstrap.cookies } : {}) }); response.pipe(outgoing)
        })
        upstream.on('error', () => { outgoing.writeHead(503); outgoing.end() })
        incoming.pipe(upstream)
      } catch { outgoing.writeHead(503, { 'Cache-Control': 'no-store' }); outgoing.end() }
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3000, '127.0.0.1', resolve) })
    return { rpc, async close() { await new Promise(resolve => server.close(resolve)); child.stdin.end(); child.kill('SIGTERM'); rmSync(directory, { recursive: true, force: true }) } }
  } catch (error) { server?.close(); child.kill('SIGTERM'); rmSync(directory, { recursive: true, force: true }); throw error }
}
