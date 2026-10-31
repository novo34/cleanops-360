import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startTrustedB1Server, stopTrustedB1Server } from '../../lib/b1/server-startup.ts'
import type { InstallationBootstrapInputs } from '../../lib/b1/installation-bootstrap.ts'

test('B1 trusted server startup rejects absent installation custody without activating HTTP', async () => {
  await assert.rejects(startTrustedB1Server({ bindIngress() {} } as unknown as InstallationBootstrapInputs), /INSTALLATION_CONFIG_INVALID/)
  await assert.rejects(stopTrustedB1Server(), /B1_SERVER_NOT_STARTED/)
})

test('B1 invalid trusted startup never becomes a runtime selector', async () => {
  const malformed = { inputs: {}, postgres: { environment: 'production' }, bao: { environment: 'staging', mount: 'b1-keys' }, catalog: {}, sources: {}, bindIngress() {} }
  await assert.rejects(startTrustedB1Server(malformed as unknown as InstallationBootstrapInputs), /INSTALLATION_CONFIG_INVALID/)
})


test('B1 private startup without durable ingress binding rejects before custody access', async () => {
  const withoutBinding = { inputs: {}, postgres: { environment: 'staging' }, bao: { environment: 'staging', mount: 'b1-keys' }, catalog: {}, sources: {} }
  await assert.rejects(startTrustedB1Server(withoutBinding as unknown as InstallationBootstrapInputs), /B1_INGRESS_BINDING_REQUIRED/)
  await assert.rejects(stopTrustedB1Server(), /B1_SERVER_NOT_STARTED/)
})
