import { createHmac } from 'node:crypto'
import { Secret } from 'otpauth'
import { canonical, valid } from './contracts.ts'
import { numeric } from './config.ts'
import { AuthError } from './service.ts'
import { privateArtifact } from './ceremony-preparation.ts'

/** One canonical generation/digest domain for ordinary enrollment and initialization. */
export function prepareRecoveryCodes(tenantId: string, userId: string, key: Buffer) {
  if (![tenantId, userId].every(id => valid({ type: 'string', format: 'uuid' }, id)) ||
      !Buffer.isBuffer(key) || key.length < 32) throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  const codes: string[] = [], digests: Buffer[] = []
  try {
    for (let attempt = 0; attempt < numeric('recovery_count') * 2 && codes.length < numeric('recovery_count'); attempt++) {
      const secret = new Secret({ size: numeric('recovery_entropy') })
      let code: string
      try { code = secret.base32 } finally { secret.bytes.fill(0) }
      if (!/^[A-Z2-7]{26}$/.test(code)) throw new Error('INVALID_RECOVERY')
      if (codes.includes(code)) continue
      codes.push(code)
      digests.push(createHmac('sha256', key).update(canonical(['RECOVERY', tenantId, userId, code])).digest())
    }
    if (codes.length !== numeric('recovery_count')) throw new Error('INVALID_RECOVERY')
    return privateArtifact({}, { codes, digests })
  } catch {
    digests.forEach(d => d.fill(0))
    throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  }
}
