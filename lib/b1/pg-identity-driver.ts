import type { PoolClient } from 'pg'
import { AuthError, type Transaction } from './service.ts'
import type { PrivateTransactionalDriver } from './private-adapter.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
/** Deliberately NOT configured by runtime. Uses a dedicated identity-service pool only.
 * A broker implementation must exclusively invoke approved V4 functions; no direct table
 * access, arbitrary request-derived SQL, privileged owner role or user-controlled GUC.
 * This transport does not grant any authority or implement broker functions itself. */
export interface IdentityConnection {
  query(sql: string, values?: unknown[]): Promise<unknown>
  release(discard?: boolean): void
}
export interface IdentityPool {
  connect(): Promise<IdentityConnection>
}
export type BrokerFactory = (connection: IdentityConnection) => Transaction
export type BootstrapWriter = (connection: IdentityConnection, bindingDigest: string, csrfDigest: string, expiresAt: number) => Promise<void>

/** One connection per transaction. No fallback, retries or success before COMMIT.
 * Failed attempts returned as AuthError outcomes are committed by the HTTP layer;
 * thrown errors cause ROLLBACK. On uncertain commit, always discard the connection. */
export function createPgIdentityDriver(pool: IdentityPool, broker: BrokerFactory, writeBootstrap: BootstrapWriter): PrivateTransactionalDriver {
  if (!pool || typeof pool.connect !== 'function' || typeof broker !== 'function' || typeof writeBootstrap !== 'function') throw unavailable()
  const { run } = createPgIdentityUnitOfWork(pool)
  return Object.freeze({
    transaction<T>(work: (tx: Transaction) => Promise<T>) {
      return run(connection => work(broker(connection)))
    },
    bootstrap(bindingDigest: string, csrfDigest: string, expiresAt: number) {
      if (!/^[a-f0-9]{64}$/.test(bindingDigest) || !/^[a-f0-9]{64}$/.test(csrfDigest) ||
          !Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw unavailable()
      return run(connection => writeBootstrap(connection, bindingDigest, csrfDigest, expiresAt))
    },
  })
}

/** Structural compile-time check only; importing pg types cannot open a connection. */
export type PgClientForReview = Pick<PoolClient, 'query' | 'release'>

/** Shared transaction runner for concrete V4 repositories; never wired by runtime. */
export function createPgIdentityUnitOfWork(pool: IdentityPool) {
  if (!pool || typeof pool.connect !== 'function') throw unavailable()
  async function run<T>(operation: (connection: IdentityConnection) => Promise<T>): Promise<T> {
    let connection: IdentityConnection | undefined
    let begun = false
    let committed = false
    let result: T
    let releaseFailed = false
    try {
      connection = await pool.connect()
      if (!connection || typeof connection.query !== 'function' || typeof connection.release !== 'function') throw unavailable()
      await connection.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      begun = true
      result = await operation(connection)
      await connection.query('COMMIT')
      committed = true
    } catch (error) {
      if (connection && begun && !committed) {
        try { await connection.query('ROLLBACK') } catch { /* discard connection */ }
      }
      if (error instanceof AuthError) throw error
      throw unavailable()
    } finally {
      // Never allow an uncertain transaction/session state back into the pool.
      if (connection) {
        try { connection.release(!committed) }
        catch { releaseFailed = true }
      }
    }
    if (releaseFailed) throw unavailable()
    return result
  }
  return Object.freeze({ run })
}

