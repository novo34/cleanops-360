import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { hash, argon2id } from 'argon2'
import { TOTP, Secret, URI } from 'otpauth'
import { createApprovedPrivateBackend } from '../../lib/b1/approved-backend.ts'
import { createAuthHandler, digest, names, token } from '../../lib/b1/service.ts'
import { numeric, profile } from '../../lib/b1/config.ts'
import { sealEnrollmentSecret, openEnrollmentSecret } from '../../lib/b1/ceremony-preparation.ts'
import { createTotpEnrollmentCustody } from '../../lib/b1/enrollment-custody.ts'

/** Disposable PG16 only (same switch as pg-durable-e2e): the exact SQL14 baseline, synthetic rows and the
 * approved backend with the runtime enrollment custody. Real time: TOTP counters are checked by PostgreSQL. */
const port = Number(process.env.CLEANOPS_B1_TEST_PG_PORT)
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const roles = 'totp_e2e_login, cleanops_recipient_verifier, cleanops_security_log_purger, cleanops_auth_maintenance, cleanops_mail_worker, cleanops_identity_service, cleanops_runtime, cleanops_auth_broker, cleanops_ddl_owner'
type Result = { status: number; code: string | null; data: Record<string, unknown> }

test('PG16 TOTP journey: enrol, confirm, new login asks which authenticator, and both methods sign in',
  { skip: !port, timeout: 240000 }, async () => {
    const config = { host: '127.0.0.1', port, user: 'postgres', connectionTimeoutMillis: 2000 }
    const admin = new Pool({ ...config, database: 'postgres' })
    const database = 'b1_totp_' + randomBytes(8).toString('hex')
    const owner = new Pool({ ...config, database, max: 1 })
    const identity = new Pool({ ...config, user: 'totp_e2e_login', database, max: 2 })
    for (const pool of [admin, owner, identity]) pool.on('error', () => {})
    const key = randomBytes(32), firstSecret = randomBytes(32), version = 'fixture-v1'
    const tenant = id(1), user = id(3), principal = id(5), first = id(21)
    const origin = 'https://totp-e2e.fixture.invalid', email = 'totp-e2e@fixture.invalid', password = 'Synthetic local passphrase!'
    const argon = { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const
    let created = false
    try {
      await admin.query(`CREATE DATABASE ${database}`)
      created = true
      await owner.query(await readFile(new URL('../../docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql', import.meta.url), 'utf8'))
      // What the first-actor commit seeds, and nothing else: no access rule, no trusted-device preference.
      await owner.query(`INSERT INTO identity_private.configuration VALUES(true,true,$1::jsonb,'TOTP-E2E-SYNTHETIC',1)`, [JSON.stringify(profile.values)])
      await owner.query(`INSERT INTO identity_private.principals VALUES($1,$2,'ACTIVE',now())`, [principal, email])
      await owner.query(`INSERT INTO identity_private.credentials VALUES($1,$2,1,now())`, [principal, await hash(password, argon)])
      await owner.query(`INSERT INTO app.organizations VALUES($1,'Synthetic','ACTIVE',NULL,now(),1)`, [tenant])
      await owner.query(`INSERT INTO app.users VALUES($1,$2,$3,'Synthetic user','ACTIVE','SENSITIVE',now())`, [tenant, user, principal])
      await owner.query(`INSERT INTO app.policy_versions VALUES($1,1)`, [tenant])
      await owner.query(`INSERT INTO app.self_service_rules SELECT $1::uuid,'B1-SELF-0'||g,'ALLOW','ACTIVE',now()-interval '1 minute',NULL,'TOTP-E2E-SYNTHETIC' FROM generate_series(1,8) g`, [tenant])
      await owner.query(`INSERT INTO app.mfa_methods(tenant_id,id,user_id,kind,state,secret_ciphertext,key_version,created_at,method_version,algorithm) VALUES($1,$2,$3,'TOTP','ACTIVE',$4,$5,now(),1,'SHA256')`,
        [tenant, first, user, sealEnrollmentSecret(firstSecret, key, version, { tenantId: tenant, userId: user, methodId: first, initialMethodVersion: '1', algorithm: 'SHA256' }), version])
      await owner.query('CREATE ROLE totp_e2e_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT cleanops_identity_service TO totp_e2e_login')

      const versions = [{ keyVersion: version, reference: { tenantId: tenant, purpose: 'totp-aead' as const, keyId: 'fixture-key', version: 1 } }]
      const backend = createApprovedPrivateBackend(identity, {
        factors: { dummyPasswordHash: await hash('Synthetic dummy, never an identity', argon),
          auditKey: randomBytes(32), otpKey: randomBytes(32), recoveryKey: randomBytes(32),
          // Same rule as lib/b1/private-runtime.ts: key by version and tenant, AAD from the locked record.
          async decryptTotp(ciphertext, keyVersion, record) {
            assert.ok(versions.some(x => x.keyVersion === keyVersion && x.reference.tenantId === record.binding.tenantId))
            return openEnrollmentSecret(ciphertext, key, keyVersion, { tenantId: record.binding.tenantId, userId: record.binding.userId,
              methodId: record.binding.methodId, initialMethodVersion: '1', algorithm: record.algorithm })
          } },
        cursorKey: randomBytes(32), transport: () => ({ network: Buffer.alloc(32, 1), device: Buffer.alloc(32, 2) }),
        normalizeEmail: value => value.trim().toLowerCase(), maxEligibleTotpMethods: 4,
        sessionLabels: () => ({ device: 'Synthetic', browser: 'Synthetic' }),
        enrollment: createTotpEnrollmentCustody(versions, (_reference, work) => work(key), origin),
      })
      const handler = createAuthHandler(backend, origin)
      const jar: Record<string, string> = {}
      const bootstrap = async () => {
        for (const name of Object.keys(jar)) delete jar[name]
        const preauth = token(), csrf = token()
        await backend.bootstrap(digest(preauth), digest(csrf), Date.now() + numeric('preauth_ttl') * 1000 - 1000)
        jar[names.preauth] = preauth; jar[names.csrf] = csrf
      }
      const post = async (path: string, operation: string, body?: object): Promise<Result> => {
        const response = await handler.handle(new Request(origin + path, { method: 'POST', headers: {
          cookie: Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; '), origin, 'sec-fetch-site': 'same-origin',
          'x-csrf-token': jar[names.csrf], ...(body ? { 'content-type': 'application/json' } : {}), 'idempotency-key': randomUUID(),
        }, body: body ? JSON.stringify(body) : undefined }), operation)
        for (const cookie of response.headers.getSetCookie()) {
          const [name, value] = cookie.split(';')[0].split('=')
          if (value) jar[name] = value; else delete jar[name]
        }
        const json = await response.json() as { data?: Record<string, unknown>; error?: { code?: string } }
        return { status: response.status, code: json.error?.code ?? null, data: json.data ?? {} }
      }
      // Each method's counter must grow; PostgreSQL accepts the current period and one ahead.
      const period = numeric('totp_period') * 1000, used = new Map<string, number>()
      const firstTotp = new TOTP({ secret: new Secret({ buffer: Uint8Array.from(firstSecret).buffer }), algorithm: 'SHA256', period: numeric('totp_period'), digits: numeric('totp_digits') })
      const proof = async (name: string, totp: TOTP) => {
        const counter = Math.max(Math.floor(Date.now() / period), (used.get(name) ?? 0) + 1)
        while (counter > Math.floor(Date.now() / period) + 1) await new Promise(resolve => setTimeout(resolve, 500))
        used.set(name, counter)
        return totp.generate({ timestamp: counter * period })
      }
      const verify = async (challenge: unknown, name: string, totp: TOTP) =>
        post('/auth/mfa/verify', 'verifyMfa', { challenge_id: String(challenge), method: 'TOTP', proof: await proof(name, totp) })
      const login = () => post('/auth/login', 'login', { email, password })

      // 1. Sign in with the only authenticator: no selection is offered.
      await bootstrap()
      const one = await login()
      assert.equal(one.status, 200); assert.equal(one.data.state, 'PENDING_MFA')
      assert.equal((await verify(one.data.challenge_id, 'first', firstTotp)).data.state, 'ACTIVE')
      // 2. Enrol a second authenticator (step-up B1-SELF-05) through the runtime custody.
      const enrolStep = await post('/auth/step-up', 'startStepUp', { grant_id: 'B1-SELF-05' })
      assert.equal((await verify(enrolStep.data.challenge_id, 'first', firstTotp)).status, 200)
      const enrolled = await post('/mfa/totp/enroll', 'enrollTotp')
      assert.equal(enrolled.status, 200)
      const parsed = URI.parse(String(enrolled.data.provisioning_uri))
      assert.ok(parsed instanceof TOTP); assert.equal(parsed.algorithm, 'SHA256')
      // 3. Confirmation needs its own fresh step-up (B1-SELF-06); before it nothing is activated.
      const early = await post('/mfa/totp/confirm', 'confirmTotp', { enrollment_id: enrolled.data.enrollment_id, proof: parsed.generate() })
      assert.equal(early.status, 403); assert.equal(early.code, 'STEP_UP_REQUIRED')
      const active = () => owner.query(`SELECT id::text FROM app.mfa_methods WHERE user_id=$1 AND state='ACTIVE' ORDER BY created_at`, [user])
      assert.deepEqual((await active()).rows.map(row => row.id), [first])
      const confirmStep = await post('/auth/step-up', 'startStepUp', { grant_id: 'B1-SELF-06' })
      assert.equal((await verify(confirmStep.data.challenge_id, 'first', firstTotp)).status, 200)
      // A rejected first code is 401 AUTH_INVALID, yet the session, the pending enrolment and the
      // B1-SELF-06 authorization all survive: the same enrolment confirms with a valid code.
      const rejected = await post('/mfa/totp/confirm', 'confirmTotp', { enrollment_id: enrolled.data.enrollment_id, proof: firstTotp.generate() })
      assert.equal(rejected.status, 401); assert.equal(rejected.code, 'AUTH_INVALID'); assert.notEqual(jar[names.session], undefined)
      const identity200 = await handler.handle(new Request(origin + '/auth/me', { headers: {
        cookie: Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; '), origin, 'sec-fetch-site': 'same-origin' } }), 'getCurrentIdentity')
      assert.equal(identity200.status, 200)
      assert.deepEqual((await active()).rows.map(row => row.id), [first])
      await owner.query('DELETE FROM identity_private.rate_buckets') // the limiter is not the subject here
      const confirmed = await post('/mfa/totp/confirm', 'confirmTotp', { enrollment_id: enrolled.data.enrollment_id, proof: await proof('second', parsed) })
      assert.equal(confirmed.status, 200); assert.equal((confirmed.data.codes as unknown[]).length, numeric('recovery_count'))
      const second = String(enrolled.data.enrollment_id)
      assert.deepEqual((await active()).rows.map(row => row.id), [first, second])
      assert.equal((await post('/auth/logout', 'logout')).status, 200)

      // 4. A new login must ask which authenticator; the new one signs in, and so does the old one.
      const choose = async (method: string) => {
        await owner.query('DELETE FROM identity_private.rate_buckets') // the journey itself is the subject, not the limiter
        await bootstrap()
        const again = await login()
        assert.equal(again.status, 200); assert.equal(again.data.state, 'TOTP_SELECTION_REQUIRED')
        assert.deepEqual((again.data.methods as { method_id: string }[]).map(m => m.method_id).sort(), [first, second].sort())
        assert.equal(again.data.challenge_id, undefined, 'no challenge is bound before the user chooses')
        const chosen = await post('/auth/mfa/totp/select', 'selectTotpMethod', { totp_method_id: method })
        assert.equal(chosen.status, 200); assert.equal(chosen.data.state, 'PENDING_MFA')
        return chosen.data.challenge_id
      }
      const journeys: readonly (readonly [string, string, TOTP])[] = [['second', second, parsed], ['first', first, firstTotp]]
      for (const [name, method, totp] of journeys) {
        const signed = await verify(await choose(method), name, totp)
        assert.equal(signed.status, 200); assert.equal(signed.data.state, 'ACTIVE')
        assert.equal((await post('/auth/logout', 'logout')).status, 200)
      }
      // Last, because a failed attempt leaves an issued challenge inside the resend cooldown:
      // the old authenticator's code never satisfies a challenge bound to the new method.
      const wrong = await post('/auth/mfa/verify', 'verifyMfa', { challenge_id: String(await choose(second)), method: 'TOTP', proof: firstTotp.generate() })
      assert.ok([401, 422].includes(wrong.status)); assert.notEqual(wrong.data.state, 'ACTIVE'); assert.equal(jar[names.session], undefined)
    } finally {
      key.fill(0); firstSecret.fill(0)
      await Promise.allSettled([owner.end(), identity.end()])
      try {
        if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`)
        await admin.query(`DROP ROLE IF EXISTS ${roles}`)
      } finally { await admin.end() }
    }
  })
