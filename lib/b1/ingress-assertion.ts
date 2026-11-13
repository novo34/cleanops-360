/** Ingress context assertion (b1-context-v1). Issuance requires the authenticated mTLS
 * ForwardAuth adapter (ingress-forward-auth.ts); there is NO device pass or cookie.
 * Identity of the caller is the session/MFA layer; this assertion only carries the
 * proxy-attested network dimension and binds the exact request (host, path, body, cookies).
 * Without a client-side device signal the DEVICE rate-limit dimension is derived from the
 * attested network and session labels are fixed neutral values (no UA/header parsing).
 */
import { createHash, createHmac, randomBytes, sign, verify, type KeyObject } from 'node:crypto'
import { isIP } from 'node:net'
import { canonical } from './contracts.ts'
import { prepareSessionLabels } from './ceremony-preparation.ts'
import { numeric } from './config.ts'
import { AuthError } from './service.ts'
import type { InstallationRequestContext } from './installation-context.ts'
import type { SharedIngressReplayRepository } from './installation-config.ts'

export const assertionHeader = 'x-cleanops-b1-assertion'
const bindingHeaders = ['host', 'authorization', 'cookie', 'origin', 'content-type', 'content-encoding', 'x-csrf-token', 'idempotency-key', 'sec-fetch-site']
const denied = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0
const exact = (x: unknown, keys: string) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).sort().join(',') === keys
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 256 && !/[\p{Cc}\p{Cf}]/u.test(x)
const bytes32 = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{43}$/.test(x) && Buffer.from(x, 'base64url').length === 32 && Buffer.from(x, 'base64url').toString('base64url') === x

export type IngressProtocolOptions = Readonly<{
  issuer: string; audience: string; contextLifetimeMs: number
  maximumBodyBytes: number; bodyTimeoutMs: number; clock: () => number
  /** Reviewed listener-local URL origins; absent means only the public audience. */
  internalOrigins?: readonly string[]
}>
export function assertIngressProtocolOptions(c: IngressProtocolOptions) {
  if (!c || !text(c.issuer) || !text(c.audience) ||
      !integer(c.contextLifetimeMs) || c.contextLifetimeMs > 30000 ||
      !integer(c.maximumBodyBytes) || c.maximumBodyBytes > numeric('json_body_max') ||
      !integer(c.bodyTimeoutMs) || c.bodyTimeoutMs > 5000 || typeof c.clock !== 'function') throw denied()
  const u = new URL(c.audience)
  if (u.protocol !== 'https:' || u.origin !== c.audience || u.username || u.password) throw denied()
  const internal = c.internalOrigins ?? []
  if (!Array.isArray(internal) || internal.length > 8 || new Set(internal).size !== internal.length ||
      internal.some(origin => {
        if (typeof origin !== 'string') return true
        try {
          const value = new URL(origin)
          return (value.protocol !== 'http:' && value.protocol !== 'https:') ||
            value.origin !== origin || !!value.username || !!value.password ||
            !!value.search || !!value.hash || value.pathname !== '/'
        } catch { return true }
      })) throw denied()
}
function now(c: IngressProtocolOptions) { const n = c.clock(); if (!integer(n)) throw denied(); return n }
function ed25519(key: KeyObject, kind: 'private' | 'public') {
  if (!key || key.type !== kind || key.asymmetricKeyType !== 'ed25519') throw denied()
}
function encode(purpose: string, value: object, key: KeyObject): string {
  const encoded = Buffer.from(canonical(value)).toString('base64url')
  const signed = purpose + '.' + encoded
  return signed + '.' + sign(null, Buffer.from(signed), key).toString('base64url')
}
function decode(token: string, purpose: string, key: KeyObject): Record<string, unknown> {
  if (typeof token !== 'string' || token.length > 8192) throw denied()
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== purpose || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]{86}$/.test(parts[2])) throw denied()
  const raw = Buffer.from(parts[1], 'base64url'), signature = Buffer.from(parts[2], 'base64url')
  if (raw.length > 4096 || raw.toString('base64url') !== parts[1] || signature.toString('base64url') !== parts[2] ||
      !verify(null, Buffer.from(parts[0] + '.' + parts[1]), key, signature)) throw denied()
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
  if (canonical(value) !== raw.toString('utf8')) throw denied()
  return value
}
function lifetime(value: Record<string, unknown>, c: IngressProtocolOptions, maximum: number) {
  const at = now(c)
  if (value.iss !== c.issuer || value.aud !== c.audience || !integer(value.iat) || !integer(value.exp) ||
      value.iat > at || value.exp <= at || value.exp <= value.iat || value.exp - value.iat > maximum) throw denied()
}
/** Bounded streaming digest. Original Request remains available to the B1 handler. */
export async function requestBinding(request: Request, c: IngressProtocolOptions): Promise<string> {
  const u = new URL(request.url)
  // Traefik's mTLS adapter signs the public URL, while Next may supply a
  // listener-local URL. Accept only exact origins from the reviewed private
  // configuration, never arbitrary request headers or an unchecked host.
  // The binding still signs the public audience, Host, path/query and body.
  if ((u.origin !== c.audience && !(c.internalOrigins ?? []).includes(u.origin)) ||
      u.hash || !/^[A-Z]+$/.test(request.method)) throw denied()
  const body = createHash('sha256'), reader = request.clone().body?.getReader()
  const deadline = performance.now() + c.bodyTimeoutMs
  let size = 0
  try {
    while (reader) {
      const remaining = deadline - performance.now()
      if (remaining <= 0) throw denied()
      let timer: ReturnType<typeof setTimeout> | undefined
      let part: Awaited<ReturnType<typeof reader.read>>
      try {
        part = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(denied()), remaining) })])
      } finally { if (timer) clearTimeout(timer) }
      if (performance.now() >= deadline) throw denied()
      if (part.done) break
      size += part.value.length
      if (size > c.maximumBodyBytes) throw denied()
      body.update(part.value)
    }
    return hash(canonical(['b1-request-v1', c.audience, request.method, u.pathname + u.search,
      bindingHeaders.map(name => [name, request.headers.get(name)]), body.digest('hex')]))
  } finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock() }
  }
}

