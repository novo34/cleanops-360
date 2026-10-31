import test from 'node:test'
import assert from 'node:assert/strict'
import { startB1IngressListener, type B1IngressListenerInputs } from '../../lib/b1/ingress-listener.ts'

/** No key material or socket is opened: reject unsafe configuration before binding. */
const candidate = (): B1IngressListenerInputs => ({
  binding: '127.0.0.1',
  port: 9443,
  tls: { key: Buffer.from('fixture-only'), cert: Buffer.from('fixture-only'), ca: Buffer.from('fixture-only') },
  allowedPaths: ['/auth/login', '/auth/me'],
  ready: async () => false,
  handle: async () => { throw new Error('handler must not be called') },
  drainTimeoutMs: 1000,
})

test('B1 listener rejects wildcard bind and invalid ports before opening socket', async () => {
  for (const binding of ['0.0.0.0', '::', 'not-an-ip']) {
    await assert.rejects(startB1IngressListener({ ...candidate(), binding }), /B1_INGRESS_LISTENER_CONFIG_INVALID/)
  }
  for (const port of [0, -1, 65536, 9443.5]) {
    await assert.rejects(startB1IngressListener({ ...candidate(), port }), /B1_INGRESS_LISTENER_CONFIG_INVALID/)
  }
})

test('B1 listener denies ambiguous paths and duplicate path scopes', async () => {
  for (const allowedPaths of [['/auth/login', '/auth/login'], ['/auth/%2e%2e'], ['//auth/login'],
    ['/auth/login?mode=1'], ['/auth/login#fragment'], ['/auth/login\\evil']]) {
    await assert.rejects(startB1IngressListener({ ...candidate(), allowedPaths }), /B1_INGRESS_LISTENER_CONFIG_INVALID/)
  }
})

test('B1 listener rejects missing trust sources and invalid readiness or handler', async () => {
  const invalid = [
    { ...candidate(), tls: { ...candidate().tls, ca: undefined } },
    { ...candidate(), ready: undefined },
    { ...candidate(), handle: undefined },
    { ...candidate(), drainTimeoutMs: 0 },
    { ...candidate(), drainTimeoutMs: 30001 },
  ]
  for (const input of invalid) {
    await assert.rejects(startB1IngressListener(input as B1IngressListenerInputs), /B1_INGRESS_LISTENER_CONFIG_INVALID/)
  }
})
