/** B1 operator-only staging entrypoint. No HTTP route, public enrollment or privilege grants.
 * Runs inside the reviewed image with separate, root-only operator inputs:
 *   node scripts/b1-private-operator.mjs /run/cleanops-b1-operator
 * The directory must be owned by root, mode 0700. request.json and postgres.password
 * must be root:root 0400. Result is sealed as result.json root:root 0600, O_EXCL.
 * Only the first-actor ceremony is supported (there is no ingress device pass).
 * No secret or credential is written to stdout, stderr, env or process arguments.
 * The actual SQL migrations, LOGIN membership and approvals are external prerequisites.
 */
import { constants } from 'node:fs'
import { validateRequest, publicState } from './b1-private-operator-input.mjs'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readTrustedPrivateFile } from '../lib/b1/private-file.ts'
import { loadReviewedB1Installation } from '../lib/b1/reviewed-site-installation.ts'
import { assembleInstallationPrivateInputs } from '../lib/b1/installation-bootstrap.ts'
import { selectAuthBackend } from '../lib/b1/private-runtime.ts'
import { createPgIdentityPool } from '../lib/b1/pg-identity-driver.ts'
import { createPrivatePgPassword } from '../lib/b1/private-material.ts'

const refused = () => new Error('B1_OPERATOR_UNAVAILABLE')

const operatorManifestPath = '/run/cleanops-b1-private/installation.json'
/** Root operator may read root:group manifest regardless of its *reviewed* non-root
 * consumer group. The candidate GID comes from filesystem metadata, never
 * request.json, environment or a caller-supplied value.
 */
export async function readOperatorManifestSource(path = operatorManifestPath) {
  const stat = await fs.lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== 0 ||
      !Number.isSafeInteger(stat.gid) || stat.gid <= 0 || (stat.mode & 0o7777) !== 0o440 ||
      stat.size < 1 || stat.size > 65536) throw refused()
  const source = Object.freeze({ path, uid: 0, gid: stat.gid, mode: 0o440, maxBytes: 65536 })
  const raw = await readTrustedPrivateFile(source)
  try {
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
    if (manifest?.sink?.gid !== stat.gid || manifest.sink.directoryGid !== stat.gid ||
        !Number.isSafeInteger(manifest.sink.uid) || manifest.sink.uid <= 0 ||
        manifest.sink.directoryUid !== manifest.sink.uid) throw refused()
  } finally { raw.fill(0) }
  return source
}
export async function dispatchPrivateOperator(request, prepared, operatorPool, makeRuntime = selectAuthBackend) {
  let runtime
  try {
    runtime = makeRuntime({ kind: 'private', configuration: prepared.configuration }, () => {})
    if (!request.operation.startsWith('first-actor.') || typeof runtime.firstActor !== 'function') throw refused()
    const ceremony = runtime.firstActor(request.manifest, operatorPool, request.keyVersion)
    let state
    switch (request.operation) {
      case 'first-actor.prepare':
        state = await ceremony.prepare(request.password)
        // Explicit projection required: privateArtifact intentionally disables JSON serialization.
        return { ...publicState(state), ...(typeof state.capability === 'string' ? {
          capability: state.capability, provisioningUri: state.provisioningUri, recoveryCodes: state.recoveryCodes,
        } : {}) }
      case 'first-actor.confirm': state = await ceremony.confirm(request.capability, request.proof, true); break
      case 'first-actor.commit': state = await ceremony.commit(request.capability); break
      case 'first-actor.status': state = await ceremony.status(); break
      case 'first-actor.abort': state = await ceremony.abort(request.reason); break
      default: throw refused()
    }
    return publicState(state)
  } finally {
    await runtime?.close()
  }
}

export async function runPrivateOperator(directory) {
  if (process.getuid?.() !== 0 || directory !== '/run/cleanops-b1-operator') throw refused()
  const st = await fs.lstat(directory)
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== 0 || (st.mode & 0o7777) !== 0o700) throw refused()
  const input = join(directory, 'request.json')
  const password = join(directory, 'postgres.password')
  const output = join(directory, 'result.json')
  const requestBytes = await readTrustedPrivateFile({ path: input, uid: 0, gid: 0, mode: 0o400, maxBytes: 65536 })
  let request
  try { request = validateRequest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(requestBytes))) }
  finally { requestBytes.fill(0) }
  // The output slot is reserved BEFORE any SQL write. Never overwrite an existing receipt.
  const resultFile = await fs.open(output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  let applied = false
  let installation, prepared, operatorPool
  try {
    await resultFile.chown(0, 0)
    await resultFile.chmod(0o600)
    const manifestSource = await readOperatorManifestSource()
    installation = await loadReviewedB1Installation(manifestSource)
    // The reviewed reader GID is also verified on disk before any operator
    // database activity. No fallback to another private package is allowed.
    if (installation.inputs.sink.gid !== manifestSource.gid) throw refused()
    prepared = await assembleInstallationPrivateInputs(installation)
    const operatorConfig = { ...prepared.configuration.postgres, loginRole: request.operatorLoginRole,
      password: createPrivatePgPassword({ path: password, uid: 0, gid: 0, mode: 0o400, maxBytes: 4096 }),
      maxConnections: 1 }
    operatorPool = createPgIdentityPool(operatorConfig)
    applied = true // from here SQL may commit; a failed output requires explicit recovery
    const value = await dispatchPrivateOperator(request, prepared, operatorPool)
    await resultFile.writeFile(JSON.stringify(value) + '\n')
    await resultFile.sync()
  } catch {
    if (!applied) await fs.unlink(output).catch(() => {})
    throw refused() // never stringify errors that could include credentials
  } finally {
    await operatorPool?.end().catch(() => {})
    prepared?.dispose()
    await resultFile.close()
  }
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) {
    console.error('B1_OPERATOR_UNAVAILABLE')
    process.exitCode = 2
  } else {
    try {
      await runPrivateOperator(process.argv[2])
      console.log('B1_OPERATOR_RECEIPT_SEALED')
    } catch {
      console.error('B1_OPERATOR_UNAVAILABLE; check sealed result state and operator audit before retry')
      process.exitCode = 2
    }
  }
}
