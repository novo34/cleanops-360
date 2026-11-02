import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { createPgIngressRepositories } from '../../lib/b1/pg-ingress-repositories.ts'
import type { IdentityPool } from '../../lib/b1/pg-identity-driver.ts'

// Explicit disposable local PG16 fixture only; never read DATABASE_URL/private inputs.
// Caller owns a fresh test container and destroys it after this test. No installed DB.
const port = Number(process.env.CLEANOPS_B1_TEST_PG_PORT)
test('PG16 ingress repositories: atomicity, retention, credentials, ACL and uncertain commit',
  { skip: !port }, async t => {
    assert.ok(Number.isInteger(port) && port > 0 && port <= 65535)
    const config = { host: '127.0.0.1', port, user: 'postgres', connectionTimeoutMillis: 2000 }
    const bootstrap = new Pool({ ...config, database: 'postgres' })
    const database = 'b1_ingress_' + randomBytes(8).toString('hex')
    await bootstrap.query(`CREATE DATABASE ${database}`)
    const owner = new Pool({ ...config, database })
    const pools: Pool[] = [owner]
    try {
      const version = await owner.query('SHOW server_version_num')
      assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 16)
      await owner.query('CREATE ROLE cleanops_ddl_owner NOLOGIN; CREATE ROLE cleanops_auth_broker NOLOGIN; CREATE ROLE cleanops_auth_maintenance NOLOGIN; CREATE ROLE cleanops_identity_service NOLOGIN; CREATE ROLE ingress_test_login LOGIN IN ROLE cleanops_identity_service; CREATE ROLE ingress_maint_login LOGIN IN ROLE cleanops_auth_maintenance; CREATE SCHEMA identity_private AUTHORIZATION cleanops_ddl_owner; CREATE SCHEMA auth_api AUTHORIZATION cleanops_ddl_owner; REVOKE ALL ON SCHEMA identity_private,auth_api FROM PUBLIC; GRANT USAGE ON SCHEMA auth_api TO cleanops_identity_service,cleanops_auth_maintenance; GRANT USAGE ON SCHEMA identity_private TO cleanops_auth_broker; GRANT USAGE,CREATE ON SCHEMA auth_api TO cleanops_auth_broker')
      // Compilation/execution in a disposable fixture, never a migration installation.
      await owner.query(await readFile(new URL('../../db/migrations/0003_ingress_persistence.review.sql', import.meta.url), 'utf8'))
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
        await assert.rejects(p.query('SELECT auth_api.ingress_revoke($1,$2,$3,1)', [scope.issuer, scope.audience, fresh()]))
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
        await assert.rejects(p.query('SELECT auth_api.ingress_enroll($1,$2,$3,$4,$5,$6)', [scope.issuer, scope.audience, device.id, issued, expires, 'test-reference']))
        await owner.query('SELECT auth_api.ingress_enroll($1,$2,$3,$4,$5,$6)', [scope.issuer, scope.audience, device.id, issued, expires, 'test-reference'])
        const record = await a.credentials.read(device)
        assert.equal(record?.state, 'active')
        assert.equal(record?.expiresAt, expires)
        await assert.rejects(a.credentials.enroll({ record: record!, authorizationReference: 'not-authority' }))
        await assert.rejects(a.credentials.revoke({ scope: device, expectedRevision: '1', authorizationReference: 'not-authority' }))
        await assert.rejects(a.credentials.recover({ previous: device, expectedRevision: '1', replacement: record!, authorizationReference: 'not-authority' }))
      })
      await t.test('concurrent individual revocation wins once; independent reader sees durable terminal state', async () => {
        const results = await Promise.allSettled([1, 2].map(() => owner.query('SELECT auth_api.ingress_revoke($1,$2,$3,1)', [scope.issuer, scope.audience, device.id])))
        assert.equal(results.filter(x => x.status === 'fulfilled').length, 1)
        assert.equal((await b.credentials.read(device))?.state, 'revoked')
        assert.equal((await b.credentials.read(device))?.revision, '2')
      })
      await t.test('failed replacement is atomic and cannot revoke the prior profile', async () => {
        const previous = fresh()
        await owner.query('SELECT auth_api.ingress_enroll($1,$2,$3,$4,$5,$6)', [scope.issuer, scope.audience, previous, issued, expires, 'test-reference'])
        await assert.rejects(owner.query('SELECT auth_api.ingress_recover($1,$2,$3,1,$4,$5,$6,$7)', [scope.issuer, scope.audience, previous, device.id, issued, expires, 'test-reference']))
        assert.equal((await a.credentials.read({ ...scope, id: previous }))?.state, 'active')
      })
      await t.test('S-2: every ingress function is owned by the broker, runs as definer and is not executable by PUBLIC', async () => {
        const rows = await owner.query(`SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig::text AS cfg,
          has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
          has_function_privilege('cleanops_identity_service', p.oid, 'EXECUTE') AS runtime_exec,
          has_function_privilege('cleanops_auth_maintenance', p.oid, 'EXECUTE') AS maint_exec
          FROM pg_proc p WHERE p.pronamespace='auth_api'::regnamespace AND p.proname LIKE 'ingress\\_%' ORDER BY 1`)
        assert.deepEqual(rows.rows.map(r => r.proname), ['ingress_claim', 'ingress_credential_read', 'ingress_enroll', 'ingress_gc', 'ingress_recover', 'ingress_revoke'])
        for (const r of rows.rows) {
          assert.equal(r.owner, 'cleanops_auth_broker'); assert.equal(r.prosecdef, true)
          assert.match(r.cfg, /search_path=pg_catalog/); assert.equal(r.public_exec, false)
          assert.equal(r.runtime_exec, ['ingress_claim', 'ingress_credential_read'].includes(r.proname))
          assert.equal(r.maint_exec, r.proname === 'ingress_gc')
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
        await assert.rejects(maint.query('SELECT auth_api.ingress_enroll($1,$2,$3,1,2,$4)', [scope.issuer, scope.audience, fresh(), 'x']), /permission denied/)
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
            assert.equal((await c.query('SELECT current_user AS u')).rows[0].u, 'postgres') // runner role restored for its journal write
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
