import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, generateKeyPairSync } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { createPgDurableCandidateIntegration } from '../../lib/b1/integration-candidate.ts'
import { createCandidateIssuer, assertionHeader, credentialCookie } from '../../lib/b1/ingress-assertion.ts'
import { checkEmailCompatibility } from '../../lib/b1/email-normalization.ts'

/** Disposable PG16 only; no server credentials, installed schema or operator channel. */
const port = Number(process.env.CLEANOPS_B1_TEST_PG_PORT)
test('PG16 durable B1: enrolled credential, shared replay, revocation and unavailable store',
  { skip: !port }, async () => {
    assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535)
    const config = { host: '127.0.0.1', port, user: 'postgres', connectionTimeoutMillis: 2000 }
    const admin = new Pool({ ...config, database: 'postgres' })
    const database = 'b1_full_' + randomBytes(8).toString('hex')
    const owner = new Pool({ ...config, database })
    const pools: Pool[] = [owner]
    let created = false
    try {
      await admin.query(`CREATE DATABASE ${database}`)
      created = true
      const version = await owner.query('SHOW server_version_num')
      assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 16)
      await owner.query('CREATE ROLE cleanops_ddl_owner NOLOGIN; CREATE ROLE cleanops_identity_service NOLOGIN; CREATE ROLE ingress_test_login LOGIN IN ROLE cleanops_identity_service; CREATE SCHEMA identity_private AUTHORIZATION cleanops_ddl_owner; CREATE SCHEMA auth_api AUTHORIZATION cleanops_ddl_owner; REVOKE ALL ON SCHEMA identity_private,auth_api FROM PUBLIC; GRANT USAGE ON SCHEMA auth_api TO cleanops_identity_service')
      await owner.query(await readFile(new URL('../../docs/proposals/b1-ingress-persistence.review.sql', import.meta.url), 'utf8'))
      const p = new Pool({ ...config, user: 'ingress_test_login', database })
      const q = new Pool({ ...config, user: 'ingress_test_login', database })
      pools.push(p, q)
      const keys = generateKeyPairSync('ed25519')
      let time = Date.now()
      const common = { issuer: 'fixture', audience: 'https://fixture.invalid',
        maximumDeviceLifetimeMs: 60000, contextLifetimeMs: 10000,
        maximumBodyBytes: 1024, bodyTimeoutMs: 500, clock: () => time }
      const issuer = createCandidateIssuer({ ...common, privateKey: keys.privateKey,
        pseudonymKey: randomBytes(32) })
      time += 1
      // Fixture-only privileged write. No runtime grant, no production enrolment.
      const credential = issuer.issueDeviceCredential({ device: 'Test profile', browser: 'Test browser' }, 30000)
      const payload = JSON.parse(Buffer.from(credential.split('.')[1], 'base64url').toString('utf8')) as {
        iss: string; aud: string; id: string; iat: number; exp: number
      }
      await owner.query('SELECT auth_api.ingress_enroll($1,$2,$3,$4,$5,$6)', [
        payload.iss, payload.aud, payload.id, payload.iat, payload.exp, 'fixture-operator-only',
      ])
      const report = checkEmailCompatibility([{ id: 'fixture', emailNormalized: 'A@example.com' }])
      const approval = { reference: 'test-only', policyVersion: report.policyVersion,
        snapshotSha256: report.snapshotSha256, emptyInstallationApproved: false }
      const verifier = (identityPool: Pool) => createPgDurableCandidateIntegration({
        report, approval, identityPool,
        verifier: { ...common, publicKey: keys.publicKey, topology: 'shared-atomic-all-consumers' },
      })
      const a = verifier(p), b = verifier(q)
      time += 1
      const makeRequest = async () => {
        const request = new Request(common.audience + '/api/auth/login', {
          method: 'POST', headers: { cookie: credentialCookie + '=' + credential }, body: '{}',
        })
        request.headers.set(assertionHeader, await issuer.issueForAuthenticatedIngress(request, '192.0.2.1'))
        return request
      }
      const first = await makeRequest()
      assert.equal((await a.resolveRequestContext(first.clone())).device.length, 32)
      await assert.rejects(b.resolveRequestContext(first.clone()), /AUTH_DEPENDENCY_UNAVAILABLE/)
      const second = await makeRequest()
      await owner.query('SELECT auth_api.ingress_revoke($1,$2,$3,$4)', [
        payload.iss, payload.aud, payload.id, 1,
      ])
      await assert.rejects(a.resolveRequestContext(second.clone()), /AUTH_DEPENDENCY_UNAVAILABLE/)
      // Unavailable database must never create a local replay success.
      await p.end()
      pools.splice(pools.indexOf(p), 1)
      await assert.rejects(a.resolveRequestContext(await makeRequest()), /AUTH_DEPENDENCY_UNAVAILABLE/)
    } finally {
      await Promise.allSettled(pools.map(pool => pool.end()))
      try {
        if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`)
        await admin.query('DROP ROLE IF EXISTS ingress_test_login, cleanops_identity_service, cleanops_ddl_owner')
      } finally { await admin.end() }
    }
  })
