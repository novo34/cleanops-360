/** Offline, idempotent completion + single pending report for the B1 private package manifest.
 * Reuses deploy/staging/b1-installation.example.json (the contract template) and the code's own
 * validators. Fills ONLY null/absent fields whose value is fixed by that template or verifiable from
 * a file (never overwrites, never invents parameters, approvals, keys or certificates). No network,
 * database, Docker, OpenBao or Traefik access; file contents are never printed.
 *
 *   node --experimental-strip-types scripts/complete-b1-installation.mjs <package-dir>            # report only
 *   node --experimental-strip-types scripts/complete-b1-installation.mjs <package-dir> --apply --backup-dir <abs-dir>
 * --apply needs root: backs up installation.json (0400, exclusive) then replaces it atomically (root:999 0440).
 */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash, createPrivateKey, X509Certificate } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readTrustedPrivateFile } from '../lib/b1/private-file.ts'
import { validateInstallationKeys } from '../lib/b1/installation-catalog.ts'
import { validateTotpMethodLimit } from '../lib/b1/ceremony-preparation.ts'
import { validateDummyPasswordHash } from '../lib/b1/approved-factors.ts'

const repo = new URL('../', import.meta.url)
const MOUNT = '/run/cleanops-b1-private/'
const refuse = () => new Error('B1_INSTALLATION_COMPLETION_REFUSED')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v)
const hasNull = v => v == null || (Array.isArray(v) ? v.some(hasNull) : isObject(v) && Object.values(v).some(hasNull))
const get = (o, p) => p.reduce((a, k) => (isObject(a) ? a[k] : undefined), o)
function put(o, p, v) { let a = o; for (const k of p.slice(0, -1)) { if (!isObject(a[k])) a[k] = {}; a = a[k] } a[p.at(-1)] = v }

/** Template walk: fill only absent/null leaves that the template fixes; list the rest as pending. */
function plan(current, template, path, out) {
  for (const [key, fixed] of Object.entries(template)) {
    const p = [...path, key], value = isObject(current) ? current[key] : undefined
    if (value == null) {
      if (!hasNull(fixed)) out.fills.push({ path: p.join('.'), keys: p, value: fixed, basis: 'contract template' })
      else if (isObject(fixed)) plan(undefined, fixed, p, out)
      else out.pending.push(p.join('.'))
    } else if (isObject(fixed)) plan(value, fixed, p, out)
    else if (!hasNull(fixed) && JSON.stringify(fixed) !== JSON.stringify(value)) out.differs.push(p.join('.'))
  }
  if (isObject(current)) for (const k of Object.keys(current)) if (!(k in template)) out.invalid.push([...path, k].join('.') + ': unexpected key')
}

