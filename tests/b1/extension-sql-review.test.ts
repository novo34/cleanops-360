import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const root = '../../docs/proposals/b1-v4-extension/'
const sql = readFileSync(new URL(root + 'review-only.sql', import.meta.url), 'utf8')
const contract = JSON.parse(readFileSync(new URL(root + 'contract.json', import.meta.url), 'utf8'))
const blocks = new Map([...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION ([\w.]+)\(([^)]*)\)[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/g)]
  .map(m => [m[1], { args: m[2].split(',').map(s => s.trim()).filter(Boolean).map(s => s.split(/\s+/)[1]).join(','), body: m[3], declaration: m[0] }]))
const body = (name: string) => { const value = blocks.get(name); assert.ok(value, name); return value.body }

test('SQL overlay is abort-guarded REVIEW ONLY with an exact reviewed signature inventory', () => {
  assert.match(sql, /^-- .*REVIEW ONLY/)
  assert.match(sql, /BEGIN;\s*DO \$review_only\$ BEGIN\s*RAISE EXCEPTION 'REVIEW_ONLY_OWNER_APPROVAL_AND_EXECUTION_AUTHORIZATION_REQUIRED'/)
  assert.ok(sql.indexOf('RAISE EXCEPTION') < sql.indexOf('ALTER TABLE'))
  assert.match(sql.trim(), /ROLLBACK;$/)
  assert.doesNotMatch(sql, /\bCOMMIT\s*;|deployment_enabled\s*=\s*true|\bSET ROLE\b|BYPASSRLS|INSERT INTO identity_private\.configuration/i)
  assert.equal(blocks.size, contract.functions.length)
  for (const f of contract.functions as { signature: string }[]) {
    const name = f.signature.slice(0, f.signature.indexOf('('))
    assert.equal(name + '(' + blocks.get(name)?.args + ')', f.signature)
  }
})

test('all proposed functions have fixed search_path, broker ownership and PUBLIC revoke', () => {
  for (const [name, f] of blocks) {
    assert.match(f.declaration, /SECURITY DEFINER SET search_path=pg_catalog/)
    const signature = name + '(' + f.args + ')'
    assert.ok(sql.includes('ALTER FUNCTION ' + signature + ' OWNER TO cleanops_auth_broker;'))
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION ' + signature + ' FROM PUBLIC;'))
    if (name.startsWith('identity_private.')) assert.ok(!sql.includes('GRANT EXECUTE ON FUNCTION ' + signature))
  }
  assert.doesNotMatch(sql, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]*TO cleanops_(?:runtime|identity_service)/i)
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION auth_api\.login_material/)
  assert.match(sql, /auth_api\.verify_challenge\(text,uuid,bytea,bigint,uuid\)/)
})

test('credential proposal rechecks hash AND generation, with principal lock before credential', () => {
  const locks = body('identity_private.lock_principal')
  assert.ok(locks.indexOf('identity_private.principals') < locks.indexOf('identity_private.credentials'))
  assert.equal((locks.match(/FOR UPDATE/g) ?? []).length, 2)
  const cas = body('auth_api.rehash_credential_cas')
  assert.match(cas, /credential_version=expected_version AND argon2id_hash=expected_hash/)
  assert.doesNotMatch(cas, /SET credential_version|credential_version\s*=\s*credential_version\s*\+/)
  const preauth = body('auth_api.new_preauth_verified')
  assert.ok(preauth.indexOf('expected_version') < preauth.indexOf('RETURN auth_api.new_preauth'))
  assert.match(preauth, /c\.argon2id_hash=expected_hash/)
  assert.match(preauth, /lock_memberships/)
})

test('TOTP proposal versions method material, has no implicit algorithm, and rejects stale global counters', () => {
  assert.match(sql, /ADD COLUMN algorithm text CHECK/)
  assert.doesNotMatch(sql, /ADD COLUMN algorithm[^;]*DEFAULT/)
  const trigger = body('identity_private.version_totp_method')
  assert.match(trigger, /NEW\.method_version:=OLD\.method_version\+1/)
  assert.match(trigger, /NEW\.last_totp_counter<OLD\.last_totp_counter/)
  const material = body('auth_api.totp_material_locked')
  for (const field of ['tenantId', 'userId', 'methodId', 'purpose', 'ceremonyId', 'version', 'lastCounter', 'expiresAt', 'algorithm']) assert.ok(material.includes("'" + field + "'"))
  assert.ok(material.indexOf('FROM app.mfa_methods') < material.lastIndexOf('FROM app.mfa_challenges'))
  assert.match(material, /m\.algorithm IS NULL/)
  for (const name of ['consume_totp_cas', 'consume_enrollment_cas']) {
    const consume = body('auth_api.' + name)
    assert.match(consume, /IS DISTINCT FROM expected_counter/)
    assert.match(consume, /validated_counter<=expected_counter/)
    assert.match(consume, /expected_method_version/)
    assert.match(consume, /clock_timestamp\(\).*totp_period/)
    assert.match(consume, /totp_window/)
  }
})

