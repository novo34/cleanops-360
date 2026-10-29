import https from 'node:https'
import { inspect } from 'node:util'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute } from 'node:path'
import { AuthError } from './service.ts'

export type PrivateKeyReference = Readonly<{
  tenantId: string
  purpose: 'totp-aead' | 'mail-aead' | 'audit-hmac' | 'otp-hmac' | 'recovery-hmac' | 'cursor-hmac'
  keyId: string
  version: number
}>
export type PrivateKeyLease = Readonly<{
  /** Positive remaining server-statement budget. Throws when key access expires. */
  remainingMs(): number
  /** Only the guarded SQL transport calls this after observing successful COMMIT. */
  acknowledgeCommit(): void
}>
export interface OpenBaoKeyOptions {
  /** Trusted composition only. Never request headers, URLs or client selectors. */
  origin: string
  mount: string
  environment: string
  ca: Buffer
  cert: Buffer
  key: Buffer
  token: () => Promise<string>
  timeoutMs: number
  allowed: readonly PrivateKeyReference[]
}
const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
/** Linux tmpfs sink only. Trusted configuration; never an HTTP path/selector.
 * No token cache, mtime-based validity inference or Bao authentication client.
 */
export function createAgentSinkToken(options: Readonly<{
  path: string; uid: number; gid: number; directoryUid: number; directoryGid: number
  mode: 0o600 | 0o640; directoryMode: 0o700 | 0o750; timeoutMs: number
}>): () => Promise<string> {
  if (!options || typeof options.path !== 'string' || !isAbsolute(options.path) || options.path.includes('\0') ||
      options.path.split('/').slice(1).some(p => !p || p === '.' || p === '..') ||
      ![options.uid, options.gid, options.directoryUid, options.directoryGid].every(n => Number.isSafeInteger(n) && n >= 0) ||
      ![0o600, 0o640].includes(options.mode) || ![0o700, 0o750].includes(options.directoryMode) ||
      !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 5000) throw unavailable()
  const config = Object.freeze({ ...options })
  return async () => {
    const deadline = performance.now() + config.timeoutMs
    const budget = () => { if (performance.now() >= deadline) throw unavailable() }
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      const handles: Awaited<ReturnType<typeof fs.open>>[] = []
      const raw = Buffer.alloc(1025)
      let value: string | undefined, closeFailed = false
      try {
        // Resolve each directory via its open descriptor, never following a
        // symlink in a parent component or reopening an attacker-swapped parent.
        let directory = await fs.open('/', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
        handles.push(directory)
        const parts = config.path.split('/').slice(1)
        for (const part of parts.slice(0, -1)) {
          budget()
          directory = await fs.open(`/proc/self/fd/${directory.fd}/${part}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
          handles.push(directory)
        }
        const parent = await directory.stat()
        if (parent.uid !== config.directoryUid || parent.gid !== config.directoryGid ||
            (parent.mode & 0o7777) !== config.directoryMode ||
            (await fs.statfs(`/proc/self/fd/${directory.fd}`)).type !== 0x01021994) throw unavailable()
        budget()
        const file = await fs.open(`/proc/self/fd/${directory.fd}/${parts.at(-1)}`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        handles.push(file)
        const before = await file.stat()
        if (!before.isFile() || before.nlink !== 1 || before.uid !== config.uid || before.gid !== config.gid ||
            (before.mode & 0o7777) !== config.mode || before.size < 1 || before.size > 1024) throw unavailable()
        let size = 0
        while (size < raw.length) {
          budget()
          const { bytesRead } = await file.read(raw, size, raw.length - size, size)
          size += bytesRead
          if (!bytesRead) break
        }
        const after = await file.stat()
        budget()
        if (size > 1024 || raw.subarray(0, size).some(byte => byte > 127) || size !== before.size || after.size !== before.size ||
            after.mode !== before.mode || after.uid !== before.uid || after.gid !== before.gid ||
            !/^[A-Za-z0-9._-]{1,1024}\n?$/.test(raw.subarray(0, size).toString('ascii'))) throw unavailable()
        value = raw.subarray(0, size).toString('ascii').replace(/\n$/, '')
      } catch { throw unavailable() }
      finally {
        raw.fill(0)
        const closed = await Promise.allSettled(handles.map(handle => handle.close()))
        closeFailed = closed.some(result => result.status === 'rejected')
      }
      if (closeFailed || value === undefined) throw unavailable()
      return value
    }
    try {
      return await Promise.race([read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(unavailable()), config.timeoutMs)
      })])
    } catch { throw unavailable() }
    finally { if (timer) clearTimeout(timer) }
  }
}
const segment = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const purposes = new Set(['totp-aead', 'mail-aead', 'audit-hmac', 'otp-hmac', 'recovery-hmac', 'cursor-hmac'])
function identity(r: PrivateKeyReference): string {
  if (!r || !uuid.test(r.tenantId) || !purposes.has(r.purpose) || !segment.test(r.keyId) || !Number.isSafeInteger(r.version) || r.version < 1) throw unavailable()
  return JSON.stringify([r.tenantId.toLowerCase(), r.purpose, r.keyId, r.version])
}

/** Private KV-v2 client; not wired into runtime. Exact allowlisted versions only.
 * Fetch before opening a B1 transaction. No stale cache, latest-version fallback,
 * redirect, remote error bodies, plaintext logging or network in decryptTotp.
 * Key access expires at the configured deadline, including while work is pending.
 * SQL composition must enforce the same lease before effects/COMMIT. A confirmed
 * COMMIT receipt can outlive the lease; it cannot authorize further key/SQL use.
 * Owned buffers are zeroed on expiry, success and failure; never retain them.
 */
export function createOpenBaoKeys(options: OpenBaoKeyOptions) {
  let origin: URL
  try { origin = new URL(options.origin) } catch { throw unavailable() }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
      !segment.test(options.mount) || !segment.test(options.environment) ||
      !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30000 ||
      ![options.ca, options.cert, options.key].every(b => Buffer.isBuffer(b) && b.length > 0) || typeof options.token !== 'function') throw unavailable()
  const allowed = new Set(options.allowed.map(identity))
  if (!allowed.size || allowed.size !== options.allowed.length) throw unavailable()
  const mount = options.mount, environment = options.environment, timeoutMs = options.timeoutMs
  const tls = { ca: Buffer.from(options.ca), cert: Buffer.from(options.cert), key: Buffer.from(options.key), rejectUnauthorized: true }
  const tokenProvider = options.token
  async function read(input: PrivateKeyReference): Promise<Buffer> {
    const r = Object.freeze({ ...input })
    if (!allowed.has(identity(r))) throw unavailable()
    // Authentication and KV transport share one absolute acquisition budget.
    const deadline = performance.now() + timeoutMs
    let tokenTimer: ReturnType<typeof setTimeout> | undefined
    let token: string
    try {
      token = await Promise.race([tokenProvider(), new Promise<never>((_, reject) => { tokenTimer = setTimeout(() => reject(unavailable()), timeoutMs) })])
    } finally { if (tokenTimer) clearTimeout(tokenTimer) }
    if (typeof token !== 'string' || !/^[A-Za-z0-9._-]{1,1024}$/.test(token)) throw unavailable()
    const remaining = deadline - performance.now()
    if (remaining <= 0) throw unavailable()
    const path = `/v1/${mount}/data/${environment}/${r.tenantId.toLowerCase()}/${r.purpose}/${r.keyId}?version=${r.version}`
    return new Promise((resolve, reject) => {
      let settled = false
      const chunks: Buffer[] = []
      let size = 0
      const fail = () => { if (!settled) { settled = true; for (const b of chunks) b.fill(0); reject(unavailable()) } }
      const req = https.request(new URL(path, origin), { ...tls, method: 'GET', agent: false, headers: { 'X-Vault-Token': token, accept: 'application/json' } }, res => {
        if (res.statusCode !== 200) { res.destroy(); fail(); return }
        res.on('data', (b: Buffer) => { size += b.length; if (size > 8192) { b.fill(0); req.destroy(); fail() } else chunks.push(b) })
        res.on('error', fail)
        res.on('aborted', fail)
        res.on('end', () => {
          if (settled) return
          const raw = Buffer.concat(chunks)
          let key: Buffer | undefined
          try {
            const data = JSON.parse(raw.toString('utf8'))?.data
            if (data?.metadata?.version !== r.version || data.metadata.destroyed !== false || data.metadata.deletion_time !== '' ||
                typeof data?.data?.value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(data.data.value)) throw unavailable()
            key = Buffer.from(data.data.value, 'base64')
            if (key.length !== 32 || key.toString('base64') !== data.data.value) throw unavailable()
            // Timer delivery can lag behind end/decoding when the event loop
            // stalls. Reject late material before handing it to a fresh lease;
            // catch/finally below wipe the decoded key, raw response and chunks.
            if (performance.now() >= deadline) throw unavailable()
            settled = true; resolve(key)
          } catch { key?.fill(0); fail() }
          finally { raw.fill(0); for (const b of chunks) b.fill(0) }
        })
      })
      // Absolute deadline, including token-independent socket stalls and trickles.
      const timer = setTimeout(() => { req.destroy(); fail() }, remaining)
      req.once('close', () => clearTimeout(timer))
      req.on('error', fail)
      req.end()
    })
  }
  return Object.freeze({
    async withKeys<T>(references: readonly PrivateKeyReference[], lifetimeMs: number,
      work: (borrow: <R>(r: PrivateKeyReference, fn: (key: Buffer) => R) => R, lease: PrivateKeyLease) => Promise<T>): Promise<T> {
      const keys = new Map<string, Buffer>()
      let active = true, commitObserved = false
      let expiryTimer: ReturnType<typeof setTimeout> | undefined
      const expire = () => { active = false; for (const key of keys.values()) key.fill(0) }
      if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 30000 || !references.length) throw unavailable()
      try {
        // Sequential reads avoid orphaned successful secret buffers after a failure.
        for (const r of references) { const id = identity(r); if (keys.has(id)) throw unavailable(); keys.set(id, await read(r)) }
        const deadline = performance.now() + lifetimeMs
        const remainingMs = () => {
          const remaining = deadline - performance.now()
          if (!active || remaining <= 0) throw unavailable()
          return remaining
        }
        const lease = Object.freeze({ remainingMs, acknowledgeCommit() { commitObserved = true } })
        expiryTimer = setTimeout(expire, lifetimeMs)
        const borrow = <R>(r: PrivateKeyReference, fn: (key: Buffer) => R): R => {
          remainingMs()
          const key = keys.get(identity(r)); if (!key) throw unavailable()
          return fn(key)
        }
        const result = await work(borrow, lease)
        // A confirmed COMMIT must not become a false 503 solely because its
        // acknowledgement or response projection arrives after key expiration.
        // Further borrowing/SQL remains forbidden; keys have already been wiped.
        if (!commitObserved) remainingMs()
        return result
      } catch { throw unavailable() }
      finally { if (expiryTimer) clearTimeout(expiryTimer); expire(); keys.clear() }
    },
    [inspect.custom]() { return '[OpenBao private key provider]' },
    toJSON() { return { type: 'OpenBao private key provider' } },
  })
}
