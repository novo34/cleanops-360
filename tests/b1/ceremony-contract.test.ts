import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
test('pending ceremony SQL remains guarded review-only without schema changes', () => {
 const sql = read('docs/proposals/b1-ceremony-material/review-only.sql')
 assert.ok(sql.indexOf("RAISE EXCEPTION 'REVIEW_ONLY_") < sql.indexOf('CREATE FUNCTION'))
 assert.match(sql, /ROLLBACK;\s*$/)
 assert.doesNotMatch(sql, /CREATE TABLE|ALTER TABLE|INSERT INTO app\.sessions|GRANT (SELECT|INSERT|UPDATE|DELETE)/)
 for (const name of ['trusted_mfa_material','issue_bound_challenge','begin_totp_enrollment_assigned']) {
  assert.match(sql, new RegExp('CREATE FUNCTION auth_api\\.' + name + '\\('))
  assert.ok(!read('lib/b1/v4-broker.ts').includes(name))
 }
 assert.equal((sql.match(/SECURITY DEFINER SET search_path=pg_catalog/g) || []).length, 3)
 assert.match(sql, /FROM PUBLIC/)
 assert.match(sql, /FROM cleanops_identity_service/)
})
test('runtime remains closed and preparation cannot call SQL or send secrets', () => {
 assert.match(read('lib/b1/runtime.ts'), /closedBackend/)
 const helper = read('lib/b1/ceremony-preparation.ts')
 assert.doesNotMatch(helper, /console\.|fetch\(|\.query\(/)
 assert.ok(!read('lib/b1/approved-backend.ts').includes('ceremony-preparation'))
})
