import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import { operations } from '../lib/b1/contracts.ts'
import { sample } from '../tests/b1/schema-fixture.ts'
import { names } from '../lib/b1/service.ts'

const require = createRequire(import.meta.url)
const port = 3110, origin = 'https://cleanops.nuvurent.com', csrf = 'C'.repeat(43)
// Only an isolated local production server; never contact staging or install a backend.
const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '0.0.0.0', '-p', String(port)], {
  stdio: 'inherit', env: { ...process.env, CLEANOPS_AUTH_ORIGIN: origin,
    CLEANOPS_AUTH_INTERNAL_ORIGINS: JSON.stringify([`http://0.0.0.0:${port}`, `https://0.0.0.0:${port}`, `http://127.0.0.1:${port}`]),
    DATABASE_URL: '', CLEANOPS_TEST_DATABASE_URL: '', NEXT_TELEMETRY_DISABLED: '1' },
})
function send(path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      let text = ''; response.setEncoding('utf8')
      response.on('data', chunk => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }))
    })
    request.on('error', reject)
    request.setTimeout(5000, () => request.destroy(new Error('local Next request timeout')))
    request.end(body)
  })
}
function expectError(result, status, code) {
  assert.equal(result.status, status, result.text)
  assert.equal(JSON.parse(result.text).error.code, code)
  assert.equal(result.headers['set-cookie'], undefined)
  assert.equal(result.headers['cache-control'], 'no-store')
}
const headers = { host: 'cleanops.nuvurent.com', origin, 'sec-fetch-site': 'same-origin',
  'x-csrf-token': csrf, cookie: `${names.csrf}=${csrf}`, 'idempotency-key': 'proxy-smoke-key-00001', 'content-type': 'application/json',
  'x-forwarded-host': 'cleanops.nuvurent.com', 'x-forwarded-proto': 'https' }
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const result = await send('/login', 'GET', {}, undefined); if (result.status === 200) { ready = true; break } } catch { /* server startup only */ }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(ready, 'local production Next server ready')
  for (const operation of operations) {
    const query = operation.parameters.filter(p => p.in === 'query' && p.required).map(p => [p.name, String(sample(p.schema))])
    const route = operation.path.replace('{session_id}', '11111111-1111-4111-8111-111111111111') + (query.length ? '?' + new URLSearchParams(query) : '')
    const schema = operation.requestBody?.content['application/json'].schema
    for (const proxy of [true, false]) {
      const transportHeaders = proxy ? headers : { ...headers, host: `127.0.0.1:${port}`, 'x-forwarded-host': `127.0.0.1:${port}`, 'x-forwarded-proto': 'http' }
      expectError(await send(route, operation.method, transportHeaders, schema ? JSON.stringify(sample(schema)) : undefined), 503, 'AUTH_DEPENDENCY_UNAVAILABLE')
    }
  }
  expectError(await send('/auth/login', 'POST', headers, '{}'), 422, 'INVALID_INPUT')
  const login = JSON.stringify({ email: 'synthetic@example.test', password: 'synthetic-password' })
  for (const override of [{ host: 'evil.example' }, { 'x-forwarded-host': 'evil.example' }, { 'x-forwarded-proto': 'https,http' }]) {
    expectError(await send('/auth/login', 'POST', { ...headers, ...override }, login), 400, 'INVALID_ROUTE')
  }
  expectError(await send('/auth/login', 'POST', { ...headers, origin: 'https://evil.example', forwarded: 'host=cleanops.nuvurent.com;proto=https' }, login), 403, 'CSRF_ORIGIN')
  expectError(await send('/auth/login', 'POST', { ...headers, cookie: '' }, login), 403, 'CSRF_INVALID')
  assert.equal((await send('/auth/login', 'GET', headers)).status, 405)
  assert.equal((await send('/auth/not-a-route', 'POST', headers, '{}')).status, 404)
  console.log(JSON.stringify({ result: 'PASS', operations: operations.length, transports: ['proxy-https', 'internal-http'], closedBackend: true }))
} finally {
  if (server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit') }
}
