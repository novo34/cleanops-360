import https from 'node:https'
import { inspect } from 'node:util'
import { AuthError } from './service.ts'

export type PrivateKeyReference = Readonly<{
  tenantId: string
  purpose: 'totp-aead' | 'mail-aead' | 'audit-hmac' | 'otp-hmac' | 'recovery-hmac' | 'cursor-hmac'
  keyId: string
  version: number
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
 * Work must finish before its explicitly configured deadline; owned buffers are
 * zeroed on success and failure. Callers must not retain borrowed buffers.
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
    let tokenTimer: ReturnType<typeof setTimeout> | undefined
    let token: string
    try {
      token = await Promise.race([tokenProvider(), new Promise<never>((_, reject) => { tokenTimer = setTimeout(() => reject(unavailable()), timeoutMs) })])
    } finally { if (tokenTimer) clearTimeout(tokenTimer) }
    if (typeof token !== 'string' || !/^[A-Za-z0-9._-]{1,1024}$/.test(token)) throw unavailable()
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
            settled = true; resolve(key)
          } catch { key?.fill(0); fail() }
          finally { raw.fill(0); for (const b of chunks) b.fill(0) }
        })
      })
      // Absolute deadline, including token-independent socket stalls and trickles.
      const timer = setTimeout(() => { req.destroy(); fail() }, timeoutMs)
      req.once('close', () => clearTimeout(timer))
      req.on('error', fail)
      req.end()
    })
  }
  return Object.freeze({
    async withKeys<T>(references: readonly PrivateKeyReference[], lifetimeMs: number,
      work: (borrow: <R>(r: PrivateKeyReference, fn: (key: Buffer) => R) => R) => Promise<T>): Promise<T> {
      const keys = new Map<string, Buffer>()
      let active = true
      if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 30000 || !references.length) throw unavailable()
      try {
        // Sequential reads avoid orphaned successful secret buffers after a failure.
        for (const r of references) { const id = identity(r); if (keys.has(id)) throw unavailable(); keys.set(id, await read(r)) }
        const deadline = performance.now() + lifetimeMs
        const borrow = <R>(r: PrivateKeyReference, fn: (key: Buffer) => R): R => {
          if (!active || performance.now() >= deadline) throw unavailable()
          const key = keys.get(identity(r)); if (!key) throw unavailable()
          return fn(key)
        }
        const result = await work(borrow)
        if (performance.now() >= deadline) throw unavailable()
        return result
      } catch { throw unavailable() }
      finally { active = false; for (const b of keys.values()) b.fill(0); keys.clear() }
    },
    [inspect.custom]() { return '[OpenBao private key provider]' },
    toJSON() { return { type: 'OpenBao private key provider' } },
  })
}