/** Neutral session labels: the proxy path carries no trustworthy device/browser signal. */
const unidentified = Object.freeze({ device: 'Dispositivo no identificado', browser: 'Navegador no identificado' })
const dimension = (pseudonym: Buffer, c: IngressProtocolOptions, purpose: string, input: string) =>
  createHmac('sha256', pseudonym).update(canonical(['b1-ingress-dimension-v1', c.issuer, c.audience, purpose, input])).digest('base64url')

export function createIngressIssuer(options: IngressProtocolOptions & Readonly<{ privateKey: KeyObject; pseudonymKey: Buffer }>) {
  assertIngressProtocolOptions(options); ed25519(options.privateKey, 'private')
  if (!Buffer.isBuffer(options.pseudonymKey) || options.pseudonymKey.length !== 32) throw denied()
  const c = Object.freeze({ ...options }), pseudonym = Buffer.from(c.pseudonymKey)
  let active = true
  return Object.freeze({
    /** Invoke ONLY after the proxy was authenticated (pinned mTLS) and its forwarded
     * single-hop metadata validated by the ForwardAuth adapter. */
    async issueForAuthenticatedIngress(request: Request, canonicalNetwork: string) {
      if (!active || !isIP(canonicalNetwork)) throw denied()
      const binding = await requestBinding(request, c), at = now(c)
      if (!active) throw denied()
      return encode('b1-context-v1', { iss: c.issuer, aud: c.audience, iat: at, exp: at + c.contextLifetimeMs,
        nonce: randomBytes(32).toString('base64url'), binding,
        network: dimension(pseudonym, c, 'network', canonicalNetwork),
        device: dimension(pseudonym, c, 'device', canonicalNetwork) }, c.privateKey)
    },
    dispose() { active = false; pseudonym.fill(0) },
  })
}

/** Shared atomic replay store required: every consumer claims the same nonce space. */
export function createIngressVerifier(options: IngressProtocolOptions & Readonly<{
  publicKey: KeyObject
  replay: SharedIngressReplayRepository
  topology: 'shared-atomic-all-consumers'
}>) {
  assertIngressProtocolOptions(options)
  ed25519(options.publicKey, 'public')
  if (options.topology !== 'shared-atomic-all-consumers' || typeof options.replay?.claim !== 'function') throw denied()
  const c = Object.freeze({ ...options })
  const epoch = now(c)
  let lastTime = epoch
  return Object.freeze({
    async resolveRequestContext(request: Request): Promise<InstallationRequestContext> {
      try {
        const token = request.headers.get(assertionHeader)
        if (!token) throw denied()
        const a = decode(token, 'b1-context-v1', c.publicKey)
        if (!exact(a, 'aud,binding,device,exp,iat,iss,network,nonce') ||
            !bytes32(a.nonce) || !bytes32(a.network) || !bytes32(a.device)) throw denied()
        lifetime(a, c, c.contextLifetimeMs)
        if ((a.iat as number) <= epoch) throw denied()
        if (a.binding !== await requestBinding(request, c)) throw denied()
        // Recheck after async body work, then claim through the shared store.
        lifetime(a, c, c.contextLifetimeMs)
        const at = now(c)
        if (at < lastTime) throw denied()
        lastTime = at
        if (await c.replay.claim({ issuer: c.issuer, audience: c.audience,
          nonce: a.nonce as string, expiresAt: a.exp as number }) !== 'claimed') throw denied()
        lifetime(a, c, c.contextLifetimeMs)
        return { network: Buffer.from(a.network as string, 'base64url'),
          device: Buffer.from(a.device as string, 'base64url'),
          labels: prepareSessionLabels(unidentified) }
      } catch { throw denied() }
    },
  })
}
