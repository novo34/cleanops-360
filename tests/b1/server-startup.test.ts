import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startTrustedB1Server, stopTrustedB1Server } from '../../lib/b1/server-startup.ts'
import type { InstallationBootstrapInputs } from '../../lib/b1/installation-bootstrap.ts'
import type { B1IngressListenerInputs } from '../../lib/b1/ingress-listener.ts'

const inactiveIngress = (): B1IngressListenerInputs => ({
  binding: '127.0.0.1', port: 9443,
  tls: { key: Buffer.from('never-used'), cert: Buffer.from('never-used'), ca: Buffer.from('never-used') },
  allowedPaths: ['/private-forward-auth'], ready: async () => false,
  handle: async () => { throw new Error('must remain closed') }, drainTimeoutMs: 1000,
})

test('B1 trusted server startup rejects absent installation custody without activating HTTP', async () => {
  await assert.rejects(startTrustedB1Server({ bindIngress() {} } as unknown as InstallationBootstrapInputs, inactiveIngress()), /INSTALLATION_CONFIG_INVALID/)
  await assert.rejects(stopTrustedB1Server(), /B1_SERVER_NOT_STARTED/)
})

test('B1 invalid trusted startup never becomes a runtime selector', async () => {
  const malformed = { inputs: {}, postgres: { environment: 'production' }, bao: { environment: 'staging', mount: 'b1-keys' }, catalog: {}, sources: {}, bindIngress() {} }
  await assert.rejects(startTrustedB1Server(malformed as unknown as InstallationBootstrapInputs, inactiveIngress()), /INSTALLATION_CONFIG_INVALID/)
})


test('B1 private startup without durable ingress binding rejects before custody access', async () => {
  const withoutBinding = { inputs: {}, postgres: { environment: 'staging' }, bao: { environment: 'staging', mount: 'b1-keys' }, catalog: {}, sources: {} }
  await assert.rejects(startTrustedB1Server(withoutBinding as unknown as InstallationBootstrapInputs), /B1_INGRESS_BINDING_REQUIRED/)
  await assert.rejects(stopTrustedB1Server(), /B1_SERVER_NOT_STARTED/)
})


test('B1 refuses private runtime activation when mTLS ingress was not provided', async () => {
  const spec = { bindIngress() {}, inputs: {}, postgres: { environment: 'staging' }, bao: { environment: 'staging', mount: 'b1-keys' }, catalog: {}, sources: {} }
  await assert.rejects(startTrustedB1Server(spec as unknown as InstallationBootstrapInputs), /B1_INGRESS_LISTENER_REQUIRED/)
  await assert.rejects(stopTrustedB1Server(), /B1_SERVER_NOT_STARTED/)
})
