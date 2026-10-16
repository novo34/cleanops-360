// CI-only TLS proxy: synthetic browser fixtures, no database or auth backend.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:https'
import { request } from 'node:http'

const directory = mkdtempSync(join(tmpdir(), 'cleanops-ui-tls-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' })
const child = spawn('npm', ['start', '--', '--hostname', '127.0.0.1', '--port', '3001'], { stdio: 'inherit' })
const server = createServer({ key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem')) }, (incoming, outgoing) => {
  if (incoming.url === '/__b1_fixture_probe' && incoming.method === 'POST') {
    const cookies = incoming.headers.cookie ?? ''
    const csrf = incoming.headers['x-csrf-token']
    outgoing.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    outgoing.end(JSON.stringify({
      sameOrigin: incoming.headers.origin === 'https://127.0.0.1:3000',
      sameSite: incoming.headers['sec-fetch-site'] === 'same-origin',
      csrfMatches: typeof csrf === 'string' && cookies.split('; ').includes('__Host-cleanops_csrf=' + csrf),
      bindingPresent: cookies.includes('__Host-cleanops_preauth='),
    }))
    incoming.resume()
    return
  }
  const upstream = request({ hostname: '127.0.0.1', port: 3001, path: incoming.url, method: incoming.method, headers: incoming.headers }, response => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers)
    response.pipe(outgoing)
  })
  upstream.on('error', () => { outgoing.writeHead(503); outgoing.end() })
  incoming.pipe(upstream)
})
server.listen(3000, '127.0.0.1')
function close() { server.close(); child.kill('SIGTERM'); rmSync(directory, { recursive: true, force: true }) }
process.on('SIGTERM', () => { close(); process.exit(0) })
process.on('SIGINT', () => { close(); process.exit(0) })
child.on('exit', code => { close(); process.exit(code ?? 1) })
