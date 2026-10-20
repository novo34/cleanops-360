import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { contract, operations, valid, canonical, assertVocabulary, type Schema } from '../../lib/b1/contracts.ts'
import { profile, securityProfile, numeric } from '../../lib/b1/config.ts'
import values from '../../lib/b1/security-values.json' with { type: 'json' }
import provenance from '../../lib/b1/provenance.json' with { type: 'json' }
import { emptyView, receiveAuth } from '../../lib/b1/ui-state.ts'

import { id, tenantB, sample } from './schema-fixture.ts'
test('exact V4 provenance; 60 original V4 values plus owner-approved absolute policy overlay', () => {
  assert.equal(profile.productionApproved, false); assert.equal(profile.authGate05, 'OPEN')
  assert.equal(Object.keys(profile.values).length, 60); assert.equal(profile.approvedKeys.length, 7); assert.equal(profile.proposedKeys.length, 53)
  for (const [path, hash] of Object.entries(provenance)) assert.equal(createHash('sha256').update(readFileSync('docs/canonical/auth-review/v4/' + path)).digest('hex'), hash)
  assert.equal(numeric('argon_memory'), 65536); assert.equal(numeric('argon_iterations'), 3); assert.equal(numeric('argon_parallelism'), 1)
})
test('missing, duplicated, altered approved and unreviewed trial values fail closed', () => {
  for (const key of ['email_otp_ttl','argon_memory']) {
    const changed = structuredClone(values.values); changed.find(e => e.key === key)!.value = 1
    assert.throws(() => securityProfile(changed))
  }
  assert.throws(() => securityProfile(values.values.slice(1)))
  assert.throws(() => numeric('missing'))
})
test('31 existing B1 operations plus two B2 directory reads; all inputs and success/error schemas validate and reject unknown fields', () => {
  assert.equal(operations.length, 33); assert.equal(new Set(operations.map(o => o.operationId)).size, 33)
  assert.deepEqual(operations.filter(o => o.path.startsWith('/auth/users')).map(o => o.operationId).sort(), ['getAdministrationUser', 'listAdministrationUsers'])
  for (const op of operations) {
    if (op.requestBody) { const s = op.requestBody.content['application/json'].schema, value = sample(s); assert.ok(valid(s, value), op.operationId); assert.ok(!valid(s, { ...value as object, user_id: id }), op.operationId) }
    for (const response of Object.values(op.responses)) { const s = response.content['application/json'].schema; assert.ok(valid(s, sample(s)), op.operationId) }
    assert.ok(!op.path.startsWith('/admin')); assert.ok(!op.path.includes('system-status'))
  }
})
test('Unicode code points, UUID, method, unknown selectors and step-up resource binding', () => {
  const login = contract.components.schemas.LoginInput
  assert.ok(valid(login, { email: 'a@example.test', password: '🔑'.repeat(12) }))
  assert.ok(!valid(login, { email: 'a@example.test', password: 'a'.repeat(129) }))
  assert.ok(!valid(contract.components.schemas.MfaVerifyInput, { challenge_id: 'forged', method: 'TOTP', proof: '123456' }))
  const step = contract.components.schemas.StepUpInput
  assert.ok(!valid(step, { grant_id: 'B1-SELF-08' })); assert.ok(valid(step, { grant_id: 'B1-SELF-08', resource_id: id }))
  assert.ok(!valid(step, { grant_id: 'B1-SELF-04', resource_id: id }))
  assert.throws(() => assertVocabulary({ unknownKeyword: true } as Schema))
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }))
})
test('pending company switch purges source records and one-time secrets', () => {
  const source = { ...emptyView, auth: { state: 'ACTIVE' as const, session_id: id, tenant_id: id, absolute_expires_at: '2026-10-16T12:00:00Z' }, sessions: ['source'], tenants: ['source'], codes: ['secret'] }
  const pending = receiveAuth(source, { state: 'PENDING_MFA', challenge_id: id, allowed_methods: ['TOTP'], expires_at: '2026-10-16T12:00:00Z' })
  assert.deepEqual(pending.sessions, []); assert.deepEqual(pending.codes, []); assert.deepEqual(pending.tenants, [])
  const dest = receiveAuth(source, { ...source.auth, tenant_id: tenantB })
  assert.deepEqual(dest.sessions, []); assert.deepEqual(dest.codes, [])
})
