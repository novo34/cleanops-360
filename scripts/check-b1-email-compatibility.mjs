/** Offline only. No database connection, mutation, approval or identity output. */
import { readTrustedPrivateFile } from '../lib/b1/private-file.ts'
import { checkEmailCompatibility } from '../lib/b1/email-normalization.ts'
import { isAbsolute, relative } from 'node:path'

try {
  const [path, uidText, gidText, modeText, ...extra] = process.argv.slice(2)
  const location = path && relative(process.cwd(), path)
  if (extra.length || !path || !isAbsolute(path) || !location || (!location.startsWith('../') && !isAbsolute(location)) ||
      !/^\d+$/.test(uidText ?? '') || !/^\d+$/.test(gidText ?? '') || !['0400', '0600'].includes(modeText)) throw new Error('INVALID_ARGUMENTS')
  const data = await readTrustedPrivateFile({ path, uid: Number(uidText), gid: Number(gidText), mode: Number.parseInt(modeText, 8), maxBytes: 65536 })
  let report
  try { report = checkEmailCompatibility(JSON.parse(data.toString('utf8'))) }
  finally { data.fill(0) }
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'COMPATIBLE') process.exitCode = 1
} catch {
  console.error('EMAIL_COMPATIBILITY_UNAVAILABLE: expected private absolute snapshot outside cwd, uid, gid, mode 0400|0600; no identities emitted')
  process.exitCode = 2
}
