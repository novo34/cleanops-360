import { Pool, type PoolClient } from 'pg'
import { X509Certificate } from 'node:crypto'
import { isIP } from 'node:net'
import { checkServerIdentity } from 'node:tls'
import { AuthError, type Transaction } from './service.ts'
import type { PrivateTransactionalDriver } from './private-adapter.ts'

const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
export type PgIdentityConfiguration = Readonly<{
  environment: string
  host: string
  port: number
  database: string
  loginRole: string
  contractualRole: string
  ca: Buffer
  password: () => Promise<string>
  maxConnections: number
  connectionTimeoutMs: number
}>

/** Trusted composition only, identical across environments. Construction opens
 * no socket and obtains no credential. Role ACL/NOLOGIN and HBA require separate
 * approved catalog acceptance; names alone cannot prove server privileges.
 */
export function createPgIdentityPool(input: PgIdentityConfiguration): Pool {
  const identifier = /^[a-z_][a-z0-9_]{0,62}$/
  const forbidden = new Set(['postgres', 'cleanops_bootstrap', 'cleanops_auth_broker', 'cleanops_ddl_owner'])
  if (!input || Object.keys(input).sort().join(',') !== 'ca,connectionTimeoutMs,contractualRole,database,environment,host,loginRole,maxConnections,password,port' ||
      !/^[a-z][a-z0-9_-]{0,62}$/.test(input.environment) ||
      ![input.database, input.loginRole, input.contractualRole].every(v => typeof v === 'string' && identifier.test(v)) ||
      input.loginRole === input.contractualRole || forbidden.has(input.loginRole) || input.loginRole.startsWith('pg_') ||
      typeof input.host !== 'string' || input.host.length > 253 || !(isIP(input.host) ||
        input.host.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) ||
      !Number.isSafeInteger(input.port) || input.port < 1 || input.port > 65535 ||
      !Number.isSafeInteger(input.maxConnections) || input.maxConnections < 1 || input.maxConnections > 16 ||
      !Number.isSafeInteger(input.connectionTimeoutMs) || input.connectionTimeoutMs < 1 || input.connectionTimeoutMs > 30000 ||
      !Buffer.isBuffer(input.ca) || input.ca.length > 65536 ||
      !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----\r?\n?$/.test(input.ca.toString('ascii')) ||
      typeof input.password !== 'function') throw unavailable()
  try { if (!new X509Certificate(input.ca).ca) throw unavailable() } catch { throw unavailable() }
  const source = input.password
  const host = input.host
  return new Pool({
    host: input.host, port: input.port, database: input.database, user: input.loginRole,
    password: async () => {
      try {
        const value = await source()
        if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value) > 4096 || /[\r\n\0]/.test(value)) throw unavailable()
        return value
      } catch { throw unavailable() }
    },
    ssl: { ca: Buffer.from(input.ca), rejectUnauthorized: true,
      checkServerIdentity: (_name, certificate) => checkServerIdentity(host, certificate) },
    max: input.maxConnections, connectionTimeoutMillis: input.connectionTimeoutMs,
    options: '', application_name: `cleanops-identity-${input.environment}`,
  })
}
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
