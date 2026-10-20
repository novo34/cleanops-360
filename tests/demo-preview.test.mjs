import { Buffer } from 'node:buffer'
const { fetch } = globalThis
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { createPreviewGateway } from '../deploy/demo-preview/gateway.mjs'

test('private preview denies unauthenticated/private/write requests and strips session headers', async t => {
  const seen = []
  const upstream = http.createServer((req, res) => {
    seen.push(req.headers)
    res.setHeader('Set-Cookie', 'must-not-escape=synthetic')
    res.end('synthetic demo')
  }).listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const password = 'synthetic-unit-test-password-only'
  const gateway = createPreviewGateway({ password, upstream: `http://127.0.0.1:${upstream.address().port}` }).listen(0, '127.0.0.1')
  await once(gateway, 'listening')
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close() })
  const url = `http://127.0.0.1:${gateway.address().port}`
  const headers = { Authorization: 'Basic ' + Buffer.from('owner:' + password).toString('base64'), Cookie: 'synthetic=not-forwarded' }
  assert.equal((await fetch(url + '/demo')).status, 401)
  for (const path of ['/login', '/api/test', '/auth/login', '/me', '/mfa', '/demo/not-implemented', '/demo-map/../login']) {
    assert.equal((await fetch(url + path, { headers })).status, 404, path)
  }
  assert.equal((await fetch(url + '/demo', { headers, method: 'POST' })).status, 405)
  for (const path of ['http://example.invalid/demo', '//example.invalid/demo', '/demo-map/%252e%252e/login', '/demo-map/%5c..%5clogin']) {
    const status = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: gateway.address().port, path, headers }, response => { response.resume(); resolve(response.statusCode) }).on('error', reject)
    })
    assert.equal(status, 400, path)
  }
  const response = await fetch(url + '/demo', { headers })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'synthetic demo')
  assert.equal(response.headers.get('set-cookie'), null)
  assert.match(response.headers.get('x-robots-tag'), /noindex/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].authorization, undefined)
  assert.equal(seen[0].cookie, undefined)
})

test('preview refuses missing strength and returns unavailable rather than leaking upstream failures', async t => {
  assert.throws(() => createPreviewGateway({ password: 'weak' }))
  const gateway = createPreviewGateway({ password: 'synthetic-unit-test-password-only', upstream: 'http://127.0.0.1:1' }).listen(0, '127.0.0.1')
  await once(gateway, 'listening')
  t.after(() => { gateway.closeAllConnections(); gateway.close() })
  const headers = { Authorization: 'Basic ' + Buffer.from('owner:synthetic-unit-test-password-only').toString('base64') }
  assert.equal((await fetch(`http://127.0.0.1:${gateway.address().port}/demo`, { headers })).status, 502)
})
