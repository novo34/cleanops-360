/** Isolated test composition only. Never imported by routes/runtime. */
import { Pool } from 'pg'
import { hash, argon2id } from 'argon2'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { TOTP, Secret } from 'otpauth'
import { createApprovedPrivateBackend } from '../lib/b1/approved-backend.ts'
import { createAuthHandler, digest, names, token } from '../lib/b1/service.ts'
import { numeric } from '../lib/b1/config.ts'

let serialized = ''
for await (const chunk of process.stdin) serialized += chunk
const input = JSON.parse(serialized)
const checks: { name: string; status: string; detail?: string }[] = []
const admin = new Pool({ host: '/var/run/postgresql', database: 'core', user: 'postgres', max: 1 })
const identity = new Pool({ host: '/var/run/postgresql', database: 'core', user: input.identityRole, max: 2 })
const origin = 'https://pg05.fixture.invalid'
const password = 'PG05 synthetic passphrase!'
const key = randomBytes(32), secret = randomBytes(32), nonce = randomBytes(12), method = randomUUID()
const aad = Buffer.from(JSON.stringify([input.tenant, input.user, method, '1', 'SHA256', 'pg05-ephemeral']))
const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(aad)
const encrypted = Buffer.concat([cipher.update(secret), cipher.final()])
const envelope = Buffer.concat([Buffer.from([2]), nonce, cipher.getAuthTag(), encrypted])
const jar: Record<string, string> = {}
let failedStage = 'HTTP-PG-setup'
let ciphertextTransport: { bytes: number; lineLengths: number[] } | undefined
let lastStatus = 0
const queryFailures: { operation: string; sqlstate: string }[] = []
const safe = (name: string) => { checks.push({ name, status: 'PASS' }) }
function saveCookies(response: Response) {
  for (const c of response.headers.getSetCookie()) {
    const [name, value] = c.split(';')[0].split('=')
    if (value) jar[name] = value; else delete jar[name]
  }
}
try {
  const passwordHash = await hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })
  await admin.query('UPDATE identity_private.credentials SET argon2id_hash=$1 WHERE principal_id=$2', [passwordHash, input.principal])
  await admin.query("UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id=$1 AND user_id=$2", [input.tenant, input.user])
  await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,method_version,algorithm) VALUES($1,$2,$3,'TOTP','ACTIVE',$4,'pg05-ephemeral',now(),1,'SHA256')", [input.tenant, method, input.user, envelope])
  const transportResult = await admin.query("SELECT encode(secret_ciphertext,'base64') AS encoded FROM app.mfa_methods WHERE tenant_id=$1 AND id=$2", [input.tenant, method])
  const encoded: string = transportResult.rows[0].encoded
  assert.ok(encoded.includes('\n')); assert.equal(Buffer.from(encoded, 'base64').length, envelope.length)
  ciphertextTransport = { bytes: envelope.length, lineLengths: encoded.split('\n').map(line => line.length) }
  safe('HTTP-real-PG-base64-native-transport')
  const privatePool = { async connect() {
    const client = await identity.connect()
    return { async query(sql: string, values?: unknown[]) {
      try { return await client.query(sql, values) }
      catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN'
        queryFailures.push({ operation: /(?:auth_api|identity_private)\.[a-z_]+/.exec(sql)?.[0] ?? 'transaction', sqlstate: /^[0-9A-Z]{5}$/.test(code) ? code : 'TRANSPORT' })
        throw error
      }
    }, release(discard?: boolean) { client.release(discard) } }
  } }
  const backend = createApprovedPrivateBackend(privatePool, {
    factors: { dummyPasswordHash: passwordHash, auditKey: randomBytes(32), otpKey: randomBytes(32), recoveryKey: randomBytes(32),
      async decryptTotp(bytes, version, record) {
        assert.equal(version, 'pg05-ephemeral'); assert.equal(record.binding.tenantId, input.tenant)
        assert.equal(record.binding.userId, input.user); assert.equal(record.binding.methodId, method)
        assert.equal(record.version, '1'); assert.equal(record.algorithm, 'SHA256'); assert.equal(bytes[0], 2)
        const decrypt = createDecipheriv('aes-256-gcm', key, bytes.subarray(1, 13)); decrypt.setAAD(aad); decrypt.setAuthTag(bytes.subarray(13, 29))
        return Buffer.concat([decrypt.update(bytes.subarray(29)), decrypt.final()])
      } },
    cursorKey: randomBytes(32), transport: () => ({ network: Buffer.alloc(32, 1), device: Buffer.alloc(32, 2) }),
    normalizeEmail: email => email.trim().toLowerCase(), maxEligibleTotpMethods: 4,
    sessionLabels: () => ({ device: 'Synthetic PG05', browser: 'Synthetic PG05' }),
  })
  const handler = createAuthHandler(backend, origin)
  const bootstrap = token(), csrf = token()
  await backend.bootstrap(digest(bootstrap), digest(csrf), Date.now() + numeric('preauth_ttl') * 1000 - 1000)
  jar[names.preauth] = bootstrap; jar[names.csrf] = csrf
  async function request(path: string, operation: string, body?: unknown) {
    const response = await handler.handle(new Request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), origin, 'sec-fetch-site': 'same-origin',
      'x-csrf-token': jar[names.csrf], 'content-type': 'application/json', 'idempotency-key': randomUUID(),
    }, body: body === undefined ? undefined : JSON.stringify(body) }), operation)
    lastStatus = response.status
    const data = await response.json(); saveCookies(response)
    return { response, data }
  }
  failedStage = 'HTTP-real-PG-password-login'
  const login = await request('/auth/login', 'login', { email: 'u2@fixture.invalid', password })
  assert.equal(login.response.status, 200)
  assert.equal(login.data.data.state, 'PENDING_MFA')
  assert.ok(login.data.data.challenge_id)
  safe('HTTP-real-PG-password-login')
  failedStage = 'HTTP-real-PG-TOTP-session-commit'
  const proof = TOTP.generate({ secret: new Secret({ buffer: Uint8Array.from(secret).buffer }), algorithm: 'SHA256', period: numeric('totp_period'), digits: numeric('totp_digits') })
  const verified = await request('/auth/mfa/verify', 'verifyMfa', { challenge_id: login.data.data.challenge_id, method: 'TOTP', proof })
  assert.equal(verified.response.status, 200); assert.equal(verified.data.data.state, 'ACTIVE')
  assert.equal(verified.data.data.tenant_id, input.tenant); assert.ok(jar[names.session])
  safe('HTTP-real-PG-TOTP-session-commit')
  failedStage = 'HTTP-real-PG-identity'
  const me = await request('/auth/me', 'getCurrentIdentity')
  assert.equal(me.response.status, 200); assert.equal(me.data.data.id, input.user); assert.equal(me.data.data.tenant_id, input.tenant)
  safe('HTTP-real-PG-identity')
  failedStage = 'HTTP-real-PG-persisted-session-counter'
  const persisted = await admin.query("SELECT s.state,m.last_totp_counter FROM app.sessions s JOIN app.mfa_methods m ON m.tenant_id=s.tenant_id AND m.user_id=s.user_id WHERE s.id=$1 AND m.id=$2", [verified.data.data.session_id, method])
  assert.equal(persisted.rows[0]?.state, 'ACTIVE'); assert.notEqual(persisted.rows[0]?.last_totp_counter, null)
  safe('HTTP-real-PG-persisted-session-counter')
} catch {
  checks.push({ name: failedStage, status: 'FAIL', detail: 'HTTP status='+lastStatus+'; broker errors='+JSON.stringify(queryFailures)+'; no sensitive request/response logged' })
} finally {
  key.fill(0); secret.fill(0)
  await identity.end(); await admin.end()
}
process.stdout.write(JSON.stringify({ scope: 'TEST_ONLY_HTTP_PRIVATE_BACKEND_ARGON2ID_TOTP_PG16', productionRuntime: 'closedBackend', browserUI: 'NOT_EXECUTED', ciphertextTransport, checks }))
process.exitCode = checks.some(c => c.status === 'FAIL') ? 1 : 0
