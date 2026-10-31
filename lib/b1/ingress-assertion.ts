/** Unwired candidate protocol. Issuance requires an authenticated ingress adapter.
 * Device credentials identify a server-enrolled logical profile, never hardware/MFA.
 */
import { createHash, createHmac, createPublicKey, randomBytes, sign, verify, type KeyObject } from 'node:crypto'
import { isIP } from 'node:net'
import { canonical } from './contracts.ts'
import { prepareSessionLabels } from './ceremony-preparation.ts'
import { numeric } from './config.ts'
import { AuthError } from './service.ts'
import type { InstallationRequestContext } from './installation-context.ts'
import type { DurableIngressCredentials, SharedIngressReplayRepository } from './installation-config.ts'

export const assertionHeader = 'x-cleanops-b1-assertion'
export const credentialCookie = '__Host-cleanops_b1_ingress_device'
const bindingHeaders = ['host', 'authorization', 'cookie', 'origin', 'content-type', 'content-encoding', 'x-csrf-token', 'idempotency-key', 'sec-fetch-site']
const denied = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0
const exact = (x: unknown, keys: string) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).sort().join(',') === keys
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 256 && !/[\p{Cc}\p{Cf}]/u.test(x)
const bytes32 = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{43}$/.test(x) && Buffer.from(x, 'base64url').length === 32 && Buffer.from(x, 'base64url').toString('base64url') === x

