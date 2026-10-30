/** Pure, offline preparation of the staging B1 configuration.
 * No process flags, IO, credentials, startup selection or HTTP activation.
 * The complete object is validated again by selectAuthBackend on approved composition.
 */
import type { PrivateRuntimeConfiguration } from './private-runtime.ts'
import { validateInstallationKeys, type InstallationKeyCatalog } from './installation-catalog.ts'

type Inputs = Omit<PrivateRuntimeConfiguration, 'references' | 'totpKeys'>
const inputKeys = 'bao,corpus,dummyPasswordHash,internalOrigins,lifetimeMs,maxEligibleTotpMethods,normalizeEmail,origin,passwordPolicy,postgres,sessionLabels,sink,transport'
const postgresKeys = 'ca,connectionTimeoutMs,contractualRole,database,environment,host,loginRole,maxConnections,password,port'
const baoKeys = 'ca,cert,environment,key,mount,origin,timeoutMs'
const exact = (value: unknown, keys: string): boolean => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys
const httpsOrigin = (value: unknown): boolean => {
  if (typeof value !== 'string') return false
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && url.origin + '/' === value } catch { return false }
}
const invalid = () => new Error('INSTALLATION_CONFIG_INVALID')

/** Binds an explicit catalogue to trusted input; never enables a runtime. */
export function prepareStagingPrivateConfiguration(
  input: Inputs,
  catalog: InstallationKeyCatalog,
): PrivateRuntimeConfiguration {
  if (!exact(input, inputKeys) || !exact(input.postgres, postgresKeys) || !exact(input.bao, baoKeys) || !catalog ||
      input.postgres?.environment !== 'staging' ||
      input.bao?.environment !== 'staging' ||
      input.bao?.mount !== 'b1-keys' ||
      input.postgres?.contractualRole !== 'cleanops_identity_service' ||
      !httpsOrigin(input.origin) || !httpsOrigin(input.bao.origin) ||
      !Array.isArray(input.internalOrigins) ||
      !input.internalOrigins.every(origin => typeof origin === 'string')) throw invalid()
  const references = validateInstallationKeys(catalog)
  // No default tenant, key version, secret, TLS file or activation flag.
  // selectAuthBackend performs full runtime validation at the authorized call site.
  return Object.freeze({ ...input, ...references })
}