export async function completeB1Installation({ packageDir, apply = false, backupDir, now = () => new Date() }) {
  if (!isAbsolute(packageDir) || (apply && (process.getuid?.() !== 0 || !isAbsolute(backupDir ?? '')))) throw refuse()
  const host = path => {
    if (typeof path === 'string' && path.startsWith(MOUNT)) return join(packageDir, path.slice(MOUNT.length))
    if (typeof path === 'string' && path.startsWith(packageDir + '/')) return path
    return undefined
  }
  const manifestPath = join(packageDir, 'installation.json')
  const handle = await fs.open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  let current, manifestMeta
  try {
    const st = await handle.stat()
    if (!st.isFile() || st.nlink !== 1 || st.size > 65536) throw refuse()
    manifestMeta = { uid: st.uid, gid: st.gid, mode: st.mode & 0o7777 }
    current = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await handle.readFile()))
  } catch { throw refuse() } finally { await handle.close() }
  if (!isObject(current)) throw refuse()

  const template = JSON.parse(await fs.readFile(new URL('deploy/staging/b1-installation.example.json', repo), 'utf8'))
  const out = { fills: [], pending: [], differs: [], invalid: [] }
  plan(current, template, [], out)
  if (current.version !== 2) out.invalid.push('version: must be 2')
  const merged = structuredClone(current)
  const addFill = f => put(merged, f.keys, f.value)
  out.fills.forEach(addFill)

  // Values verifiable from existing records or files (each only when currently null/absent).
  const derive = async (dotted, basis, produce) => {
    const idx = out.pending.indexOf(dotted)
    if (idx < 0) return
    let value
    try { value = await produce() } catch { value = undefined }
    if (value === undefined) return
    out.pending.splice(idx, 1)
    const f = { path: dotted, keys: dotted.split('.'), value, basis }
    out.fills.push(f); addFill(f)
  }
  await derive('postgres.database', 'deploy/staging/RESOURCE_RECORD.json STAGING_SYNTHETIC.databaseName', async () => {
    const r = JSON.parse(await fs.readFile(new URL('deploy/staging/RESOURCE_RECORD.json', repo), 'utf8'))
    return /^[a-z][a-z0-9_]{0,62}$/.test(r?.STAGING_SYNTHETIC?.databaseName) ? r.STAGING_SYNTHETIC.databaseName : undefined
  })
  await derive('bao.origin', 'deploy/staging/compose.openbao.yaml OPENBAO_HEALTH_ORIGIN', async () => {
    const m = /OPENBAO_HEALTH_ORIGIN:\s*(https:\/\/openbao:8200)\s*$/m.exec(await fs.readFile(new URL('deploy/staging/compose.openbao.yaml', repo), 'utf8'))
    return m?.[1]
  })
  const fileState = new Map()
  const checkFile = async (label, source, content) => {
    const path = host(source?.path)
    const result = { label, path: source?.path ?? null, status: 'PENDING_SOURCE' }
    fileState.set(label, result)
    if (!path || !isObject(source)) return result
    try {
      const st = await fs.lstat(path)
      if (!st.isFile() || st.nlink !== 1) result.status = 'NOT_REGULAR_FILE'
      else if (st.uid !== source.uid || st.gid !== source.gid || (st.mode & 0o7777) !== source.mode) result.status = `BAD_METADATA(found ${st.uid}:${st.gid} ${(st.mode & 0o7777).toString(8)})`
      else if (st.size < 1 || st.size > source.maxBytes) result.status = 'BAD_SIZE'
      else {
        const bytes = await readTrustedPrivateFile({ ...source, path })
        try { result.status = (await content?.(bytes, path)) ?? 'OK' } catch (e) { result.status = 'INVALID_CONTENT' + (e?.message ? `(${e.message})` : '') } finally { bytes.fill(0) }
      }
    } catch (e) { result.status = e?.code === 'ENOENT' ? 'MISSING_FILE' : 'UNREADABLE' }
    return result
  }
  const cert = (bytes, ca) => { const x = new X509Certificate(bytes); if (new Date(x.validTo) <= now()) throw new Error('expired'); if (ca && !x.ca) throw new Error('not a CA') ; return x }
  const S = merged.sources ?? {}, I = merged.ingress?.sources ?? {}
  await checkFile('sources.postgresPassword', S.postgresPassword, b => { const t = new TextDecoder('utf-8', { fatal: true }).decode(b); if (/[\r\n\0]/.test(t)) throw new Error('contains CR/LF/NUL') })
  await checkFile('sources.postgresCa', S.postgresCa, b => { cert(b, true) })
  await checkFile('sources.baoCa', S.baoCa, b => { cert(b, true) })
  let baoCertBytes, baoKeyPem
  await checkFile('sources.baoCert', S.baoCert, b => { cert(b); baoCertBytes = Buffer.from(b) })
  await checkFile('sources.baoKey', S.baoKey, b => { baoKeyPem = Buffer.from(b); createPrivateKey(b) })
  if (baoCertBytes && baoKeyPem && fileState.get('sources.baoKey').status === 'OK' && !new X509Certificate(baoCertBytes).checkPrivateKey(createPrivateKey(baoKeyPem))) fileState.get('sources.baoKey').status = 'INVALID_CONTENT(key does not match sources.baoCert)'
  baoKeyPem?.fill(0)
  await derive('baoClientIdentity.certificateSha256', 'sha256 of sources.baoCert file bytes (installation-bootstrap.ts:60)', async () => {
    if (fileState.get('sources.baoCert').status === 'OK') return sha(baoCertBytes)
  })
  baoCertBytes?.fill(0)
  const corpusDigest = get(merged, ['corpus', 'sha256'])
  await checkFile('corpus.source', merged.corpus?.source, (b) => {
    if (!/^(?:[a-f0-9]{64}\n)+$/.test(b.toString('utf8'))) throw new Error('not canonical hashes')
    if (corpusDigest && sha(b) !== corpusDigest) throw new Error('sha256 differs from manifest corpus.sha256')
    if (Number.isSafeInteger(merged.maximumCorpusBytes) && b.length > merged.maximumCorpusBytes) throw new Error('larger than maximumCorpusBytes')
  })
  await checkFile('dummyPasswordHash', merged.dummyPasswordHash, b => validateDummyPasswordHash(new TextDecoder('utf-8', { fatal: true }).decode(b)))
  await checkFile('ingress.sources.tlsCert', I.tlsCert, b => { if (!cert(b).checkHost('cleanops-b1-ingress')) throw new Error('SAN lacks cleanops-b1-ingress') })
  await checkFile('ingress.sources.tlsKey', I.tlsKey, b => { createPrivateKey(b) })
  await checkFile('ingress.sources.clientCa', I.clientCa, b => { cert(b, true) })
  await checkFile('ingress.sources.signingKey', I.signingKey, b => { if (createPrivateKey(b).asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519') })
  await checkFile('ingress.sources.pseudonymKey', I.pseudonymKey, b => { if (b.length !== 32) throw new Error('must be exactly 32 bytes') })
  await checkFile('integration.source', merged.integration?.source, b => {
    const expected = merged.integration?.sha256
    if (!expected) return 'OK(sha256 not set yet: use render-b1-integration output)'
    if (sha(b) !== expected) throw new Error('sha256 differs from integration.sha256')
  })

  // Semantic checks of values already present, with the code's own validators.
  const check = (label, fn) => { try { fn() } catch { out.invalid.push(label) } }
  const present = p => get(merged, p.split('.')) != null
  if (present('origin')) check('origin: must be an https origin', () => { const u = new URL(merged.origin); if (u.origin !== merged.origin || u.protocol !== 'https:') throw 0 })
  if (present('lifetimeMs')) check('lifetimeMs: 1..30000', () => { if (!Number.isSafeInteger(merged.lifetimeMs) || merged.lifetimeMs < 1 || merged.lifetimeMs > 30000) throw 0 })
  if (present('maximumCorpusBytes')) check('maximumCorpusBytes: 65..65536', () => { if (!Number.isSafeInteger(merged.maximumCorpusBytes) || merged.maximumCorpusBytes < 65 || merged.maximumCorpusBytes > 65536) throw 0 })
  if (present('maxEligibleTotpMethods')) check('maxEligibleTotpMethods: above the canonical response budget', () => validateTotpMethodLimit(merged.maxEligibleTotpMethods))
  if (present('catalog.keys')) check('catalog: rejected by validateInstallationKeys', () => validateInstallationKeys(merged.catalog))
  if (present('baoClientIdentity.certificateSha256')) check('baoClientIdentity.certificateSha256: 64 lowercase hex', () => { if (!/^[a-f0-9]{64}$/.test(merged.baoClientIdentity.certificateSha256)) throw 0 })
  if (present('ingress.proxyCertificateSha256')) check('ingress.proxyCertificateSha256: AA:BB:… (32 bytes)', () => { if (!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(merged.ingress.proxyCertificateSha256)) throw 0 })
  if (present('integration.sha256')) check('integration.sha256: 64 lowercase hex', () => { if (!/^[a-f0-9]{64}$/.test(merged.integration.sha256)) throw 0 })
  const metadataNeedsRepair = manifestMeta.uid !== 0 || manifestMeta.gid !== 999 || manifestMeta.mode !== 0o440
  if (metadataNeedsRepair)
    out.invalid.push(`installation.json metadata ${manifestMeta.uid}:${manifestMeta.gid} ${manifestMeta.mode.toString(8)} (loader requires 0:999 440; --apply sets it)`)

  const files = [...fileState.values()]
  let backup
  if (apply && out.fills.length) {
    const stamp = now().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
    backup = join(backupDir, `installation.json.${stamp}.bak`)
    const original = await fs.readFile(manifestPath)
    const b = await fs.open(backup, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400)
    try { await b.writeFile(original); await b.sync() } finally { await b.close() }
    const temp = join(packageDir, `.installation.json.${process.pid}.tmp`)
    const t = await fs.open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400)
    try {
      await t.chown(0, 999); await t.chmod(0o440)
      await t.writeFile(JSON.stringify(merged, null, 2) + '\n'); await t.sync()
    } catch (e) { await fs.unlink(temp).catch(() => {}); throw e } finally { await t.close() }
    await fs.rename(temp, manifestPath)
  } else if (apply && metadataNeedsRepair) { await fs.chown(manifestPath, 0, 999); await fs.chmod(manifestPath, 0o440) }
  const stillInvalid = out.invalid.filter(x => !(apply && x.startsWith('installation.json metadata')))
  const badFiles = files.filter(f => !f.status.startsWith('OK'))
  return {
    applied: apply && (out.fills.length > 0 || metadataNeedsRepair), backup,
    filled: out.fills.map(({ path, value, basis }) => ({ path, value: typeof value === 'object' ? '(contract block)' : value, basis })),
    pendingValues: out.pending, differsFromContract: out.differs, invalid: stillInvalid, files,
    ready: !out.pending.length && !out.differs.length && !stillInvalid.length && !badFiles.length,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [dir, ...flags] = process.argv.slice(2)
    const apply = flags.includes('--apply'), at = flags.indexOf('--backup-dir')
    if (flags.some((f, i) => !['--apply', '--backup-dir'].includes(f) && flags[i - 1] !== '--backup-dir')) throw refuse()
    const report = await completeB1Installation({ packageDir: dir, apply, backupDir: at >= 0 ? flags[at + 1] : undefined })
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.ready ? 0 : 1
  } catch { console.error('B1_INSTALLATION_COMPLETION_REFUSED: need an absolute package dir with a readable installation.json; --apply needs root and --backup-dir <absolute dir>'); process.exitCode = 2 }
}
