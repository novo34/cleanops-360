/** Offline-only construction of the exact installation key catalogue.
 * No environment activation, file reads, database calls or secret acquisition.
 */
import type { PrivateRuntimeConfiguration } from './private-runtime.ts'
import type { PrivateKeyReference } from './openbao-keys.ts'

type Purpose = 'audit-hmac' | 'cursor-hmac' | 'otp-hmac' | 'recovery-hmac' | 'totp-aead'
export type InstallationKeyEntry = Readonly<{
  purpose: Purpose
  keyId: string
  version: number
  keyVersion?: string
}>
export type InstallationKeyCatalog = Readonly<{
  tenantId: string
  keys: readonly InstallationKeyEntry[]
}>
type Fixed = Pick<PrivateRuntimeConfiguration, 'references' | 'totpKeys'>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const id = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const required: readonly Purpose[] = ['audit-hmac','cursor-hmac','otp-hmac','recovery-hmac','totp-aead']

/** Fail closed on a mismatched or incomplete installation catalogue.
 * This does not authorize selecting the private backend.
 */
export function validateInstallationKeys(catalog: InstallationKeyCatalog): Fixed {
  if (!catalog || !uuid.test(catalog.tenantId) ||
      !Array.isArray(catalog.keys) || catalog.keys.length !== required.length) {
    throw new Error('INSTALLATION_CATALOG_INVALID')
  }
  const keys = new Map<Purpose, PrivateKeyReference>()
  let totpVersion: string | undefined
  for (const entry of catalog.keys) {
    if (!entry || !required.includes(entry.purpose) || keys.has(entry.purpose) ||
        !id.test(entry.keyId) || !Number.isSafeInteger(entry.version) || entry.version < 1 ||
        (entry.purpose === 'totp-aead'
          ? typeof entry.keyVersion !== 'string' || !id.test(entry.keyVersion)
          : entry.keyVersion !== undefined)) {
      throw new Error('INSTALLATION_CATALOG_INVALID')
    }
    keys.set(entry.purpose, Object.freeze({
      tenantId: catalog.tenantId, purpose: entry.purpose,
      keyId: entry.keyId, version: entry.version,
    }))
    if (entry.purpose === 'totp-aead') totpVersion = entry.keyVersion
  }
  if (keys.size !== required.length || !totpVersion) throw new Error('INSTALLATION_CATALOG_INVALID')
  const get = (purpose: Purpose): PrivateKeyReference => {
    const value = keys.get(purpose)
    if (!value) throw new Error('INSTALLATION_CATALOG_INVALID')
    return value
  }
  return Object.freeze({
    references: Object.freeze({
      audit: get('audit-hmac'),
      cursor: get('cursor-hmac'),
      otp: get('otp-hmac'),
      recovery: get('recovery-hmac'),
    }),
    totpKeys: Object.freeze([Object.freeze({ keyVersion: totpVersion, reference: get('totp-aead') })]),
  })
}
