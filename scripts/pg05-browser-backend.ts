/** Isolated test composition only. Never imported by routes/runtime. */
import { Pool } from 'pg'
import { hash, argon2id } from 'argon2'
import { randomBytes, randomUUID, createHmac } from 'node:crypto'
import assert from 'node:assert/strict'
import { TOTP, Secret } from 'otpauth'
import { createApprovedPrivateBackend } from '../lib/b1/approved-backend.ts'
import { createAuthHandler } from '../lib/b1/service.ts'
import { canonical } from '../lib/b1/contracts.ts'
import { numeric } from '../lib/b1/config.ts'
import { sealEnrollmentSecret, openEnrollmentSecret } from '../lib/b1/ceremony-preparation.ts'

import { createInterface } from 'node:readline'
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
const iterator = lines[Symbol.asyncIterator]()
const first = await iterator.next()
const input = JSON.parse(first.value!)
if(input.scenario==='multiple'){input.principal=randomUUID();input.user=randomUUID()}
const admin = new Pool({ host: '/var/run/postgresql', database: 'core', user: 'postgres', max: 1, connectionTimeoutMillis: 5000, statement_timeout: 8000, query_timeout: 10000 })
const identity = new Pool({ host: '/var/run/postgresql', database: 'core', user: input.identityRole, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 8000, query_timeout: 10000 })
const origin = 'https://127.0.0.1:3000'
const password = 'PG05 synthetic passphrase!'
const recoveryKey = randomBytes(32)
const key = randomBytes(32), secret = randomBytes(32), method = randomUUID()
const enrollmentContext = { tenantId: input.tenant, userId: input.user, methodId: method, initialMethodVersion: '1' as const, algorithm: 'SHA256' as const }
const envelope = sealEnrollmentSecret(secret, key, 'pg05-ephemeral', enrollmentContext)
const queryFailures: { operation: string; sqlstate: string }[] = []
try {
  const passwordHash = await hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })
  if(input.scenario==='multiple') {
    await admin.query("INSERT INTO identity_private.principals VALUES($1,'multi@fixture.invalid','ACTIVE',now())",[input.principal])
    await admin.query('INSERT INTO identity_private.credentials VALUES($1,$2,1,now())',[input.principal,passwordHash])
    await admin.query("INSERT INTO app.users VALUES($1,$2,$3,'Synthetic multi','ACTIVE','SENSITIVE',now())",[input.tenant,input.user,input.principal])
  }
  await admin.query('UPDATE identity_private.credentials SET argon2id_hash=$1 WHERE principal_id=$2', [passwordHash, input.principal])
  await admin.query("UPDATE app.mfa_methods SET state='REVOKED' WHERE tenant_id=$1 AND user_id=$2", [input.tenant, input.user])
  if (input.scenario !== 'enrollment') await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,method_version,algorithm) VALUES($1,$2,$3,'TOTP','ACTIVE',$4,'pg05-ephemeral',now(),1,'SHA256')", [input.tenant, method, input.user, envelope])
  if(input.scenario==='multiple') {
    const extraId=randomUUID(),extraSecret=randomBytes(32)
    try {
      const extraCipher=sealEnrollmentSecret(extraSecret,key,'pg05-ephemeral',{...enrollmentContext,methodId:extraId})
      await admin.query("INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,method_version,algorithm) VALUES($1,$2,$3,'TOTP','ACTIVE',$4,'pg05-ephemeral',now(),1,'SHA256')",[input.tenant,extraId,input.user,extraCipher])
    } finally {extraSecret.fill(0)}
  }
  await admin.query('UPDATE app.recovery_codes SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',[input.tenant,input.user])
  if(input.scenario==='additional') {
    const batch=randomUUID()
    for(let i=0;i<numeric('recovery_count');i++) {
      const code=new Secret({size:numeric('recovery_entropy')})
      const mac=createHmac('sha256',recoveryKey).update(canonical(['RECOVERY',input.tenant,input.user,code.base32])).digest()
      try { await admin.query('INSERT INTO app.recovery_codes VALUES($1,$2,$3,$4,$5,now(),NULL,NULL)',[input.tenant,randomUUID(),input.user,batch,mac]) }
      finally {code.bytes.fill(0);mac.fill(0)}
    }
  }
  // Synthetic rows exercise the existing approved page_default, not a new UI default.
  await admin.query(`INSERT INTO app.sessions
    SELECT tenant_id,gen_random_uuid(),user_id,principal_id,
      crypto.digest(gen_random_uuid()::text,'sha256'),csrf_digest,state,
      created_at-g*interval '1 millisecond',last_activity_at,absolute_expires_at,idle_expires_at,
      idle_seconds,revoked_at,mfa_verified_at,credential_version,device_label,browser_label
    FROM (SELECT * FROM app.sessions WHERE tenant_id=$1 AND user_id=$2 LIMIT 1) s
    CROSS JOIN generate_series(1,$3::int) g`,[input.tenant,input.user,numeric('page_default')])
  const transportResult = await admin.query("SELECT encode(secret_ciphertext,'base64') AS encoded FROM app.mfa_methods WHERE tenant_id=$1 AND id=$2", [input.tenant, method])
  if (input.scenario !== 'enrollment') {
    const encoded: string = transportResult.rows[0].encoded
    assert.ok(encoded.includes('\n')); assert.equal(Buffer.from(encoded, 'base64').length, envelope.length)
  }
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
    factors: { dummyPasswordHash: await hash('PG05 synthetic dummy never an identity', { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }), auditKey: randomBytes(32), otpKey: randomBytes(32), recoveryKey,
      async decryptTotp(bytes, version, record) {
        assert.equal(version, 'pg05-ephemeral'); assert.equal(record.binding.tenantId, input.tenant)
        assert.equal(record.binding.userId, input.user);
         assert.equal(record.algorithm, 'SHA256'); assert.equal(bytes[0], 2)
        return openEnrollmentSecret(bytes, key, version, { ...enrollmentContext, methodId: record.binding.methodId })
      } },
    enrollment: {
      async withWriteKey(tenantId, work) { assert.equal(tenantId, input.tenant); const borrowed = Buffer.from(key); try { return work(borrowed, 'pg05-ephemeral') } finally { borrowed.fill(0) } },
      async accountAlias() { return 'synthetic-enrollment-alias' },
    },
    cursorKey: randomBytes(32), transport: () => ({ network: Buffer.alloc(32, 1), device: Buffer.alloc(32, input.scenario==='multiple'?3:2) }),
    normalizeEmail: email => email.trim().toLowerCase(), maxEligibleTotpMethods: 4,
    sessionLabels: () => ({ device: 'Synthetic PG05', browser: 'Synthetic PG05' }),
  })
  const handler = createAuthHandler(backend, origin)
  const reply = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n')
  reply({ ready: true })
  for (;;) {
    const line = await iterator.next()
    if (line.done) break
    const message = JSON.parse(line.value)
    try {
      if(message.kind==='primaryMethod'){reply({id:method});continue}
      if (message.kind === 'proof') {
        const proof = TOTP.generate({ secret: new Secret({ buffer: Uint8Array.from(secret).buffer }), algorithm: 'SHA256', period: numeric('totp_period'), digits: numeric('totp_digits'), timestamp: Date.now() + (message.next ? numeric('totp_period') * 1000 : 0) })
        reply({ proof }); continue
      }
      if (message.kind === 'inspectEnrollment') {
        const methods = await admin.query('SELECT state,algorithm,octet_length(secret_ciphertext) AS bytes,last_totp_counter,method_version FROM app.mfa_methods WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC',[input.tenant,input.user])
        const codes = await admin.query('SELECT count(*) FILTER(WHERE revoked_at IS NULL)::int AS count,count(*) FILTER(WHERE revoked_at IS NOT NULL)::int AS revoked,bool_and(octet_length(digest)=32) AS hmac_only FROM app.recovery_codes WHERE tenant_id=$1 AND user_id=$2',[input.tenant,input.user])
        reply({ methods: methods.rows, recoveryCount: codes.rows[0].count, recoveryHmacOnly: codes.rows[0].hmac_only, revokedRecoveryCount: codes.rows[0].revoked }); continue
      }
      if (message.kind === 'inspect') {
        const rows = await admin.query("SELECT s.state,m.last_totp_counter FROM app.sessions s JOIN app.mfa_methods m ON m.tenant_id=s.tenant_id AND m.user_id=s.user_id WHERE s.tenant_id=$1 AND s.user_id=$2 AND m.id=$3 ORDER BY s.created_at DESC", [input.tenant,input.user,method])
        reply({ expectedSessions: numeric('page_default') + 2, states: rows.rows.map(r => r.state), counterConsumed: rows.rows.some(r => r.last_totp_counter !== null) }); continue
      }
      if (message.kind === 'bootstrap') {
        const result = await handler.bootstrap()
        reply(result instanceof Response ? { status: result.status } : { status: 200, cookies: result.headers.getSetCookie() }); continue
      }
      const response = await handler.handle(new Request(origin + message.path, { method: message.method, headers: message.headers, body: message.body || undefined }), message.operation)
      reply({ status: response.status, headers: [...response.headers].filter(([k]) => k !== 'set-cookie'), cookies: response.headers.getSetCookie(), body: await response.text() })
    } catch { reply({ status: 503, transportFailure: true }) }
  }
} finally {
  key.fill(0); secret.fill(0); recoveryKey.fill(0)
  await identity.end(); await admin.end()
}
