/** Ingress repositories borrow the canonical identity pool; never own its lifecycle.
 * The proposed SQL functions/ACL must be independently approved before runtime wiring.
 */
import { createPgIdentityUnitOfWork, type IdentityPool } from './pg-identity-driver.ts'
import { AuthError } from './service.ts'
import type { DurableIngressCredentials, IngressCredentialRecord, IngressCredentialScope, SharedIngressReplayRepository } from './installation-config.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && !/[\p{Cc}\p{Cf}]/u.test(v)
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) && Buffer.from(v, 'base64url').toString('base64url') === v
function scope(s: IngressCredentialScope) {
  if (!s || !text(s.issuer) || !id(s.id) || !text(s.audience)) throw unavailable()
  try { const u = new URL(s.audience); if (u.protocol !== 'https:' || u.origin !== s.audience) throw unavailable() } catch { throw unavailable() }
}
function result(raw: unknown): unknown {
  const r = raw as { rows?: { value?: unknown }[]; rowCount?: number }
  if (!r || r.rowCount !== 1 || !Array.isArray(r.rows) || r.rows.length !== 1 || !Object.hasOwn(r.rows[0], 'value')) throw unavailable()
  return r.rows[0].value
}

export function createPgIngressRepositories(pool: IdentityPool): Readonly<{
  replay: SharedIngressReplayRepository; credentials: DurableIngressCredentials
}> {
  const { run } = createPgIdentityUnitOfWork(pool)
  const replay: SharedIngressReplayRepository = Object.freeze({
    async claim(input) {
      if (!input || !id(input.nonce) || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) throw unavailable()
      scope({ ...input, id: input.nonce })
      // No retry after unknown COMMIT, no upsert extending live claims, no Map.
      return run(async connection => {
        const value = result(await connection.query('SELECT auth_api.ingress_claim($1,$2,$3,$4) AS value',
          [input.issuer, input.audience, input.nonce, input.expiresAt]))
        if (value !== 'claimed' && value !== 'duplicate') throw unavailable()
        return value
      })
    },
  })
  const blocked = async (): Promise<never> => { throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED') }
  const credentials: DurableIngressCredentials = Object.freeze({
    async read(input) {
      scope(input)
      return run(async connection => {
        const value = result(await connection.query('SELECT auth_api.ingress_credential_read($1,$2,$3) AS value',
          [input.issuer, input.audience, input.id]))
        if (value === null) return null
        const r = value as IngressCredentialRecord
        if (!r || Object.keys(r).sort().join(',') !== 'audience,enrollmentReference,expiresAt,id,issuedAt,issuer,revision,state' ||
            r.issuer !== input.issuer || r.audience !== input.audience || r.id !== input.id ||
            !Number.isSafeInteger(r.issuedAt) || !Number.isSafeInteger(r.expiresAt) || r.issuedAt <= 0 || r.expiresAt <= r.issuedAt ||
            !text(r.revision) || !/^[1-9][0-9]*$/.test(r.revision) || !text(r.enrollmentReference) ||
            !['active', 'revoked'].includes(r.state)) throw unavailable()
        return Object.freeze({ ...r })
      })
    },
    // A reference string is NOT operator authorization. No invented callback,
    // pool, public endpoint or runtime identity grant substitutes the missing channel.
    enroll: blocked, revoke: blocked, recover: blocked,
  })
  return Object.freeze({ replay, credentials })
}
