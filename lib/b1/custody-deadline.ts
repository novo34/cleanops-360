/** Private transaction lease. Never wired into runtime or granted SQL authority. */
import { AuthError } from './service.ts'
import type { IdentityPool } from './pg-identity-driver.ts'
import type { PrivateKeyLease } from './openbao-keys.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
// pg_settings.setting is milliseconds for statement_timeout. LEAST ignores NULL
// (zero means unlimited). Never lengthen an existing, stricter statement timeout.
const timeoutSql = `SELECT pg_catalog.set_config('statement_timeout',
  LEAST(NULLIF((SELECT setting::bigint FROM pg_catalog.pg_settings
    WHERE name = 'statement_timeout'), 0), $1::bigint)::text, true)`

export function createCustodyDeadlinePool(pool: IdentityPool, lease: PrivateKeyLease): IdentityPool {
  if (!pool || typeof pool.connect !== 'function' || !lease ||
      typeof lease.remainingMs !== 'function' || typeof lease.acknowledgeCommit !== 'function') throw unavailable()
  const budget = () => {
    const value = lease.remainingMs()
    if (!Number.isSafeInteger(value) || value < 1 || value > 30000) throw unavailable()
    return value
  }
  return Object.freeze({
    async connect() {
      budget()
      const connection = await pool.connect()
      try { budget() } catch (error) {
        connection.release(true)
        throw error
      }
      let begun = false
      return {
        async query(sql: string, values?: unknown[]) {
          // Cleanup remains possible after the lease expires or the transaction
          // is aborted. No data/key access is needed to roll back.
          if (sql === 'ROLLBACK') {
            try { return await connection.query(sql, values) }
            finally { begun = false }
          }
          budget()
          if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') {
            const result = await connection.query(sql, values)
            begun = true
            budget()
            return result
          }
          if (!begun) throw unavailable()
          // Reserve transport/configuration headroom. If SET itself used that
          // headroom, refuse the business statement instead of giving it an old,
          // larger budget. Server timeout remains no longer than the lease.
          const statementBudget = Math.max(1, Math.floor(budget() / 2))
          await connection.query(timeoutSql, [statementBudget])
          if (budget() < statementBudget) throw unavailable()
          const result = await connection.query(sql, values)
          if (sql === 'COMMIT') {
            begun = false
            // Do not discard a successful one-time result for a late network ack.
            lease.acknowledgeCommit()
          } else {
            // A late query result cannot proceed to COMMIT, even if a synthetic
            // transport or an uninterruptible server section missed the timer.
            budget()
          }
          return result
        },
        release(discard?: boolean) { connection.release(discard) },
      }
    },
  })
}
