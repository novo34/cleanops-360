import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareB1IngressListenerPlan, type B1IngressListenerPlan } from '../../lib/b1/installation-config.ts'

function fixture(): B1IngressListenerPlan {
  const forbidden = async (): Promise<never> => { throw new Error('preparation must not perform IO') }
  return {
    binding: '127.0.0.1', port: 9443, allowedPaths: ['/forward-auth'],
    issuer: 'synthetic-test', audience: 'https://test.invalid', nextOrigin: 'https://test.invalid',
    topology: 'shared-atomic-all-consumers',
    trust: { transport: 'pinned-mutual-tls', forwardedHeaders: 'reconstructed-single-hop',
      assertion: 'ed25519-request-bound', proxyCertificateSha256: Array(32).fill('AB').join(':'),
      evidenceReference: 'synthetic-evidence', tlsAuthorizationReference: 'synthetic-authorization' },
    dependencies: { replay: { claim: forbidden }, credentials: {
      read: forbidden, enroll: forbidden, revoke: forbidden, recover: forbidden,
    } },
    lifecycle: { ready: forbidden, close: forbidden, drainTimeoutMs: 1000 },
  }
}

test('offline preparation performs no IO and remains blocked even with complete structural configuration', () => {
  const input = fixture(), result = prepareB1IngressListenerPlan(input)
  assert.equal(result.activation, 'blocked')
  assert.ok(result.pending.some(s => s.includes('AUTH-GATE-05')))
  assert.ok(result.pending.some(s => s.includes('Shared atomic')))
  assert.ok(result.pending.some(s => s.includes('Durable credential')))
  assert.ok(Object.isFrozen(result.configuration))
  assert.ok(Object.isFrozen(result.configuration.dependencies.replay))
  assert.ok(Object.isFrozen(result.configuration.lifecycle))
  ;(input.allowedPaths as string[]).push('/injected')
  assert.deepEqual(result.configuration.allowedPaths, ['/forward-auth'])
})

test('invalid bind, port, path, scope, topology, trust and missing dependencies fail closed', () => {
  const changes: Record<string, unknown>[] = [
    { binding: '0.0.0.0' }, { binding: '::' }, { binding: '0:0:0:0:0:0:0:0' },
    { binding: '::ffff:0.0.0.0' }, { binding: 'proxy.invalid' }, { binding: 123 },
    { port: 0 }, { port: 65536 }, { port: 1.5 },
    ...[[], ['/a', '/a'], ['//host'], ['/a/../b'], ['/a?x=1'], ['/a%2fb'], ['/a\\b']].map(allowedPaths => ({ allowedPaths })),
    { audience: 'http://test.invalid' }, { audience: 'https://test.invalid/' },
    { nextOrigin: 'https://other.invalid' }, { issuer: '' },
    { topology: 'single-process-single-consumer' },
    { trust: { ...fixture().trust, forwardedHeaders: 'browser-supplied' } },
    { trust: { ...fixture().trust, transport: 'http' } },
    { trust: { ...fixture().trust, assertion: 'static-header' } },
    { trust: { ...fixture().trust, proxyCertificateSha256: '' } },
    { trust: { ...fixture().trust, evidenceReference: '' } },
    { trust: { ...fixture().trust, tlsAuthorizationReference: '' } },
    { dependencies: { replay: { claim: () => true } } },
    { dependencies: { ...fixture().dependencies, replay: {} } },
    { dependencies: { ...fixture().dependencies, credentials: { read: async () => null } } },
    { lifecycle: { ...fixture().lifecycle, ready: true } },
    { lifecycle: { ...fixture().lifecycle, close: undefined } },
    { lifecycle: { ...fixture().lifecycle, drainTimeoutMs: 0 } },
    { lifecycle: { ...fixture().lifecycle, drainTimeoutMs: 30001 } },
    { enabled: true },
  ]
  for (const change of changes) assert.throws(() => prepareB1IngressListenerPlan({ ...fixture(), ...change } as B1IngressListenerPlan), /INSTALLATION_CONFIG_INVALID/)
  assert.throws(() => prepareB1IngressListenerPlan(null as unknown as B1IngressListenerPlan), /INSTALLATION_CONFIG_INVALID/)
})

test('preparation preserves existing lifecycle/repository ownership without invoking or replacing it', () => {
  const input = fixture(), { configuration } = prepareB1IngressListenerPlan(input)
  assert.equal(configuration.dependencies.replay.claim, input.dependencies.replay.claim)
  assert.equal(configuration.dependencies.credentials.recover, input.dependencies.credentials.recover)
  assert.equal(configuration.lifecycle.close, input.lifecycle.close)
})
