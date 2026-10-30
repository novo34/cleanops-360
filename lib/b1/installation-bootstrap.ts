/** Pure assembly of private installation inputs; never selects an HTTP backend. */
import type { PrivateRuntimeConfiguration } from './private-runtime.ts'
import type { InstallationKeyCatalog } from './installation-catalog.ts'
import { prepareStagingPrivateConfiguration } from './installation-config.ts'
import { createPrivatePgPassword, loadPrivateTls } from './private-material.ts'
import type { PrivateFileSource } from './private-file.ts'

type Pg = PrivateRuntimeConfiguration['postgres']
type Bao = PrivateRuntimeConfiguration['bao']
type Inputs = Omit<PrivateRuntimeConfiguration, 'postgres' | 'bao' | 'references' | 'totpKeys'>

export type InstallationPrivateSources = Readonly<{
  postgresPassword: PrivateFileSource
  postgresCa: PrivateFileSource
  baoCa: PrivateFileSource
  baoCert: PrivateFileSource
  baoKey: PrivateFileSource
}>
export type InstallationBootstrapInputs = Readonly<{
  inputs: Inputs
  postgres: Omit<Pg, 'ca' | 'password'>
  bao: Omit<Bao, 'ca' | 'cert' | 'key'>
  catalog: InstallationKeyCatalog
  sources: InstallationPrivateSources
}>

/** Loads approved private sources. Caller closes resources and zeroes buffers. */
export async function assembleInstallationPrivateInputs(spec: InstallationBootstrapInputs) {
  if (!spec || !spec.inputs || !spec.postgres || !spec.bao || !spec.catalog || !spec.sources ||
      spec.postgres.environment !== 'staging' || spec.bao.environment !== 'staging' ||
      spec.bao.mount !== 'b1-keys') {
    throw new Error('INSTALLATION_CONFIG_INVALID')
  }
  const tls = await loadPrivateTls(spec.sources)
  const buffers = [tls.postgresCa, tls.bao.ca, tls.bao.cert, tls.bao.key]
  try {
    const configuration = prepareStagingPrivateConfiguration({
      ...spec.inputs,
      postgres: { ...spec.postgres, ca: tls.postgresCa, password: createPrivatePgPassword(spec.sources.postgresPassword) },
      bao: { ...spec.bao, ...tls.bao },
    }, spec.catalog)
    return Object.freeze({
      configuration,
      dispose() { for (const buffer of buffers) buffer.fill(0) },
    })
  } catch (error) {
    for (const buffer of buffers) buffer.fill(0)
    throw error
  }
}