test('Binding preserves preauth boundaries; step-up includes current policy and exact resource', () => {
  const resolve = body('auth_api.resolve_binding')
  for (const field of ['csrfDigest', 'expiresAt', 'tenantId', 'userId', 'sessionId']) assert.ok(resolve.includes("'" + field + "'"))
  assert.match(resolve, /LEAST\(s\.absolute_expires_at,s\.idle_expires_at\)/)
  assert.match(resolve, /auth_api\.csrf_valid/)
  assert.match(resolve, /q\.state NOT IN\('SELECTION','PENDING_MFA','ENROLLMENT_REQUIRED'\)/)
  const auth = body('auth_api.binding_authorization')
  for (let i = 1; i <= 8; i++) assert.ok(auth.includes('B1-SELF-0' + i))
  assert.match(auth, /identity_private\.rule_allowed/)
  assert.match(auth, /e\.policy_version=pv/)
  assert.match(auth, /e\.resource_id IS NOT DISTINCT FROM resource/)
  assert.match(auth, /clock_timestamp\(\)<e\.expires_at/)
  const proof = body('auth_api.verify_challenge')
  assert.ok(proof.indexOf('-- Authorization precedes') < proof.indexOf('UPDATE app.mfa_methods'))
  assert.match(proof, /app\.step_up_evidence\([^)]*policy_version\)/)
})

test('reservation discard requires same scope, hash, backend and xid, never COMPLETED', () => {
  const reserve = body('auth_api.reserve_owned'), finish = body('identity_private.finish_owned')
  assert.match(reserve, /RESERVATION_NOT_OWNED/)
  assert.match(reserve, /request_digest.*IS DISTINCT FROM request_hash/)
  assert.match(reserve, /'replay'/)
  assert.match(reserve, /'expiresAt'/)
  assert.match(finish, /ONE_TIME_PLAINTEXT_FORBIDDEN/)
  assert.match(finish, /SELECT \* INTO c FROM identity_private\.tx_context WHERE backend_pid=pg_backend_pid\(\) AND transaction_id=pg_current_xact_id\(\)/)
  const deletes = [...finish.matchAll(/DELETE FROM [\s\S]*?;/g)].map(m => m[0])
  assert.equal(deletes.length, 2)
  for (const statement of deletes) {
    assert.match(statement, /state='PENDING'/)
    assert.match(statement, /request_digest=request_hash/)
    assert.match(statement, /owner_backend=pg_backend_pid\(\)/)
    assert.match(statement, /owner_xid=pg_current_xact_id\(\)/)
    assert.doesNotMatch(statement, /COMPLETED/)
  }
})

// Executable review models of the contract, NOT SQL or implementation verification.
test('contract model: generation reset and stale rehash cannot issue preauth', () => {
  const credential = { version: 7, hash: 'original' }
  const cas = (version: number, hash: string, replacement: string) => {
    if (credential.version !== version || credential.hash !== hash) return false
    credential.hash = replacement; return true
  }
  const issue = (version: number, hash: string) => credential.version === version && credential.hash === hash
  assert.equal(cas(7, 'original', 'rehash'), true)
  assert.equal(credential.version, 7)
  assert.equal(cas(7, 'original', 'stale'), false)
  assert.equal(issue(7, 'original'), false)
  assert.equal(issue(7, 'rehash'), true)
  credential.version++; credential.hash = 'reset'
  assert.equal(issue(7, 'rehash'), false)
})

test('contract model: two purposes share a method counter; stale version and owner cannot consume', () => {
  const method = { version: 3, counter: null as number | null }
  const consume = (version: number, expected: number | null, next: number) => {
    if (method.version !== version || method.counter !== expected || (expected !== null && next <= expected)) return false
    method.counter = next; return true
  }
  // Both proofs were read before either CAS. Purpose is deliberately NOT a counter key.
  assert.equal(consume(3, null, 100), true)
  assert.equal(consume(3, null, 100), false)
  assert.equal(consume(3, 100, 100), false)
  method.version++
  assert.equal(consume(3, 100, 101), false)
  const row = { tenant: 'A', hash: 'request', backend: 1, xid: 'tx-a', state: 'PENDING' }
  const discard = (tenant: string, hash: string, backend: number, xid: string) =>
    row.state === 'PENDING' && row.tenant === tenant && row.hash === hash && row.backend === backend && row.xid === xid
  assert.equal(discard('B', 'request', 1, 'tx-a'), false)
  assert.equal(discard('A', 'request', 1, 'tx-b'), false)
  assert.equal(discard('A', 'different', 1, 'tx-a'), false)
  assert.equal(discard('A', 'request', 1, 'tx-a'), true)
  row.state = 'COMPLETED'
  assert.equal(discard('A', 'request', 1, 'tx-a'), false)
})
