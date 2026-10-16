import { randomUUID } from 'node:crypto'
import { numeric } from './config.ts'
import { AuthError, digest } from './service.ts'
import { createV4IdentityRepository, type V4Broker } from './v4-broker.ts'
import type { IdentityPool } from './pg-identity-driver.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function iso(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  if (!date || !Number.isFinite(date.getTime())) throw unavailable()
  return date.toISOString()
}
type Context = Readonly<{ tenantId: string }>
export type SessionPage = Readonly<{ limit: number; beforeTime: string | null; beforeId: string | null }>
export type MutationKey = Readonly<{ key: string; requestHash: string }>
/** Real composition of existing V4 broker primitives, not a replacement HTTP Backend.
 * Uses the reviewed cleanops_runtime pool, never the identity-service credentials.
 * Database context/guards own subject, membership, credential and step-up revalidation.
 * The runtime stays closed. SQL/RLS/lock behavior still requires authorized PostgreSQL tests. */
export function createPrivateSessionOperations(pool: IdentityPool) {
  const repository = createV4IdentityRepository(pool)
  async function active<T>(rawToken: string, work: (broker: V4Broker, actor: Context) => Promise<T>) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) throw new AuthError(401, 'AUTH_INVALID')
    return repository.transaction(async broker => {
      await broker.call('beginContext', [rawToken])
      const tenantId = await broker.call('verifiedTenant', [])
      if (!uuid(tenantId)) throw unavailable()
      const actor = Object.freeze({ tenantId })
      return work(broker, actor)
    })
  }
  async function revoke(rawToken: string, target: string | null, key: MutationKey, correlation: string) {
    if (!uuid(correlation) || (target !== null && !uuid(target)) || !/^[A-Za-z0-9_-]{16,128}$/.test(key.key) ||
        !/^[0-9a-f]{64}$/.test(key.requestHash)) throw new AuthError(400, 'INVALID_INPUT')
    const operation = target === null ? 'revokeOtherOwnSessions' : 'revokeSelfSession'
    return active(rawToken, async (broker, actor) => {
      const keyHash = Buffer.from(digest(key.key), 'hex')
      const replay = await broker.call('reserveActive', [operation, keyHash, Buffer.from(key.requestHash, 'hex'), false])
      const decode = (value: unknown) => {
        if (!object(value) || value.tenant_id !== actor.tenantId || value.operation !== operation ||
            value.target !== target || typeof value.revoked_count !== 'number' ||
            !Number.isSafeInteger(value.revoked_count) || value.revoked_count < 0 ||
            (target !== null && value.revoked_count > 1)) throw unavailable()
        // Do not return stored context markers through an eventual HTTP response.
        return { revoked_count: value.revoked_count }
      }
      if (replay !== null) return decode(replay)
      const count = target === null ? await broker.call('revokeOtherSessions', [correlation]) :
        await broker.call('revokeSession', [target, correlation])
      const safe = { tenant_id: actor.tenantId, operation, target, revoked_count: count }
      const result = decode(safe)
      // V4 completion uses tx_context even when the current session has just been revoked.
      await broker.call('completeActive', [operation, keyHash, JSON.stringify(safe)])
      return result
    })
  }
  return Object.freeze({
    currentIdentity(rawToken: string) {
      return active(rawToken, async (broker, actor) => {
        const rows = await broker.call('identity', [])
        if (rows.length !== 1 || rows[0].tenant_id !== actor.tenantId || !uuid(rows[0].id) ||
            typeof rows[0].display_name !== 'string' || typeof rows[0].email !== 'string') throw unavailable()
        return { id: rows[0].id, tenant_id: actor.tenantId, display_name: rows[0].display_name, email: rows[0].email }
      })
    },
    listSessions(rawToken: string, page: SessionPage) {
      if (!Number.isSafeInteger(page.limit) || page.limit < 1 || page.limit > numeric('page_max') ||
          ((page.beforeTime === null) !== (page.beforeId === null)) ||
          (page.beforeId !== null && !uuid(page.beforeId))) throw new AuthError(400, 'INVALID_INPUT')
      const beforeTime = page.beforeTime === null ? null : iso(page.beforeTime)
      return active(rawToken, async (broker, actor) => {
        const rows = await broker.call('sessions', [page.limit, beforeTime, page.beforeId])
        if (rows.length > page.limit) throw unavailable()
        return rows.map(row => {
          if (row.tenant_id !== actor.tenantId || !uuid(row.id) || !uuid(row.user_id) ||
              typeof row.is_current !== 'boolean' ||
              (row.device_label !== null && typeof row.device_label !== 'string') ||
              (row.browser_label !== null && typeof row.browser_label !== 'string')) throw unavailable()
          return { id: row.id, tenant_id: actor.tenantId, user_id: row.user_id,
            created_at: iso(row.created_at), last_activity_at: iso(row.last_activity_at),
            absolute_expires_at: iso(row.absolute_expires_at), device_label: row.device_label,
            browser_label: row.browser_label, is_current: row.is_current }
        })
      })
    },
    revokeSelf: (rawToken: string, target: string, key: MutationKey, correlation = randomUUID()) => revoke(rawToken, target, key, correlation),
    revokeOthers: (rawToken: string, key: MutationKey, correlation = randomUUID()) => revoke(rawToken, null, key, correlation),
  })
}
