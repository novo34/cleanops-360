import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { dispatchPrivateOperator } from '../../scripts/b1-private-operator.mjs'
import { Pool } from 'pg'
import { createPgIngressRepositories, createPgIngressOperator, createPgIngressMaintenance } from '../../lib/b1/pg-ingress-repositories.ts'
import type { IdentityPool } from '../../lib/b1/pg-identity-driver.ts'

// Explicit disposable local PG16 fixture only; never read DATABASE_URL/private inputs.
// Caller owns a fresh test container and destroys it after this test. No installed DB.
const port = Number(process.env.CLEANOPS_B1_TEST_PG_PORT)
test('PG16 ingress repositories: atomicity, retention, credentials, ACL and uncertain commit',
  { skip: !port }, async t => {
    assert.ok(Number.isInteger(port) && port > 0 && port <= 65535)
    const adminUser = process.env.CLEANOPS_B1_TEST_PG_USER || 'postgres'
    const password = process.env.CLEANOPS_B1_TEST_PG_PASSWORD
    const config = { host: '127.0.0.1', port, user: adminUser, ...(password ? { password } : {}), connectionTimeoutMillis: 2000 }
    const bootstrap = new Pool({ ...config, database: 'postgres' })
    const database = 'b1_ingress_' + randomBytes(8).toString('hex')
    await bootstrap.query(`CREATE DATABASE ${database}`)
    const owner = new Pool({ ...config, database })
    const pools: Pool[] = [owner]
    try {
      const version = await owner.query('SHOW server_version_num')
      assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 16)
      await owner.query('CREATE ROLE cleanops_ddl_owner NOLOGIN; CREATE ROLE cleanops_auth_broker NOLOGIN; CREATE ROLE cleanops_auth_maintenance NOLOGIN; CREATE ROLE cleanops_identity_service NOLOGIN; CREATE ROLE cleanops_runtime NOLOGIN; CREATE ROLE ingress_test_login LOGIN IN ROLE cleanops_identity_service; CREATE ROLE ingress_maint_login LOGIN IN ROLE cleanops_auth_maintenance; CREATE SCHEMA identity_private AUTHORIZATION cleanops_ddl_owner; CREATE SCHEMA auth_api AUTHORIZATION cleanops_ddl_owner; REVOKE ALL ON SCHEMA identity_private,auth_api FROM PUBLIC; GRANT USAGE ON SCHEMA auth_api TO cleanops_identity_service,cleanops_auth_maintenance; GRANT USAGE ON SCHEMA identity_private TO cleanops_auth_broker; GRANT USAGE,CREATE ON SCHEMA auth_api TO cleanops_auth_broker')
      // Passwords are CI-fixture-only; never source an operator or runtime
      // credential from a real installation. The fresh PG16 service has SCRAM on.
      if (password) {
        if (password !== 'cleanops_dev_only') throw new Error('B1_CI_FIXTURE_ONLY')
        await owner.query("ALTER ROLE ingress_test_login PASSWORD 'cleanops_dev_only'; ALTER ROLE ingress_maint_login PASSWORD 'cleanops_dev_only'")
      }
      // Compilation/execution in a disposable fixture, never a migration installation.
      await owner.query(await readFile(new URL('../../db/migrations/0003_ingress_persistence.review.sql', import.meta.url), 'utf8'))
      // The owner creates dedicated operator logins out of band; the migration only creates the NOLOGIN role.
      await owner.query('CREATE ROLE ingress_operator_login LOGIN IN ROLE cleanops_ingress_operator; CREATE ROLE ingress_mixed_login LOGIN IN ROLE cleanops_ingress_operator, cleanops_identity_service')
      if (password) {
        await owner.query("ALTER ROLE ingress_operator_login PASSWORD 'cleanops_dev_only'; ALTER ROLE ingress_mixed_login PASSWORD 'cleanops_dev_only'")
      }
      const p = new Pool({ ...config, user: 'ingress_test_login', database, max: 8 })
      const q = new Pool({ ...config, user: 'ingress_test_login', database, max: 8 })
      const maint = new Pool({ ...config, user: 'ingress_maint_login', database, max: 4 })
      pools.push(p, q, maint)
      const a = createPgIngressRepositories(p), b = createPgIngressRepositories(q)
      const scope = { issuer: 'fixture', audience: 'https://fixture.invalid' }
      const fresh = () => randomBytes(32).toString('base64url')
      await t.test('proposal grants only claim/read; direct tables and operator writes remain inaccessible', async () => {
        const claimed = { ...scope, nonce: fresh(), expiresAt: Date.now() + 20000 }
        assert.equal(await a.replay.claim(claimed), 'claimed')
        assert.equal(await b.replay.claim(claimed), 'duplicate')
        await assert.rejects(p.query('SELECT * FROM identity_private.ingress_claims'))
        await assert.rejects(p.query("SELECT auth_api.ingress_revoke($1,$2,$3,1,'x')", [scope.issuer, scope.audience, fresh()]))
      })
      await t.test('two pools and 32 concurrent claims have exactly one winner; restart preserves claim', async () => {
        const input = { ...scope, nonce: fresh(), expiresAt: Date.now() + 20000 }
        const claims = await Promise.all(Array.from({ length: 32 }, (_, i) => (i % 2 ? a : b).replay.claim(input)))
        assert.equal(claims.filter(x => x === 'claimed').length, 1)
        assert.equal(claims.filter(x => x === 'duplicate').length, 31)
        assert.equal(await createPgIngressRepositories(q).replay.claim(input), 'duplicate')
        await assert.rejects(p.query('SELECT * FROM identity_private.ingress_claims'))
      })
      await t.test('expired input fails; duplicate cannot extend retention or evict a claim', async () => {
        const input = { ...scope, nonce: fresh(), expiresAt: Date.now() + 20000 }
        assert.equal(await a.replay.claim(input), 'claimed')
        assert.equal(await b.replay.claim({ ...input, expiresAt: input.expiresAt + 1000 }), 'duplicate')
        const row = await owner.query('SELECT expires_at::text FROM identity_private.ingress_claims WHERE nonce=$1', [input.nonce])
        assert.equal(Number(row.rows[0].expires_at), input.expiresAt)
        await assert.rejects(a.replay.claim({ ...input, nonce: fresh(), expiresAt: Date.now() - 1 }))
      })
      await t.test('committed claim with lost acknowledgement rejects; next consumer sees duplicate', async () => {
        const input = { ...scope, nonce: fresh(), expiresAt: Date.now() + 20000 }
        const uncertain: IdentityPool = { async connect() {
          const client = await p.connect()
          return { async query(sql, values) {
            const result = await client.query(sql, values)
            if (sql === 'COMMIT') throw Error('simulated lost commit acknowledgement')
            return result
          }, release(discard) { client.release(discard) } }
        } }
        await assert.rejects(createPgIngressRepositories(uncertain).replay.claim(input))
        assert.equal(await b.replay.claim(input), 'duplicate')
      })
      const device = { ...scope, id: fresh() }
      const issued = Date.now(), expires = issued + 60000
      await t.test('enrollment is owner-only; runtime enrollment/revocation/recovery remain blocked', async () => {
        await assert.rejects(p.query('SELECT auth_api.ingress_enroll($1,$2,$3,$4,$5,$6,$7)', [scope.issuer, scope.audience, device.id, issued, expires, 'test-reference', 'auth-ref']))
        await owner.query('SELECT auth_api.ingress_enroll($1,$2,$3,$4,$5,$6,$7)', [scope.issuer, scope.audience, device.id, issued, expires, 'test-reference', 'auth-ref'])
        const record = await a.credentials.read(device)
        assert.equal(record?.state, 'active')
        assert.equal(record?.expiresAt, expires)
        await assert.rejects(a.credentials.enroll({ record: record!, authorizationReference: 'not-authority' }))
        await assert.rejects(a.credentials.revoke({ scope: device, expectedRevision: '1', authorizationReference: 'not-authority' }))
        await assert.rejects(a.credentials.recover({ previous: device, expectedRevision: '1', replacement: record!, authorizationReference: 'not-authority' }))
      })
      await t.test('concurrent individual revocation wins once; independent reader sees durable terminal state', async () => {
        const results = await Promise.allSettled([1, 2].map(() => owner.query("SELECT auth_api.ingress_revoke($1,$2,$3,1,'auth-ref')", [scope.issuer, scope.audience, device.id])))
        assert.equal(results.filter(x => x.status === 'fulfilled').length, 1)
        assert.equal((await b.credentials.read(device))?.state, 'revoked')
        assert.equal((await b.credentials.read(device))?.revision, '2')
      })
      await t.test('failed replacement is atomic and cannot revoke the prior profile', async () => {
        const previous = fresh()
        await owner.query('SELECT auth_api.ingress_enroll($1,$2,$3,$4,$5,$6,$7)', [scope.issuer, scope.audience, previous, issued, expires, 'test-reference', 'auth-ref'])
        await assert.rejects(owner.query('SELECT auth_api.ingress_recover($1,$2,$3,1,$4,$5,$6,$7,$8)', [scope.issuer, scope.audience, previous, device.id, issued, expires, 'test-reference', 'auth-ref']))
        assert.equal((await a.credentials.read({ ...scope, id: previous }))?.state, 'active')
      })
      await t.test('S-2: every ingress function is owned by the broker, runs as definer and is not executable by PUBLIC', async () => {
        const rows = await owner.query(`SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig::text AS cfg,
          has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
          has_function_privilege('cleanops_identity_service', p.oid, 'EXECUTE') AS runtime_exec,
          has_function_privilege('cleanops_auth_maintenance', p.oid, 'EXECUTE') AS maint_exec,
          has_function_privilege('cleanops_ingress_operator', p.oid, 'EXECUTE') AS operator_exec
          FROM pg_proc p WHERE p.pronamespace='auth_api'::regnamespace AND p.proname LIKE 'ingress\\_%' ORDER BY 1`)
        assert.deepEqual(rows.rows.map(r => r.proname), ['ingress_claim', 'ingress_credential_read', 'ingress_enroll', 'ingress_gc', 'ingress_recover', 'ingress_revoke'])
        for (const r of rows.rows) {
          assert.equal(r.owner, 'cleanops_auth_broker'); assert.equal(r.prosecdef, true)
          assert.match(r.cfg, /search_path=pg_catalog/); assert.equal(r.public_exec, false)
          assert.equal(r.runtime_exec, ['ingress_claim', 'ingress_credential_read'].includes(r.proname))
          assert.equal(r.maint_exec, r.proname === 'ingress_gc')
          assert.equal(r.operator_exec, ['ingress_enroll', 'ingress_recover', 'ingress_revoke'].includes(r.proname))
        }
        const tables = await owner.query(`SELECT c.relname, pg_get_userbyid(c.relowner) AS owner,
          has_table_privilege('cleanops_identity_service', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS runtime_any,
          has_table_privilege('cleanops_auth_maintenance', c.oid, 'SELECT') AS maint_select
          FROM pg_class c WHERE c.relnamespace='identity_private'::regnamespace AND c.relname LIKE 'ingress\\_%'`)
        for (const r of tables.rows) { assert.equal(r.owner, 'cleanops_ddl_owner'); assert.equal(r.runtime_any, false); assert.equal(r.maint_select, false) }
      })
      await t.test('S-1: gc is maintenance-only; runtime and PUBLIC logins are denied', async () => {
        await assert.rejects(p.query('SELECT auth_api.ingress_gc(10)'), /permission denied/)
        await assert.rejects(maint.query('SELECT auth_api.ingress_claim($1,$2,$3,$4)', [scope.issuer, scope.audience, fresh(), Date.now() + 5000]), /permission denied/)
        await assert.rejects(maint.query("SELECT auth_api.ingress_enroll($1,$2,$3,1,2,$4,'x')", [scope.issuer, scope.audience, fresh(), 'x']), /permission denied/)
        await assert.rejects(maint.query('SELECT * FROM identity_private.ingress_claims'), /permission denied/)
      })
      await t.test('S-1: gc is bounded by batch, validates its limit, keeps live and recently expired claims', async () => {
        const gcScope = { issuer: 'gc-' + fresh().slice(0, 8), audience: 'https://gc.invalid' }
        const now = Date.now()
        await owner.query(`INSERT INTO identity_private.ingress_claims SELECT $1,$2,'e'||lpad(g::text,42,'0'),$3 FROM generate_series(1,25) g`, [gcScope.issuer, gcScope.audience, now - 120000])
        await owner.query(`INSERT INTO identity_private.ingress_claims VALUES($1,$2,'margin'||lpad('1',37,'0'),$3),($1,$2,'live'||lpad('1',39,'0'),$4)`, [gcScope.issuer, gcScope.audience, now - 30000, now + 20000])
        const count = async () => Number((await owner.query('SELECT count(*)::int AS n FROM identity_private.ingress_claims WHERE issuer=$1', [gcScope.issuer])).rows[0].n)
        for (const bad of [0, -1, 10001, null]) await assert.rejects(maint.query('SELECT auth_api.ingress_gc($1)', [bad]), /INGRESS_DENIED/)
        assert.equal(await count(), 27)
        assert.equal(Number((await maint.query('SELECT auth_api.ingress_gc(10) AS n')).rows[0].n), 10)
        assert.equal(await count(), 17)
        assert.equal(Number((await maint.query('SELECT auth_api.ingress_gc(10000) AS n')).rows[0].n) >= 15, true)
        assert.equal(await count(), 2)
        assert.equal(Number((await maint.query('SELECT auth_api.ingress_gc(10000) AS n')).rows[0].n), 0)
        assert.equal(await count(), 2)
      })
      await t.test('S-1: a purged claim cannot be replayed; gc racing 32 claims never loses a live claim or blocks', async () => {
        const stale = fresh()
        await owner.query('INSERT INTO identity_private.ingress_claims VALUES($1,$2,$3,$4)', [scope.issuer, scope.audience, stale, Date.now() - 120000])
        await maint.query('SELECT auth_api.ingress_gc(10000)')
        await assert.rejects(a.replay.claim({ ...scope, nonce: stale, expiresAt: Date.now() - 120000 }))
        const input = { ...scope, nonce: fresh(), expiresAt: Date.now() + 20000 }
        const work = [
          ...Array.from({ length: 32 }, (_, i) => (i % 2 ? a : b).replay.claim(input)),
          ...Array.from({ length: 8 }, () => maint.query('SELECT auth_api.ingress_gc(10000)')),
        ]
        const settled = await Promise.all(work)
        assert.equal(settled.slice(0, 32).filter(x => x === 'claimed').length, 1)
        assert.equal(await a.replay.claim(input), 'duplicate')
      })
      await t.test('D1: operator channel is a separate least-privilege pool; every write is audited with session_user', async () => {
        const op = new Pool({ ...config, user: 'ingress_operator_login', database, max: 4 })
        const mixed = new Pool({ ...config, user: 'ingress_mixed_login', database, max: 2 })
        pools.push(op, mixed)
        assert.throws(() => createPgIngressOperator(p, p))
        assert.throws(() => createPgIngressOperator(op, op))
        const operator = createPgIngressOperator(op, p)
        const id = fresh(), id2 = fresh(), now = Date.now()
        const rec = (cid: string) => ({ ...scope, id: cid, issuedAt: now, expiresAt: now + 60000, revision: '1', state: 'active' as const, enrollmentReference: 'enrol-ref' })
        await operator.enroll({ record: rec(id), authorizationReference: 'AUTH-ENROLL-1' })
        assert.equal((await a.credentials.read({ ...scope, id }))?.state, 'active')
        await assert.rejects(operator.enroll({ record: rec(id), authorizationReference: 'AUTH-DUP' }))
        await assert.rejects(operator.revoke({ scope: { ...scope, id }, expectedRevision: '7', authorizationReference: 'AUTH-STALE' }))
        // Atomic recovery: replacement collision rolls back the revocation and its audit row.
        await assert.rejects(operator.recover({ previous: { ...scope, id }, expectedRevision: '1', replacement: rec(id2), authorizationReference: 'AUTH-RECOVER-0' }).then(() =>
          operator.recover({ previous: { ...scope, id: id2 }, expectedRevision: '1', replacement: rec(id), authorizationReference: 'AUTH-RECOVER-BAD' })))
        assert.equal((await a.credentials.read({ ...scope, id: id2 }))?.state, 'active')
        const id3 = fresh()
        await operator.revoke({ scope: { ...scope, id: id2 }, expectedRevision: '1', authorizationReference: 'AUTH-REVOKE-1' })
        assert.equal((await b.credentials.read({ ...scope, id: id2 }))?.state, 'revoked')
        await operator.enroll({ record: rec(id3), authorizationReference: 'AUTH-ENROLL-3' })
        const audit = await owner.query(`SELECT action, operator::text, authorization_reference, credential_id FROM identity_private.ingress_operator_audit WHERE issuer=$1 AND authorization_reference LIKE 'AUTH-%' ORDER BY id`, [scope.issuer])
        const refs = audit.rows.map(r => r.authorization_reference)
        for (const r of audit.rows) assert.equal(r.operator, 'ingress_operator_login')
        assert.ok(refs.includes('AUTH-ENROLL-1') && refs.includes('AUTH-REVOKE-1') && refs.includes('AUTH-RECOVER-0'))
        assert.ok(!refs.includes('AUTH-DUP') && !refs.includes('AUTH-STALE') && !refs.includes('AUTH-RECOVER-BAD'))
        // Least privilege: the operator login can do nothing else, the runtime cannot read the audit.
        for (const sql of ["SELECT auth_api.ingress_claim('x','https://x.invalid','" + fresh() + "',1)", 'SELECT auth_api.ingress_credential_read($1,$1,$1)', 'SELECT auth_api.ingress_gc(1)',
          'SELECT * FROM identity_private.ingress_credentials', 'SELECT * FROM identity_private.ingress_operator_audit', 'DELETE FROM identity_private.ingress_operator_audit'])
          await assert.rejects(op.query(sql, sql.includes('$1') ? ['x'] : []), /permission denied/)
        await assert.rejects(p.query('SELECT * FROM identity_private.ingress_operator_audit'), /permission denied/)
        await assert.rejects(maint.query('SELECT auth_api.ingress_revoke($1,$2,$3,1,$4)', [scope.issuer, scope.audience, id3, 'x']), /permission denied/)
        // A login that also holds a runtime role is refused inside the same transaction (no write, no audit).
        const before = Number((await owner.query('SELECT count(*)::int AS n FROM identity_private.ingress_operator_audit')).rows[0].n)
        await assert.rejects(createPgIngressOperator(mixed, p).enroll({ record: rec(fresh()), authorizationReference: 'AUTH-MIXED' }), /AUTH_CONFIGURATION_REQUIRED|AUTH_DEPENDENCY_UNAVAILABLE/)
        assert.equal(Number((await owner.query('SELECT count(*)::int AS n FROM identity_private.ingress_operator_audit')).rows[0].n), before)
        // Runtime repositories still block every credential write.
        await assert.rejects(a.credentials.revoke({ scope: { ...scope, id: id3 }, expectedRevision: '1', authorizationReference: 'x' }))
        // Execute the SAME dispatch function used by the root-only private CLI
        // against real operator/runtime PG16 roles. The private file loader and
        // actual OpenBao TLS custody remain separate staging acceptance gates.
        const signer = generateKeyPairSync('ed25519').privateKey
        const prepared = { configuration: {}, ingress: { pseudonymKey: randomBytes(32) } }
        const installation = { inputs: { origin: scope.audience }, ingress: {
          issuer: scope.issuer, maximumDeviceLifetimeMs: 60000, contextLifetimeMs: 5000,
          maximumBodyBytes: 1024, timeoutMs: 2000,
        } }
        const runtimeFactory = (_selection: unknown, bind: (dep: ReturnType<typeof createPgIngressRepositories>) => void) => {
          bind(createPgIngressRepositories(p))
          return {
            ingressOperator: (operatorPool: IdentityPool) => createPgIngressOperator(operatorPool, p),
            async close() {},
          }
        }
        try {
          const issued = await dispatchPrivateOperator({
            operation: 'device.issue', device: 'ci-device', browser: 'ci-browser',
            lifetimeMs: 30000, reference: 'CI-ENROL', authorizationReference: 'CI-APPROVED',
          }, installation, prepared, op, signer, runtimeFactory)
          assert.equal(issued.state, 'ENROLLED')
          assert.match(issued.cookieValue, /^b1-device-v1\./)
          assert.match(issued.cookieAttributes, /HttpOnly/)
          const record = await a.credentials.read({ ...scope, id: issued.id })
          assert.equal(record?.state, 'active')
          const revoked = await dispatchPrivateOperator({
            operation: 'device.revoke', id: issued.id, revision: '1',
            authorizationReference: 'CI-REVOKE',
          }, installation, prepared, op, undefined, runtimeFactory)
          assert.deepEqual(revoked, { state: 'REVOKED' })
          assert.equal((await a.credentials.read({ ...scope, id: issued.id }))?.state, 'revoked')
          const audit = await owner.query(
            "SELECT action, operator::text, authorization_reference FROM identity_private.ingress_operator_audit WHERE authorization_reference IN ('CI-APPROVED','CI-REVOKE') ORDER BY id"
          )
          assert.equal(audit.rows.length, 2)
          assert.ok(audit.rows.every(row => row.operator === 'ingress_operator_login'))
        } finally { prepared.ingress.pseudonymKey.fill(0) }
      })
      await t.test('D2: maintenance gc is bounded, non-overlapping, restricted to the maintenance pool and resumable', async () => {
        const gcScope = { issuer: 'gcm-' + fresh().slice(0, 8), audience: 'https://gc.invalid' }
        const seed = (n: number) => owner.query(`INSERT INTO identity_private.ingress_claims SELECT $1,$2,'m'||lpad(g::text,42,'0'),$3 FROM generate_series(1,$4::int) g ON CONFLICT DO NOTHING`, [gcScope.issuer, gcScope.audience, Date.now() - 120000, n])
        const left = async () => Number((await owner.query('SELECT count(*)::int AS n FROM identity_private.ingress_claims WHERE issuer=$1', [gcScope.issuer])).rows[0].n)
        const limits = { batchSize: 10, maxBatches: 2, maxDurationMs: 30000, statementTimeoutMs: 5000, lockTimeoutMs: 1000 }
        assert.throws(() => createPgIngressMaintenance(p, p)); assert.throws(() => createPgIngressMaintenance(maint, maint))
        await assert.rejects(createPgIngressMaintenance(maint, p).gc({ ...limits, batchSize: 10001 }))
        await assert.rejects(createPgIngressMaintenance(maint, p).gc({ ...limits, maxBatches: 0 }))
        await assert.rejects(createPgIngressMaintenance(p, q).gc(limits), /AUTH_DEPENDENCY_UNAVAILABLE/) // runtime login has no EXECUTE
        await seed(35)
        const job = createPgIngressMaintenance(maint, p)
        assert.deepEqual(await job.gc(limits), { purged: 20, batches: 2, complete: false, reason: 'max-batches' })
        assert.equal(await left(), 15)
        // Recovery after an interrupted run is simply running again; overlapping runs skip instead of queueing.
        const holder = await maint.connect()
        try {
          await holder.query("SELECT pg_advisory_lock(hashtextextended('cleanops.ingress_gc',0))")
          assert.deepEqual(await job.gc(limits), { purged: 0, batches: 0, complete: false, reason: 'busy' })
        } finally { await holder.query("SELECT pg_advisory_unlock(hashtextextended('cleanops.ingress_gc',0))"); holder.release() }
        assert.equal((await job.gc({ ...limits, maxBatches: 10 })).reason, 'drained')
        assert.equal(await left(), 0)
        await seed(5)
        let tick = 0
        assert.equal((await job.gc(limits, () => (tick++) * 40000)).reason, 'deadline')
        const racing = await Promise.all([job.gc({ ...limits, maxBatches: 10 }), job.gc({ ...limits, maxBatches: 10 })])
        assert.ok(racing.every(r => r.reason === 'drained' || r.reason === 'busy'))
        assert.equal(await left(), 0)
        await assert.rejects(maint.query('SELECT * FROM identity_private.ingress_operator_audit'), /permission denied/)
      })
      await t.test('S-3: the migration is atomic under the canonical runner transaction (rollback leaves no trace; success is idempotent-safe)', async () => {
        const sql = await readFile(new URL('../../db/migrations/0003_ingress_persistence.review.sql', import.meta.url), 'utf8')
        const probe = 'b1_runner_' + randomBytes(6).toString('hex')
        await bootstrap.query(`CREATE DATABASE ${probe} TEMPLATE template0`)
        const pr = new Pool({ ...config, database: probe })
        try {
          await pr.query('CREATE SCHEMA identity_private AUTHORIZATION cleanops_ddl_owner; CREATE SCHEMA auth_api AUTHORIZATION cleanops_ddl_owner; REVOKE ALL ON SCHEMA identity_private,auth_api FROM PUBLIC; GRANT USAGE ON SCHEMA identity_private TO cleanops_auth_broker; GRANT USAGE,CREATE ON SCHEMA auth_api TO cleanops_auth_broker')
          const c = await pr.connect()
          try {
            await c.query('BEGIN')
            await c.query(sql)
            assert.equal((await c.query('SELECT current_user AS u')).rows[0].u, adminUser) // runner role restored for its journal write
            await c.query('ROLLBACK')
          } finally { c.release() }
          const gone = await pr.query(`SELECT to_regclass('identity_private.ingress_claims') AS t, to_regprocedure('auth_api.ingress_gc(integer)') AS f`)
          assert.equal(gone.rows[0].t, null); assert.equal(gone.rows[0].f, null)
          const c2 = await pr.connect()
          try { await c2.query('BEGIN'); await c2.query(sql); await c2.query('COMMIT') } finally { c2.release() }
          assert.notEqual((await pr.query(`SELECT to_regclass('identity_private.ingress_claims') AS t`)).rows[0].t, null)
        } finally { await pr.end(); await bootstrap.query(`DROP DATABASE ${probe}`) }
      })
      await t.test('connection failure never claims success or falls back locally', async () => {
        const stopped = new Pool({ ...config, user: 'ingress_test_login', database })
        await stopped.end()
        const repositories = createPgIngressRepositories(stopped)
        await assert.rejects(repositories.replay.claim({ ...scope, nonce: fresh(), expiresAt: Date.now() + 10000 }))
        await assert.rejects(repositories.credentials.read(device))
      })
      await t.test('PostgreSQL lock timeout fails closed and rolls back the losing transaction', async () => {
        const locking = await owner.connect()
        const impatient = new Pool({ ...config, user: 'ingress_test_login', database, options: '-c statement_timeout=50' })
        const nonce = fresh(), expiry = Date.now() + 20000
        try {
          await locking.query('BEGIN')
          await locking.query('INSERT INTO identity_private.ingress_claims VALUES($1,$2,$3,$4)', [scope.issuer, scope.audience, nonce, expiry])
          await assert.rejects(createPgIngressRepositories(impatient).replay.claim({ ...scope, nonce, expiresAt: expiry }),
            (e: unknown) => e instanceof Error && e.message === 'AUTH_DEPENDENCY_UNAVAILABLE')
          await locking.query('ROLLBACK')
          assert.equal(await b.replay.claim({ ...scope, nonce, expiresAt: expiry }), 'claimed')
        } finally {
          await locking.query('ROLLBACK')
          locking.release()
          await impatient.end()
        }
      })
    } finally {
      await Promise.all(pools.map(p => p.end()))
      try { await bootstrap.query(`DROP DATABASE ${database}`) }
      finally { await bootstrap.end() }
    }
  })
