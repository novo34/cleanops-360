import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('docs/proposals/b1-ceremony-material/review-only.sql')
const matrix = JSON.parse(read('docs/proposals/b1-ceremony-material/approval-matrix.json')) as {
 status: string; runtime: string; authGate05: string; databaseExecuted: boolean
 functions: { name: string; types: string[]; returns: string; change: string }[]
 owner: string; executeRole: string; revokeDirect: string[]; brokerColumnUpdates: string[]
}
const declarations = [...sql.matchAll(/CREATE (OR REPLACE )?FUNCTION auth_api\.(\w+)\(([^)]*)\) RETURNS (\w+)/g)]
const body = (name: string) => {
 const start = sql.indexOf('FUNCTION auth_api.' + name + '(')
 assert.ok(start >= 0)
 return sql.slice(start, sql.indexOf('$fn$;', start) + 6)
}
test('review-only guard and exact five-function signature inventory; no hidden surface', () => {
 assert.ok(sql.indexOf("RAISE EXCEPTION 'REVIEW_ONLY_") < sql.indexOf('ALTER TABLE'))
 assert.match(sql, /ROLLBACK;\s*$/)
 assert.equal(matrix.status, 'PROPOSED_REQUIRES_OWNER_APPROVAL')
 assert.equal(matrix.databaseExecuted, false)
 assert.equal(matrix.runtime, 'closedBackend')
 assert.equal(matrix.authGate05, 'OPEN')
 assert.equal(declarations.length, matrix.functions.length)
 for (const item of matrix.functions) {
  const found = declarations.find(d => d[2] === item.name)
  assert.ok(found, item.name)
  assert.deepEqual(found[3].split(',').map(arg => arg.trim().split(/\s+/)[1]), item.types)
  assert.equal(found[4], item.returns)
  assert.equal(Boolean(found[1]), item.change === 'REPLACE')
  const signature = 'auth_api.' + item.name + '(' + item.types.join(',') + ')'
  assert.ok(sql.includes('ALTER FUNCTION ' + signature + ' OWNER TO ' + matrix.owner + ';'))
  assert.ok(sql.slice(sql.indexOf('REVOKE ALL ON FUNCTION')).includes(signature))
  assert.ok(sql.slice(sql.indexOf('GRANT EXECUTE ON FUNCTION')).includes(signature))
 }
 assert.equal((sql.match(/SECURITY DEFINER SET search_path=pg_catalog/g) || []).length, 5)
 assert.doesNotMatch(sql, /EXECUTE format|SET ROLE|BYPASSRLS|GRANT CREATE|CREATE TABLE|INSERT INTO app\.sessions/)
})
test('privilege/schema delta is explicit, broker-only and minimal; legacy entry points removed', () => {
 const grants = [...sql.matchAll(/^GRANT UPDATE\((\w+)\) ON ([\w.]+) TO (\w+);$/gm)]
 assert.deepEqual(grants.map(g => g[2] + '(' + g[1] + ')').sort(), [...matrix.brokerColumnUpdates].sort())
 for (const grant of grants) assert.equal(grant[3], matrix.owner)
 assert.equal((sql.match(/^ALTER TABLE /gm) || []).length, 1)
 assert.match(sql, /ALTER TABLE app\.mfa_challenges ADD COLUMN method_version bigint CHECK\(method_version>0\);/)
 assert.doesNotMatch(sql, /GRANT (SELECT|INSERT|DELETE)|GRANT UPDATE ON|UPDATE app\.mfa_challenges SET method_version=1/)
 for (const signature of matrix.revokeDirect) assert.ok(sql.slice(sql.indexOf('REVOKE EXECUTE ON FUNCTION')).includes(signature))
 assert.match(sql, /FROM PUBLIC;/)
 assert.match(sql, /FROM cleanops_identity_service;/)
})
test('method snapshot is written after locked eligibility and consumed under generation checks', () => {
 const issue = body('issue_bound_challenge')
 assert.ok(issue.indexOf('trusted_mfa_material(') < issue.indexOf('issue_challenge('))
 assert.match(issue, /m->>'version'=expected_version::text/)
 assert.match(issue, /UPDATE app\.mfa_challenges x SET method_version=expected_version/)
 assert.ok(issue.indexOf('SET method_version') < issue.indexOf('append_audit'))
 const email = body('consume_email_otp')
 assert.ok(email.indexOf('trusted_mfa_material(') < email.indexOf('user_id=u FOR UPDATE'))
 assert.match(email, /m->>'version'=x\.method_version::text/)
 assert.match(email, /x\.purpose IS DISTINCT FROM CASE/)
 assert.match(email, /x\.preauth_id IS DISTINCT FROM q\.id/)
 assert.match(email, /x\.session_id IS DISTINCT FROM c\.session_id/)
 assert.ok(email.indexOf("m->>'version'") < email.indexOf('RETURN auth_api.verify_challenge'))
 assert.match(body('totp_material_locked'), /x\.method_version IS DISTINCT FROM m\.method_version/)
})
test('trusted context, expiry after wait, no redundant membership upgrade, assigned enrollment scope', () => {
 const reader = body('trusted_mfa_material')
 const wait = reader.indexOf('ORDER BY m.id FOR UPDATE')
 const expiry = reader.lastIndexOf('clock_timestamp()>=until_at')
 assert.ok(wait > 0 && expiry > wait)
 assert.doesNotMatch(reader, /FOR UPDATE OF x/)
 assert.match(reader, /identity_private\.checked_preauth\(raw_preauth\)/)
 assert.match(reader, /identity_private\.guard\(grant_key,false,resource\)/)
 assert.match(reader, /purpose='ISSUE_SESSION' AND \(q\.state<>'VERIFIED' OR q\.factor_verified_at IS NULL\)/)
 assert.match(reader, /'recipient',CASE WHEN purpose IN\('LOGIN','STEP_UP'\) THEN recipient ELSE NULL END/)
 const enrollment = body('begin_totp_enrollment_assigned')
 assert.match(enrollment, /t IS DISTINCT FROM expected_tenant OR u IS DISTINCT FROM expected_user/)
 assert.match(enrollment, /initial_version IS DISTINCT FROM 1::bigint/)
 assert.match(enrollment, /get_byte\(ciphertext,0\)<>2/)
 assert.doesNotMatch(enrollment, /ON CONFLICT|UPSERT/)
 assert.ok(enrollment.indexOf('trusted_mfa_material') < enrollment.indexOf('UPDATE app.mfa_methods'))
})
test('canonical V4/B1-X unchanged; approved D1 calls match pinned contract without runtime activation', () => {
 const originals: Record<string, string> = {"docs/canonical/auth-review/v4/b1-review-only.sql":"a06dc23cbc889382b30924a1edc4cead66eeb3e0","docs/proposals/b1-v4-extension/review-only.sql":"1499e90389b6e7c4d94b1dd17ed35cd4b539d436"}
 for (const [path, expected] of Object.entries(originals)) {
  const text = read(path)
  const hash = createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex')
  assert.equal(hash, expected, path)
 }
 const broker = read('lib/b1/v4-broker.ts')
 for (const item of matrix.functions.filter(f => f.change === 'NEW')) assert.ok(broker.includes('SELECT auth_api.' + item.name + '('))
 assert.match(read('lib/b1/runtime.ts'), /closedBackend/)
 assert.ok(!read('lib/b1/approved-backend.ts').includes('ceremony-preparation'))
 assert.doesNotMatch(read('lib/b1/ceremony-preparation.ts'), /console\.|fetch\(|\.query\(/)
})