export type IngressProtocolOptions = Readonly<{
  issuer: string; audience: string; maximumDeviceLifetimeMs: number; contextLifetimeMs: number
  maximumBodyBytes: number; bodyTimeoutMs: number; clock: () => number
}>
function validate(c: IngressProtocolOptions) {
  if (!c || !text(c.issuer) || !text(c.audience) || !integer(c.maximumDeviceLifetimeMs) ||
      !integer(c.contextLifetimeMs) || c.contextLifetimeMs > 30000 ||
      !integer(c.maximumBodyBytes) || c.maximumBodyBytes > numeric('json_body_max') ||
      !integer(c.bodyTimeoutMs) || c.bodyTimeoutMs > 5000 || typeof c.clock !== 'function') throw denied()
  const u = new URL(c.audience)
  if (u.protocol !== 'https:' || u.origin !== c.audience || u.username || u.password) throw denied()
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
export function readDeviceCredential(request: Request): string {
  const found = (request.headers.get('cookie') ?? '').split(';').map(x => x.trim()).filter(x => x.startsWith(credentialCookie + '='))
  if (found.length !== 1) throw denied()
  const value = found[0].slice(credentialCookie.length + 1)
  if (!value || value.length > 4096) throw denied()
  return value
}
function device(token: string, key: KeyObject, c: IngressProtocolOptions) {
  const d = decode(token, 'b1-device-v1', key)
  if (!exact(d, 'aud,browser,device,exp,iat,id,iss') || !bytes32(d.id)) throw denied()
  lifetime(d, c, c.maximumDeviceLifetimeMs)
  const labels = prepareSessionLabels({ device: d.device, browser: d.browser })
  return { id: d.id as string, issuedAt: d.iat as number, expiresAt: d.exp as number, labels }
}
/** Bounded streaming digest. Original Request remains available to the B1 handler. */
export async function requestBinding(request: Request, c: IngressProtocolOptions): Promise<string> {
  const u = new URL(request.url)
  if (u.origin !== c.audience || u.hash || !/^[A-Z]+$/.test(request.method)) throw denied()
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

export function createCandidateIssuer(options: IngressProtocolOptions & Readonly<{ privateKey: KeyObject; pseudonymKey: Buffer }>) {
  validate(options); ed25519(options.privateKey, 'private')
  if (!Buffer.isBuffer(options.pseudonymKey) || options.pseudonymKey.length !== 32) throw denied()
  const c = Object.freeze({ ...options }), publicKey = createPublicKey(c.privateKey), pseudonym = Buffer.from(c.pseudonymKey)
  let active = true
  return Object.freeze({
    /** Trusted enrolment code ONLY; deliberately no public HTTP mint endpoint. */
    issueDeviceCredential(labels: Readonly<{ device: string; browser: string }>, lifetimeMs: number) {
      if (!active) throw denied()
      const safe = prepareSessionLabels(labels), at = now(c)
      if (!integer(lifetimeMs) || lifetimeMs > c.maximumDeviceLifetimeMs || !Number.isSafeInteger(at + lifetimeMs)) throw denied()
      return encode('b1-device-v1', { iss: c.issuer, aud: c.audience, iat: at, exp: at + lifetimeMs,
        id: randomBytes(32).toString('base64url'), device: safe.device, browser: safe.browser }, c.privateKey)
    },
    /** Invoke ONLY after authenticating the proxy and its source-IP policy. */
    async issueForAuthenticatedIngress(request: Request, canonicalNetwork: string) {
      if (!active || !isIP(canonicalNetwork)) throw denied()
      const credential = readDeviceCredential(request), d = device(credential, publicKey, c)
      const binding = await requestBinding(request, c), at = now(c)
      if (!active || d.expiresAt <= at) throw denied()
      const dimensions = (purpose: string, input: string) => createHmac('sha256', pseudonym).update(canonical(['b1-ingress-dimension-v1', c.issuer, c.audience, purpose, input])).digest('base64url')
      return encode('b1-context-v1', { iss: c.issuer, aud: c.audience, iat: at, exp: Math.min(at + c.contextLifetimeMs, d.expiresAt),
        nonce: randomBytes(32).toString('base64url'), binding, credential: hash(credential),
        network: dimensions('network', canonicalNetwork), device: dimensions('device', d.id),
        deviceLabel: d.labels.device, browserLabel: d.labels.browser }, c.privateKey)
    },
    dispose() { active = false; pseudonym.fill(0) },
  })
}

/** Durable issuer candidate. A credential is never returned before an independently
 * authorized durable enrollment commits; runtime PG repository writes remain blocked.
 * Existing legacy fixture issuer is unchanged and cannot authorize production.
 */
export function createDurableCandidateIssuer(options: IngressProtocolOptions & Readonly<{
  privateKey: KeyObject
  pseudonymKey: Buffer
  credentials: DurableIngressCredentials
}>) {
  validate(options)
  ed25519(options.privateKey, 'private')
  if (!Buffer.isBuffer(options.pseudonymKey) || options.pseudonymKey.length !== 32 ||
      typeof options.credentials?.enroll !== 'function' ||
      typeof options.credentials?.read !== 'function') throw denied()
  const c = Object.freeze({ ...options })
  const publicKey = createPublicKey(c.privateKey)
  const pseudonym = Buffer.from(c.pseudonymKey)
  let active = true
  const confirmActive = async (d: ReturnType<typeof device>) => {
    const record = await c.credentials.read({ issuer: c.issuer, audience: c.audience, id: d.id })
    if (!record || record.state !== 'active' || record.id !== d.id ||
        record.issuer !== c.issuer || record.audience !== c.audience ||
        record.issuedAt !== d.issuedAt || record.expiresAt !== d.expiresAt ||
        record.expiresAt <= now(c)) throw denied()
  }
  return Object.freeze({
    async issueDeviceCredential(labels: Readonly<{ device: string; browser: string }>,
      lifetimeMs: number, enrollment: Readonly<{ reference: string; authorizationReference: string }>) {
      if (!active) throw denied()
      const safe = prepareSessionLabels(labels), at = now(c)
      if (!integer(lifetimeMs) || lifetimeMs > c.maximumDeviceLifetimeMs ||
          !Number.isSafeInteger(at + lifetimeMs) ||
          !enrollment || !text(enrollment.reference) ||
          !text(enrollment.authorizationReference)) throw denied()
      const id = randomBytes(32).toString('base64url')
      const exp = at + lifetimeMs
      await c.credentials.enroll({ record: { issuer: c.issuer, audience: c.audience, id,
        issuedAt: at, expiresAt: exp, revision: '1', state: 'active',
        enrollmentReference: enrollment.reference },
        authorizationReference: enrollment.authorizationReference })
      if (!active || exp <= now(c)) throw denied()
      return encode('b1-device-v1', { iss: c.issuer, aud: c.audience, iat: at,
        exp, id, device: safe.device, browser: safe.browser }, c.privateKey)
    },
    async issueForAuthenticatedIngress(request: Request, canonicalNetwork: string) {
      if (!active || !isIP(canonicalNetwork)) throw denied()
      const credential = readDeviceCredential(request)
      const d = device(credential, publicKey, c)
      const binding = await requestBinding(request, c)
      await confirmActive(d)
      if (!active) throw denied()
      const at = now(c)
      const dimensions = (purpose: string, input: string) => createHmac('sha256', pseudonym)
        .update(canonical(['b1-ingress-dimension-v1', c.issuer, c.audience, purpose, input]))
        .digest('base64url')
      return encode('b1-context-v1', { iss: c.issuer, aud: c.audience, iat: at,
        exp: Math.min(at + c.contextLifetimeMs, d.expiresAt),
        nonce: randomBytes(32).toString('base64url'), binding, credential: hash(credential),
        network: dimensions('network', canonicalNetwork), device: dimensions('device', d.id),
        deviceLabel: d.labels.device, browserLabel: d.labels.browser }, c.privateKey)
    },
    dispose() { active = false; pseudonym.fill(0) },
  })
}

/** Persistent candidate only: requires authoritative credential reads and shared atomic
 * replay. Does not replace the legacy candidate or enable runtime installation.
 */
export function createDurableCandidateVerifier(options: IngressProtocolOptions & Readonly<{
  publicKey: KeyObject
  replay: SharedIngressReplayRepository
  credentials: Pick<DurableIngressCredentials, 'read'>
  topology: 'shared-atomic-all-consumers'
}>) {
  validate(options)
  ed25519(options.publicKey, 'public')
  if (options.topology !== 'shared-atomic-all-consumers' ||
      typeof options.replay?.claim !== 'function' ||
      typeof options.credentials?.read !== 'function') throw denied()
  const c = Object.freeze({ ...options })
  const epoch = now(c)
  let lastTime = epoch
  return Object.freeze({
    async resolveRequestContext(request: Request): Promise<InstallationRequestContext> {
      try {
        const token = request.headers.get(assertionHeader)
        if (!token) throw denied()
        const a = decode(token, 'b1-context-v1', c.publicKey)
        if (!exact(a, 'aud,binding,browserLabel,credential,device,deviceLabel,exp,iat,iss,network,nonce') ||
            !bytes32(a.nonce) || !bytes32(a.network) || !bytes32(a.device)) throw denied()
        lifetime(a, c, c.contextLifetimeMs)
        if ((a.iat as number) <= epoch) throw denied()
        const credential = readDeviceCredential(request)
        const d = device(credential, c.publicKey, c)
        if (a.credential !== hash(credential) || a.deviceLabel !== d.labels.device ||
            a.browserLabel !== d.labels.browser || a.binding !== await requestBinding(request, c)) throw denied()
        lifetime(a, c, c.contextLifetimeMs)
        const at = now(c)
        if (d.expiresAt <= at || (a.exp as number) > d.expiresAt || at < lastTime) throw denied()
        lastTime = at
        const checkCredential = async () => {
          const record = await c.credentials.read({ issuer: c.issuer, audience: c.audience, id: d.id })
          if (!record || record.state !== 'active' || record.issuer !== c.issuer ||
              record.audience !== c.audience || record.id !== d.id ||
              record.issuedAt !== d.issuedAt || record.expiresAt !== d.expiresAt ||
              record.expiresAt <= now(c)) throw denied()
        }
        await checkCredential()
        if (await c.replay.claim({ issuer: c.issuer, audience: c.audience,
          nonce: a.nonce as string, expiresAt: a.exp as number }) !== 'claimed') throw denied()
        lifetime(a, c, c.contextLifetimeMs)
        await checkCredential()
        return { network: Buffer.from(a.network as string, 'base64url'),
          device: Buffer.from(a.device as string, 'base64url'),
          labels: prepareSessionLabels({ device: a.deviceLabel, browser: a.browserLabel }) }
      } catch { throw denied() }
    },
  })
}

/** One finite cache for one verifier process/consumer. No eviction of live nonces.
 * Restarts reject assertions older than the cache epoch. Multi-process use is blocked
 * operationally until an atomic shared store is approved; this is not distributed replay protection.
 */
export function createCandidateVerifier(options: IngressProtocolOptions & Readonly<{
  publicKey: KeyObject; replayCapacity: number; topology: 'single-process-single-consumer'
}>) {
  validate(options); ed25519(options.publicKey, 'public')
  if (options.topology !== 'single-process-single-consumer' || !integer(options.replayCapacity) || options.replayCapacity > 100000) throw denied()
  const c = Object.freeze({ ...options }), epoch = now(c), used = new Map<string, number>()
  let lastTime = epoch
  return Object.freeze({
    async resolveRequestContext(request: Request): Promise<InstallationRequestContext> {
      try {
        const token = request.headers.get(assertionHeader)
        if (!token) throw denied()
        const a = decode(token, 'b1-context-v1', c.publicKey)
        if (!exact(a, 'aud,binding,browserLabel,credential,device,deviceLabel,exp,iat,iss,network,nonce') ||
            !bytes32(a.nonce) || !bytes32(a.network) || !bytes32(a.device)) throw denied()
        lifetime(a, c, c.contextLifetimeMs)
        if ((a.iat as number) <= epoch) throw denied()
        const credential = readDeviceCredential(request), d = device(credential, c.publicKey, c)
        if (a.credential !== hash(credential) || a.deviceLabel !== d.labels.device || a.browserLabel !== d.labels.browser ||
            a.binding !== await requestBinding(request, c)) throw denied()
        // Recheck after async body work, then claim synchronously: concurrent replay
        // cannot pass between checking a nonce and inserting it.
        lifetime(a, c, c.contextLifetimeMs)
        const at = now(c)
        if (d.expiresAt <= at || (a.exp as number) > d.expiresAt) throw denied()
        if (at < lastTime) throw denied()
        lastTime = at
        for (const [nonce, expires] of used) if (expires <= at) used.delete(nonce)
        if (used.has(a.nonce) || used.size >= c.replayCapacity) throw denied()
        used.set(a.nonce, a.exp as number)
        return { network: Buffer.from(a.network, 'base64url'), device: Buffer.from(a.device, 'base64url'),
          labels: prepareSessionLabels({ device: a.deviceLabel, browser: a.browserLabel }) }
      } catch { throw denied() }
    },
  })
}
