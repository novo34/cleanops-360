/** Proposed policy, NOT an assertion about historical provisioning. No runtime wiring. */
import { createHash } from 'node:crypto'
import { canonical, valid } from './contracts.ts'

export const proposedEmailPolicy = Object.freeze({
  version: 'b1-ascii-domain-lower-v1',
  localPart: 'preserve-exactly', domain: 'ascii-lowercase',
  whitespace: 'reject', unicode: 'reject', maximumBytes: 254,
})
export const emailPolicySha256 = createHash('sha256').update(canonical(proposedEmailPolicy)).digest('hex')
const invalid = () => new Error('EMAIL_POLICY_INPUT_INVALID')

export function normalizeCandidateEmail(email: string): string {
  if (typeof email !== 'string' || !/^[\x21-\x7e]+$/.test(email) ||
      !valid({ type: 'string', format: 'email', maxLength: 254 }, email)) throw invalid()
  const [local, domain, extra] = email.split('@')
  if (extra !== undefined || !local || local.length > 64 || !domain ||
      !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(domain) ||
      domain.split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) throw invalid()
  return local + '@' + domain.toLowerCase()
}

export type EmailCompatibilityReport = Readonly<{
  version: 1; policyVersion: string; policySha256: string; snapshotSha256: string
  rows: number; invalidRows: number; changedRows: number; collisionRows: number
  status: 'COMPATIBLE' | 'INCOMPATIBLE'
}>
/** Private snapshot only. Reports counts/hashes, never emails or replacement SQL. */
export function checkEmailCompatibility(rows: readonly Readonly<{ id: string; emailNormalized: string }>[]): EmailCompatibilityReport {
  if (!Array.isArray(rows) || rows.some(r => !r || Object.keys(r).sort().join(',') !== 'emailNormalized,id' ||
      typeof r.id !== 'string' || !r.id.length || typeof r.emailNormalized !== 'string') ||
      new Set(rows.map(r => r.id)).size !== rows.length) throw invalid()
  const sorted = [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  let invalidRows = 0, changedRows = 0, collisionRows = 0
  const normalized = new Map<string, number>()
  for (const row of sorted) {
    try {
      const value = normalizeCandidateEmail(row.emailNormalized)
      if (value !== row.emailNormalized) changedRows++
      normalized.set(value, (normalized.get(value) ?? 0) + 1)
    } catch { invalidRows++ }
  }
  for (const count of normalized.values()) if (count > 1) collisionRows += count
  return Object.freeze({ version: 1, policyVersion: proposedEmailPolicy.version, policySha256: emailPolicySha256,
    snapshotSha256: createHash('sha256').update(canonical(sorted)).digest('hex'), rows: rows.length,
    invalidRows, changedRows, collisionRows,
    status: invalidRows || changedRows || collisionRows ? 'INCOMPATIBLE' : 'COMPATIBLE' })
}

/** Only trusted installation code supplies the owner-reviewed private receipt. */
export function createApprovedEmailNormalizer(report: EmailCompatibilityReport, approval: Readonly<{
  reference: string; policyVersion: string; snapshotSha256: string; emptyInstallationApproved: boolean
}>) {
  if (!report || Object.keys(report).sort().join(',') !== 'changedRows,collisionRows,invalidRows,policySha256,policyVersion,rows,snapshotSha256,status,version' ||
      report.version !== 1 || report.policyVersion !== proposedEmailPolicy.version || report.policySha256 !== emailPolicySha256 ||
      !/^[a-f0-9]{64}$/.test(report.snapshotSha256) || report.status !== 'COMPATIBLE' ||
      !Number.isSafeInteger(report.rows) || report.rows < 0 ||
      report.invalidRows !== 0 || report.changedRows !== 0 || report.collisionRows !== 0 ||
      !approval || typeof approval.reference !== 'string' || !approval.reference.trim() ||
      approval.policyVersion !== report.policyVersion || approval.snapshotSha256 !== report.snapshotSha256 ||
      typeof approval.emptyInstallationApproved !== 'boolean' || (!report.rows && !approval.emptyInstallationApproved)) {
    throw new Error('EMAIL_POLICY_APPROVAL_REQUIRED')
  }
  return normalizeCandidateEmail
}
