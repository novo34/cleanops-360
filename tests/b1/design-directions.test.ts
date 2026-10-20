import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const root = 'docs/proposals/b1-ceremony-material/'
const request = JSON.parse(read(root + 'approval-request.json'))
const blob = (text: string) => createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex')
test('D1 final approval pins exact SQL/ACL; no design direction authorizes execution', () => {
 assert.equal(request.status, 'PENDING_OWNER_DECISION')
 assert.equal(request.D1.status, 'PENDING_FINAL_APPROVAL')
 assert.equal(blob(read(root + 'review-only.sql')), request.D1.sqlBlob)
 assert.equal(blob(read(root + 'approval-matrix.json')), request.D1.matrixBlob)
 for (const allowed of Object.values(request.authorization)) assert.equal(allowed, false)
 assert.equal(request.D1.emailIssuanceRequiresAdditionalVerifiedRecipientContract, true)
 assert.equal(request.runtime, 'closedBackend')
 assert.equal(request.authGate05, 'OPEN')
})
test('D3 candidate remains data/test-only, canonical period/digits/window preserved', () => {
 const values = JSON.parse(read('lib/b1/security-values.json')).values as { key: string; value: unknown }[]
 assert.equal(request.D3.status, 'CANDIDATE_UNAPPROVED')
 assert.equal(request.D3.algorithm, 'SHA256')
 assert.equal(request.D3.secretBytes, 32)
 assert.equal(request.D3.issuer, 'CleanOps 360')
 assert.equal(request.D3.authenticatorFieldEvidence, 'NOT_TESTED')
 for (const [key, expected] of [['totp_period', 30], ['totp_digits', 6], ['totp_window', 1]] as const) {
  assert.equal(values.find(v => v.key === key)?.value, expected)
 }
 assert.ok(!values.some(v => ['totp_algorithm', 'totp_secret_bytes', 'totp_issuer'].includes(v.key)))
})
test('operational specifications and unresolved recipient/completion contracts are explicit', () => {
 assert.equal(request.D2.provider, null)
 assert.equal(request.D4.provider, null)
 assert.equal(request.D4.verifiedRecipientRequired, true)
 assert.equal(request.D4.recipientEvidenceContractApproved, false)
 assert.equal(request.D4.workerCompletionContractApproved, false)
 for (const key of ['D2', 'D3', 'D4']) assert.ok(read(root + request[key].specification).length > 1000)
 const spec = read(root + 'EMAIL_DELIVERY.md')
 assert.match(spec, /principals\.email_normalized alone proves neither verification nor ownership/)
 assert.match(spec, /RECONCILE/)
 assert.match(spec, /CHECK\(expires_at>available_at\)/)
})
test('planner is side-effect free and all dependent routes stay unwired', () => {
 const planner = read('lib/b1/mail-delivery-plan.ts')
 assert.doesNotMatch(planner, /console\.|fetch\(|\.query\(|setTimeout|process\.env/)
 for (const path of ['lib/b1/approved-backend.ts', 'lib/b1/v4-broker.ts', 'lib/b1/runtime.ts']) {
  const source = read(path)
  assert.ok(!source.includes('mail-delivery-plan'), path)
  assert.ok(!source.includes('approval-request'), path)
 }
 assert.match(read('lib/b1/runtime.ts'), /closedBackend/)
})
