import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleInstallationPrivateInputs } from '../../lib/b1/installation-bootstrap.ts'

test('installation bootstrap rejects missing input before any file access', async () => {
  await assert.rejects(assembleInstallationPrivateInputs(null as never), /INSTALLATION_CONFIG_INVALID/)
  await assert.rejects(assembleInstallationPrivateInputs({ inputs: {} } as never), /INSTALLATION_CONFIG_INVALID/)
})

test('installation bootstrap fails closed when private files are unavailable', async () => {
  const file = { path: '/no-such-cleanops-private-file', uid: 999, gid: 999, mode: 0o400 as const, maxBytes: 4096 }
  const sources = { postgresPassword: file, postgresCa: file, baoCa: file, baoCert: file, baoKey: file }
  await assert.rejects(assembleInstallationPrivateInputs({
    inputs: {} as never, postgres: { environment: 'staging' } as never,
    bao: { environment: 'staging', mount: 'b1-keys' } as never,
    catalog: {} as never, sources,
  }), /PRIVATE_MATERIAL_UNAVAILABLE/)
})

test('bootstrap rejects wrong environment before accessing private sources', async () => {
  await assert.rejects(assembleInstallationPrivateInputs({
    inputs: {} as never,
    postgres: { environment: 'production' } as never,
    bao: { environment: 'staging', mount: 'b1-keys' } as never,
    catalog: {} as never, sources: {} as never,
  }), /INSTALLATION_CONFIG_INVALID/)
})
