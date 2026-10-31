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
    await bootstrap.query('CREATE DATABASE b1_ingress_test')
    await bootstrap.end()
    const owner = new Pool({ ...config, database: 'b1_ingress_test' })
    const pools: Pool[] = [owner]
    try {
      const version = await owner.query('SHOW server_version_num')
      assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 16)
      await owner.query('CREATE ROLE cleanops_ddl_owner NOLOGIN; CREATE ROLE cleanops_identity_service NOLOGIN; CREATE ROLE ingress_test_login LOGIN IN ROLE cleanops_identity_service; CREATE SCHEMA identity_private AUTHORIZATION cleanops_ddl_owner; CREATE SCHEMA auth_api AUTHORIZATION cleanops_ddl_owner; REVOKE ALL ON SCHEMA identity_private,auth_api FROM PUBLIC; GRANT USAGE ON SCHEMA auth_api TO cleanops_identity_service')
      // Compilation/execution in a disposable fixture, never a migration installation.
      await owner.query(await readFile(new URL('../../docs/proposals/b1-ingress-persistence.review.sql', import.meta.url), 'utf8'))
      const p = new Pool({ ...config, user: 'ingress_test_login', database: 'b1_ingress_test', max: 8 })
      const q = new Pool({ ...config, user: 'ingress_test_login', database: 'b1_ingress_test', max: 8 })
      pools.push(p, q)
      const a = createPgIngressRepositories(p), b = createPgIngressRepositories(q)
      const scope = { issuer: 'fixture', audience: 'https://fixture.invalid' }
      const fresh = () => randomBytes(32).toString('base64url')
      await t.test('proposed functions deny runtime until an explicit reviewed grant', async () => {
        await assert.rejects(a.replay.claim({ ...scope, nonce: fresh(), expiresAt: Date.now() + 20000 }))
      })
      // Test-only permission, deliberately absent from the proposed migration.
      await owner.query('GRANT EXECUTE ON FUNCTION auth_api.ingress_claim(text,text,text,bigint),auth_api.ingress_credential_read(text,text,text) TO cleanops_identity_service')
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
      await t.test('connection failure never claims success or falls back locally', async () => {
        const stopped = new Pool({ ...config, user: 'ingress_test_login', database: 'b1_ingress_test' })
        await stopped.end()
        const repositories = createPgIngressRepositories(stopped)
        await assert.rejects(repositories.replay.claim({ ...scope, nonce: fresh(), expiresAt: Date.now() + 10000 }))
        await assert.rejects(repositories.credentials.read(device))
      })
      await t.test('PostgreSQL lock timeout fails closed and rolls back the losing transaction', async () => {
        const locking = await owner.connect()
        const impatient = new Pool({ ...config, user: 'ingress_test_login', database: 'b1_ingress_test', options: '-c statement_timeout=50' })
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
    } finally { await Promise.all(pools.map(p => p.end())) }
  })
