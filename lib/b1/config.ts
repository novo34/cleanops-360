import source from './security-values.json' with { type: 'json' }

export type SecurityValue = string | number | number[]
export type SecurityEntry = { key: string; value: SecurityValue; status: string; source: string; unit: string; verification: string }
const approved = { email_otp_ttl: 300, idle_sensitive: 1800, idle_operational: 28800, trusted_device_max: 2592000, password_hash: 'Argon2id' }
export function securityProfile(entries: readonly SecurityEntry[] = source.values) {
  if (entries.length !== 60 || new Set(entries.map(e => e.key)).size !== 60) throw new Error('SECURITY_PROFILE_INVALID')
  for (const [key, value] of Object.entries(approved)) {
    const entry = entries.find(e => e.key === key)
    if (entry?.status !== 'APPROVED' || entry.value !== value) throw new Error('APPROVED_VALUE_CHANGED')
  }
  // V4 proposals are permitted only as the exact, versioned trial profile.
  for (const entry of entries) {
    const expected = source.values.find(e => e.key === entry.key)
    if (!expected || JSON.stringify(entry) !== JSON.stringify(expected)) throw new Error('UNREVIEWED_PROFILE_CHANGE')
  }
  const values = Object.freeze(Object.fromEntries(entries.map(e => [e.key, Array.isArray(e.value) ? Object.freeze([...e.value]) : e.value])))
  return Object.freeze({ id: 'b1-v4-trial', productionApproved: false, authGate05: 'OPEN', values,
    approvedKeys: Object.freeze(Object.keys(approved)),
    proposedKeys: Object.freeze(entries.filter(e => e.status === 'PROPOSED_BENCHMARK_REQUIRED').map(e => e.key)) })
}
export const profile = securityProfile()
export function numeric(key: string): number {
  const value = profile.values[key]
  if (typeof value !== 'number') throw new Error('SECURITY_VALUE_MISSING')
  return value
}
