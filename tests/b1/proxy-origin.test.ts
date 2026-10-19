import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthHandler, closedBackend, names, cookie, type Backend } from '../../lib/b1/service.ts'
import { operations } from '../../lib/b1/contracts.ts'
import { sample } from './schema-fixture.ts'
import { handleAuth } from '../../lib/b1/runtime.ts'

const origin = 'https://cleanops.nuvurent.com'
const internal = ['http://0.0.0.0:3000', 'https://0.0.0.0:3000', 'http://127.0.0.1:3000']
const csrf = 'C'.repeat(43)
const handler = createAuthHandler(closedBackend, origin, undefined, internal)
function request(operationId = 'login', transport = internal[0], overrides: Record<string, string> = {}, payload?: unknown) {
  const operation = operations.find(item => item.operationId === operationId)!
  const query = operation.parameters.filter(p => p.in === 'query' && p.required).map(p => [p.name, String(sample(p.schema))])
  const path = operation.path.replace('{session_id}', '11111111-1111-4111-8111-111111111111')
  const headers = new Headers({ host: new URL(origin).host, origin, 'sec-fetch-site': 'same-origin',
    cookie: `${names.csrf}=${csrf}`, 'x-csrf-token': csrf, 'idempotency-key': 'proxy-test-key-000001', ...overrides })
  const schema = operation.requestBody?.content['application/json'].schema
  if (schema) headers.set('content-type', 'application/json')
  return new Request(transport + path + (query.length ? '?' + new URLSearchParams(query) : ''), {
    method: operation.method, headers, body: schema ? JSON.stringify(payload ?? sample(schema)) : undefined,
  })
}
async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status)
  assert.equal((await response.json()).error.code, code)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(response.headers.get('cache-control'), 'no-store')
}
test('every B1 operation reaches closedBackend through public HTTPS and exact internal transports', async () => {
  for (const operation of operations) for (const transport of [origin, ...internal]) {
    await expectError(await handler.handle(request(operation.operationId, transport), operation.operationId), 503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  }
})
test('HTTPS proxy metadata and direct internal HTTP preserve input validation order', async () => {
  for (const transport of internal) {
    const headers = { 'x-forwarded-host': new URL(origin).host, 'x-forwarded-proto': 'https' }
    await expectError(await handler.handle(request('login', transport, headers, {}), 'login'), 422, 'INVALID_INPUT')
    await expectError(await handler.handle(request('login', transport, headers), 'login'), 503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  }
  await expectError(await handler.handle(request('login', internal[0], { host: '127.0.0.1:3000', 'x-forwarded-host': '127.0.0.1:3000', 'x-forwarded-proto': 'http' }), 'login'), 503, 'AUTH_DEPENDENCY_UNAVAILABLE')
})
test('unlisted URLs and forged Host/forwarding authorities cannot replace deployment trust', async () => {
  for (const transport of ['https://evil.example', 'http://evil.example:3000', 'http://cleanops.nuvurent.com', 'http://0.0.0.0:3001']) {
    await expectError(await handler.handle(request('login', transport), 'login'), 400, 'INVALID_ROUTE')
  }
  for (const headers of [
    { host: 'evil.example' }, { host: 'cleanops.nuvurent.com.evil.example' },
    { 'x-forwarded-host': 'evil.example' }, { 'x-forwarded-host': 'cleanops.nuvurent.com, evil.example' },
    { 'x-forwarded-proto': 'https,http' }, { 'x-forwarded-proto': 'ftp' },
  ] as Record<string, string>[]) {
    await expectError(await handler.handle(request('login', internal[0], headers), 'login'), 400, 'INVALID_ROUTE')
  }
  const missingHost = request(); missingHost.headers.delete('host')
  await expectError(await handler.handle(missingHost, 'login'), 400, 'INVALID_ROUTE')
  // Even authoritative-looking forwarding headers cannot opt an unconfigured handler in.
  await expectError(await createAuthHandler(closedBackend, origin).handle(request('login', internal[0], { 'x-forwarded-host': new URL(origin).host, 'x-forwarded-proto': 'https' }), 'login'), 400, 'INVALID_ROUTE')
})
test('Forwarded is inert and cannot authorize a foreign browser Origin or Referer', async () => {
  const forwarded = 'host=evil.example;proto=https'
  await expectError(await handler.handle(request('login', internal[0], { forwarded }), 'login'), 503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  for (const headers of [
    { origin: 'https://evil.example' }, { origin: 'http://cleanops.nuvurent.com' }, { origin: 'null' },
    { referer: 'https://evil.example/login' }, { 'sec-fetch-site': 'cross-site' },
  ] as Record<string, string>[]) await expectError(await handler.handle(request('login', internal[0], { forwarded: 'host=cleanops.nuvurent.com;proto=https', ...headers }), 'login'), 403, 'CSRF_ORIGIN')
  const noOrigin = request(); noOrigin.headers.delete('origin')
  await expectError(await handler.handle(noOrigin, 'login'), 403, 'CSRF_ORIGIN')
  await expectError(await handler.handle(request('getCurrentIdentity', internal[0], { origin: 'https://evil.example' }), 'getCurrentIdentity'), 403, 'CSRF_ORIGIN')
})
test('method, static/dynamic path, query and selector contracts remain strict on HTTP', async () => {
  for (const operation of operations) {
    const valid = request(operation.operationId)
    await expectError(await handler.handle(new Request(valid.url, { method: operation.method === 'GET' ? 'POST' : 'GET', headers: valid.headers }), operation.operationId), 400, 'INVALID_ROUTE')
    await expectError(await handler.handle(new Request(internal[0] + '/wrong', valid), operation.operationId), 400, 'INVALID_ROUTE')
  }
  const duplicate = request('listSelfSessions')
  await expectError(await handler.handle(new Request(duplicate.url + '?limit=1&limit=2', duplicate), 'listSelfSessions'), 400, 'INVALID_QUERY')
  const unknown = request('getCurrentIdentity')
  await expectError(await handler.handle(new Request(unknown.url + '?tenant_id=foreign', unknown), 'getCurrentIdentity'), 400, 'INVALID_QUERY')
  const dynamic = request('revokeSelfSession')
  await expectError(await handler.handle(new Request(dynamic.url.replace(/[^/]+$/, 'invalid-uuid'), dynamic), 'revokeSelfSession'), 400, 'INVALID_PARAMETER')
  await expectError(await handler.handle(request('login', internal[0], {}, { email: 'synthetic@example.test', password: 'synthetic-password', tenant_id: 'foreign' }), 'login'), 422, 'INVALID_INPUT')
})
test('HTTP transport preserves cookie validation and never emits insecure cookies', async () => {
  await expectError(await handler.handle(request('login', internal[0], { cookie: '' }), 'login'), 403, 'CSRF_INVALID')
  await expectError(await handler.handle(request('login', internal[0], { cookie: `${names.csrf}=${csrf}; ${names.csrf}=${csrf}` }), 'login'), 400, 'INVALID_COOKIE')
  const backend: Backend = { async bootstrap() {}, async transaction() { throw new Error('unused') } }
  const bootstrap = await createAuthHandler(backend, origin, undefined, internal).bootstrap()
  assert.ok(!(bootstrap instanceof Response))
  assert.equal(bootstrap.headers.getSetCookie().length, 2)
  for (const value of bootstrap.headers.getSetCookie()) {
    assert.match(value, /; Path=\/; Secure; SameSite=Lax;/)
    assert.ok(!value.includes('Domain='))
  }
  assert.match(cookie(names.session, 'S'.repeat(43), 60), /Secure; SameSite=Lax; Max-Age=60; HttpOnly/)
})
test('malformed or absent internal configuration fails closed without enabling a backend', async () => {
  for (const values of [['http://evil.example/path'], ['https://user:pass@internal'], ['ftp://internal'], ['http://internal/'], Array(9).fill('http://internal')]) {
    assert.throws(() => createAuthHandler(closedBackend, origin, undefined, values), /AUTH_INTERNAL_ORIGINS_INVALID/)
  }
  const oldOrigin = process.env.CLEANOPS_AUTH_ORIGIN, oldInternal = process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS
  try {
    process.env.CLEANOPS_AUTH_ORIGIN = origin
    for (const value of ['not-json', '{}', '[1]', '["http://internal/path"]']) {
      process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS = value
      await expectError(await handleAuth(request(), 'login'), 503, 'AUTH_DEPENDENCY_UNAVAILABLE')
    }
    process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS = JSON.stringify(internal)
    await expectError(await handleAuth(request(), 'login'), 503, 'AUTH_DEPENDENCY_UNAVAILABLE')
    delete process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS
    await expectError(await handleAuth(request(), 'login'), 400, 'INVALID_ROUTE')
  } finally {
    if (oldOrigin === undefined) delete process.env.CLEANOPS_AUTH_ORIGIN; else process.env.CLEANOPS_AUTH_ORIGIN = oldOrigin
    if (oldInternal === undefined) delete process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS; else process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS = oldInternal
  }
})
