import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveIngressBinding, startB1IngressListener, type B1IngressListenerInputs } from '../../lib/b1/ingress-listener.ts'

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

const iface = (address: string, internal = false, family = 'IPv4') => ({ address, netmask: '255.255.255.0', family, mac: '00:00:00:00:00:00', internal, cidr: address + '/24' }) as never

test('D3: dynamic overlay address is resolved fail-closed from a reviewed private CIDR', () => {
  // Literal IPs keep their existing meaning; the listener plan still validates them.
  assert.equal(resolveIngressBinding('10.0.1.7'), '10.0.1.7')
  const overlay = { lo: [iface('127.0.0.1', true)], eth0: [iface('172.18.0.5')], eth1: [iface('10.0.4.23')], eth2: [iface('10.0.9.2')] }
  // Re-created container with a different overlay address: same reviewed manifest, new address.
  assert.equal(resolveIngressBinding('10.0.4.0/24', overlay), '10.0.4.23')
  assert.equal(resolveIngressBinding('10.0.4.0/24', { ...overlay, eth1: [iface('10.0.4.99')] }), '10.0.4.99')
  assert.equal(resolveIngressBinding('172.18.0.0/16', overlay), '172.18.0.5')
  const refused = (value: unknown, interfaces: Parameters<typeof resolveIngressBinding>[1] = overlay) => assert.throws(() => resolveIngressBinding(value, interfaces), /B1_INGRESS_BINDING_UNRESOLVED/)
  refused('10.0.7.0/24')                                        // no interface in the network
  refused('10.0.0.0/16', { ...overlay, eth3: [iface('10.0.200.1')] }) // two candidates are ambiguous
  refused('10.0.4.0/8')                                         // non-canonical network address
  for (const wide of ['0.0.0.0/0', '10.0.0.0/8', '10.0.0.0/15', '172.16.0.0/12']) refused(wide)
  for (const open of ['8.8.8.0/24', '100.64.0.0/16', '169.254.0.0/16', '127.0.0.0/16']) refused(open, { eth0: [iface(open.split('/')[0].replace(/0$/, '5'))] })
  for (const bad of ['10.0.4.0/24/1', '10.0.4/24', '010.0.4.0/24', '10.0.4.0/ab', '::/0', 'fd00::/16', null, undefined, 7]) refused(bad)
  refused('10.0.4.0/24', { lo: [iface('10.0.4.23', true)] })    // loopback/internal never counts
  refused('10.0.4.0/24', { eth1: [iface('10.0.4.23', false, 'IPv6')] })
})
