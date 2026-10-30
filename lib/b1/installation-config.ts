/** Pure, offline preparation of the staging B1 configuration.
 * No process flags, IO, credentials, startup selection or HTTP activation.
 * The complete object is validated again by selectAuthBackend on approved composition.
 */
import type { PrivateRuntimeConfiguration } from './private-runtime.ts'
import { validateInstallationKeys, type InstallationKeyCatalog } from './installation-catalog.ts'

type Inputs = Omit<PrivateRuntimeConfiguration, 'references' | 'totpKeys'>
const invalid = () => new Error('INSTALLATION_CONFIG_INVALID')

/** Binds an explicit catalogue to trusted input; never enables a runtime. */
export function prepareStagingPrivateConfiguration(
  input: Inputs,
  catalog: InstallationKeyCatalog,
): PrivateRuntimeConfiguration {
  if (!input || !catalog ||
      input.postgres?.environment !== 'staging' ||
      input.bao?.environment !== 'staging' ||
      input.bao?.mount !== 'b1-keys' ||
      input.postgres?.contractualRole !== 'cleanops_identity_service' ||
      typeof input.origin !== 'string' || !input.origin.startsWith('https://') ||
      !Array.isArray(input.internalOrigins) ||
      !input.internalOrigins.every(origin => typeof origin === 'string')) throw invalid()
  const references = validateInstallationKeys(catalog)
  // No default tenant, key version, secret, TLS file or activation flag.
  // selectAuthBackend performs full runtime validation at the authorized call site.
  return Object.freeze({ ...input, ...references })
}
