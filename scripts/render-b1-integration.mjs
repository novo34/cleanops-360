/** Offline: renders the reviewed private `integration.mjs` for the B1 private package.
 * Reuses renderDurablePrivateIntegration and the shared parameters of installation.json.
 * No database, network, Docker, key generation or approval creation. Prints only a digest.
 *
 *   node --experimental-strip-types scripts/render-b1-integration.mjs \
 *     <package-dir> <email-report.json> <email-approval.json> <uid> <gid> <0400|0440|0600>
 * <package-dir> holds the filled installation.json (root:999 0440). The last three arguments
 * are the ownership of the report and approval files. Must run as root (the module is chowned
 * root:999 0440) on a host path outside the checkout; use the printed sha256 as integration.sha256.
 */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto'
import { isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readTrustedPrivateFile } from '../lib/b1/private-file.ts'
import { renderDurablePrivateIntegration } from '../lib/b1/integration-candidate.ts'
import { assertIngressProtocolOptions } from '../lib/b1/ingress-assertion.ts'

const repository = fileURLToPath(new URL('../', import.meta.url))
const MOUNT = '/run/cleanops-b1-private/'
// Path of the reviewed factory inside the immutable web image (Dockerfile WORKDIR /app).
const IMAGE_FACTORY = 'file:///app/lib/b1/integration-candidate.ts'
const fail = () => new Error('B1_INTEGRATION_RENDER_REFUSED')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const json = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))

export async function renderB1Integration({ packageDir, manifestSource, report, approval, factoryUrl = IMAGE_FACTORY }) {
  const outside = path => isAbsolute(path) && !path.split('/').includes('..') && (relative(repository, path).startsWith('../') || relative(repository, path) === '..')
  if (!outside(packageDir) || !outside(manifestSource?.path ?? '') || process.getuid?.() !== 0) throw fail()
  // Manifest paths are container paths; on the host they live under the package directory.
  const host = path => {
    if (typeof path !== 'string') throw fail()
    if (path.startsWith(MOUNT)) return join(packageDir, path.slice(MOUNT.length))
    if (path.startsWith(packageDir + '/')) return path
    throw fail()
  }
  const buffers = []
  const read = async source => { const b = await readTrustedPrivateFile(source); buffers.push(b); return b }
  let written
  try {
    const m = json(await read(manifestSource))
    if (m?.version !== 2 || !m.ingress || !m.integration?.source || typeof m.origin !== 'string') throw fail()
    const source = m.integration.source
    // One numeric, owner-reviewed identity for the Agent sink, web and module.
    const sinkGid = m.sink?.gid
    if (!Number.isSafeInteger(sinkGid) || sinkGid <= 0 ||
        !Number.isSafeInteger(m.sink?.uid) || m.sink.uid <= 0 ||
        m.sink.directoryGid !== sinkGid || m.sink.directoryUid !== m.sink.uid ||
        manifestSource.uid !== 0 || manifestSource.gid !== sinkGid || manifestSource.mode !== 0o440 ||
        source.uid !== 0 || source.gid !== sinkGid || source.mode !== 0o440) throw fail()
    const audience = new URL(m.origin).origin
    if (audience !== m.origin || !audience.startsWith('https://')) throw fail()
    // Only the public half is derived; the private key never leaves this process.
    const signing = m.ingress.sources?.signingKey
    const privateKey = createPrivateKey(await read({ ...signing, path: host(signing.path) }))
    if (privateKey.asymmetricKeyType !== 'ed25519') throw fail()
    const publicKey = createPublicKey(privateKey)
    // The same values the listener signs with (server-startup.ts), never retyped here.
    const verifier = { issuer: m.ingress.issuer, audience,
      contextLifetimeMs: m.ingress.contextLifetimeMs, maximumBodyBytes: m.ingress.maximumBodyBytes,
      bodyTimeoutMs: m.ingress.timeoutMs, internalOrigins: m.internalOrigins,
      clock: Date.now, publicKey, topology: 'shared-atomic-all-consumers' }
    // Canonical bounds validation (lifetime, body size, timeout); builds no durable state.
    assertIngressProtocolOptions(verifier)
    const code = renderDurablePrivateIntegration(factoryUrl, {
      report: json(await read(report)), approval: json(await read(approval)), verifier })
    const bytes = Buffer.from(code, 'utf8')
    if (bytes.length > source.maxBytes) throw fail()
    const target = host(source.path)
    if (!outside(target)) throw fail()
    const handle = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400)
    written = target
    try {
      await handle.chown(0, sinkGid); await handle.chmod(0o440)
      await handle.writeFile(bytes); await handle.sync()
    } finally { await handle.close() }
    // Read back through the same strict reader the real loader uses.
    const confirmed = await read({ ...source, path: target })
    if (sha256(confirmed) !== sha256(bytes)) throw fail()
    written = undefined
    return { path: source.path, sha256: sha256(bytes), bytes: bytes.length, manifestMatches: m.integration.sha256 === sha256(bytes) }
  } catch {
    if (written) await fs.unlink(written).catch(() => {})
    throw fail()
  } finally { buffers.forEach(b => b.fill(0)) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [dir, reportPath, approvalPath, uid, gid, mode, ...extra] = process.argv.slice(2)
    if (extra.length || !/^\d+$/.test(uid ?? '') || !/^\d+$/.test(gid ?? '') || !['0400', '0440', '0600'].includes(mode)) throw fail()
    const owner = { uid: Number(uid), gid: Number(gid), mode: Number.parseInt(mode, 8), maxBytes: 65536 }
    // The report/approval owner is supplied by the operator. The manifest
    // belongs to root:<reviewed sink group>, which may be different.
    const manifestPath = join(dir, 'installation.json')
    const stat = await fs.lstat(manifestPath)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== 0 ||
        !Number.isSafeInteger(stat.gid) || stat.gid <= 0 || (stat.mode & 0o7777) !== 0o440) throw fail()
    const result = await renderB1Integration({ packageDir: dir,
      manifestSource: { path: manifestPath, uid: 0, gid: stat.gid, mode: 0o440, maxBytes: 65536 },
      report: { ...owner, path: reportPath }, approval: { ...owner, path: approvalPath } })
    console.log(JSON.stringify(result, null, 2))
    if (!result.manifestMatches) console.error('Set integration.sha256 in installation.json to the digest above before activation.')
  } catch {
    console.error('B1_INTEGRATION_RENDER_REFUSED: need root, an absolute package dir outside the checkout with installation.json, private report/approval files and a valid manifest')
    process.exitCode = 2
  }
}
