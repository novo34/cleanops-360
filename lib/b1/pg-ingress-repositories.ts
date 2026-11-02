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

const reference = (v: unknown): v is string => text(v)
const revision = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,15}$/.test(v)
const time = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0

/**
 * Operator channel (D1). Same separation as `firstActor(manifest, operatorPool, keyVersion)`:
 * a pool that is NOT the runtime pool, whose login is a member of the NOLOGIN role
 * `cleanops_ingress_operator` (0003) and of no runtime/maintenance role. The runtime
 * never receives this factory; `createPgIngressRepositories` keeps enroll/revoke/recover blocked.
 * The authorization reference is audited metadata (with session_user), never authority.
 */
export function createPgIngressOperator(operatorPool: IdentityPool, runtimePool: IdentityPool): Pick<DurableIngressCredentials, 'enroll' | 'revoke' | 'recover'> {
  if (!operatorPool || typeof operatorPool.connect !== 'function' || !runtimePool || operatorPool === runtimePool) throw unavailable()
  const { run } = createPgIdentityUnitOfWork(operatorPool)
  // Verified inside the same transaction as the write: a login that also holds a runtime or
  // maintenance role can never use this channel, whatever the pool wiring is.
  const separated = async (connection: Parameters<Parameters<typeof run>[0]>[0]) => {
    const r = (await connection.query(
      `SELECT pg_has_role(session_user,'cleanops_ingress_operator','USAGE') AS operator,
              pg_has_role(session_user,'cleanops_identity_service','USAGE') OR pg_has_role(session_user,'cleanops_auth_maintenance','USAGE')
              OR pg_has_role(session_user,'cleanops_runtime','USAGE') AS shared`)) as { rows: { operator: boolean; shared: boolean }[] }
    if (r?.rows?.length !== 1 || r.rows[0].operator !== true || r.rows[0].shared !== false) throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')
  }
  const record = (r: IngressCredentialRecord) => {
    if (!r || !text(r.issuer) || !id(r.id) || !text(r.audience) || !time(r.issuedAt) || !time(r.expiresAt) ||
        r.expiresAt <= r.issuedAt || !reference(r.enrollmentReference) || r.state !== 'active') throw unavailable()
    scope(r)
  }
  return Object.freeze({
    async enroll({ record: r, authorizationReference }) {
      record(r)
      if (!reference(authorizationReference)) throw unavailable()
      // No retry after an unknown COMMIT: the caller re-reads authoritative state.
      await run(async connection => {
        await separated(connection)
        result(await connection.query('SELECT auth_api.ingress_enroll($1,$2,$3,$4,$5,$6,$7)::text AS value',
          [r.issuer, r.audience, r.id, r.issuedAt, r.expiresAt, r.enrollmentReference, authorizationReference]))
      })
    },
    async revoke({ scope: s, expectedRevision, authorizationReference }) {
      scope(s)
      if (!revision(expectedRevision) || !reference(authorizationReference)) throw unavailable()
      await run(async connection => {
        await separated(connection)
        result(await connection.query('SELECT auth_api.ingress_revoke($1,$2,$3,$4,$5)::text AS value',
          [s.issuer, s.audience, s.id, expectedRevision, authorizationReference]))
      })
    },
    async recover({ previous, expectedRevision, replacement, authorizationReference }) {
      scope(previous); record(replacement)
      if (!revision(expectedRevision) || !reference(authorizationReference) || replacement.issuer !== previous.issuer ||
          replacement.audience !== previous.audience || replacement.id === previous.id) throw unavailable()
      await run(async connection => {
        await separated(connection)
        result(await connection.query('SELECT auth_api.ingress_recover($1,$2,$3,$4,$5,$6,$7,$8,$9)::text AS value',
          [previous.issuer, previous.audience, previous.id, expectedRevision, replacement.id,
            replacement.issuedAt, replacement.expiresAt, replacement.enrollmentReference, authorizationReference]))
      })
    },
  })
}

export type IngressGcLimits = Readonly<{ batchSize: number; maxBatches: number; maxDurationMs: number; statementTimeoutMs: number; lockTimeoutMs: number }>
export type IngressGcReport = Readonly<{ purged: number; batches: number; complete: boolean; reason: 'drained' | 'max-batches' | 'deadline' | 'busy' }>

/**
 * Retention (D2). Runs ONLY with a `cleanops_auth_maintenance` login pool (never the runtime pool).
 * Bounded: each batch is its own short transaction (SET LOCAL timeouts, `ingress_gc` limit),
 * total batches and wall-clock are capped, and a session advisory lock makes overlapping
 * invocations skip instead of queue. Failure leaves earlier batches committed; gc is idempotent
 * and only removes claims expired > 60 s, so simply running it again is the recovery.
 * The scheduler/cadence is an owner decision and is not created here.
 */
export function createPgIngressMaintenance(maintenancePool: IdentityPool, runtimePool: IdentityPool) {
  if (!maintenancePool || typeof maintenancePool.connect !== 'function' || !runtimePool || maintenancePool === runtimePool) throw unavailable()
  const within = (v: unknown, lo: number, hi: number) => Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi
  return Object.freeze({
    async gc(limits: IngressGcLimits, now: () => number = Date.now): Promise<IngressGcReport> {
      if (!limits || !within(limits.batchSize, 1, 10000) || !within(limits.maxBatches, 1, 1000) ||
          !within(limits.maxDurationMs, 1, 600000) || !within(limits.statementTimeoutMs, 1, 60000) ||
          !within(limits.lockTimeoutMs, 1, 10000)) throw unavailable()
      const deadline = now() + limits.maxDurationMs
      const connection = await maintenancePool.connect()
      let discard = true
      try {
        const lock = (await connection.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS got', ['cleanops.ingress_gc'])) as { rows: { got: boolean }[] }
        if (lock?.rows?.[0]?.got !== true) { discard = false; return { purged: 0, batches: 0, complete: false, reason: 'busy' } }
        let purged = 0, batches = 0
        try {
          for (;;) {
            if (batches >= limits.maxBatches) return { purged, batches, complete: false, reason: 'max-batches' }
            if (now() >= deadline) return { purged, batches, complete: false, reason: 'deadline' }
            await connection.query('BEGIN')
            let n: number
            try {
              // set_config(..., true) is transaction-local (SET LOCAL semantics).
              // Both numeric limits were range-checked above; never interpolate SQL text.
              await connection.query(
                "SELECT set_config('statement_timeout',$1,true), set_config('lock_timeout',$2,true)",
                [String(limits.statementTimeoutMs) + 'ms', String(limits.lockTimeoutMs) + 'ms'])
              n = Number(result(await connection.query('SELECT auth_api.ingress_gc($1) AS value', [limits.batchSize])))
              await connection.query('COMMIT')
            } catch (error) { await connection.query('ROLLBACK').catch(() => {}); throw error }
            batches++; purged += n
            if (n < limits.batchSize) return { purged, batches, complete: true, reason: 'drained' }
          }
        } finally {
          // A connection whose lock state is unknown is destroyed, never returned to the pool.
          await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', ['cleanops.ingress_gc'])
            .then(() => { discard = false }, () => { discard = true })
        }
      } catch (error) {
        if (error instanceof AuthError) throw error
        throw unavailable()
      } finally { connection.release(discard) }
    },
  })
}
