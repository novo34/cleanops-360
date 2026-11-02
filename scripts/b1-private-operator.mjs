/** B1 operator-only staging entrypoint. No HTTP route, public enrollment or privilege grants.
 * Runs inside the reviewed image with separate, root-only operator inputs:
 *   node scripts/b1-private-operator.mjs /run/cleanops-b1-operator
 * The directory must be owned by root, mode 0700. request.json and postgres.password
 * must be root:root 0400. Result is sealed as result.json root:root 0600, O_EXCL.
 * No secret or credential is written to stdout, stderr, env or process arguments.
 * The actual SQL migrations, LOGIN membership and approvals are external prerequisites.
 */
import { constants } from 'node:fs'
import { validateRequest, publicState, operatorIngressScope } from './b1-private-operator-input.mjs'
import { createPrivateKey, createPublicKey } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readTrustedPrivateFile } from '../lib/b1/private-file.ts'
import { loadReviewedB1Installation } from '../lib/b1/reviewed-site-installation.ts'
import { assembleInstallationPrivateInputs } from '../lib/b1/installation-bootstrap.ts'
import { selectAuthBackend } from '../lib/b1/private-runtime.ts'
import { createPgIdentityPool } from '../lib/b1/pg-identity-driver.ts'
import { createPrivatePgPassword } from '../lib/b1/private-material.ts'
import { createDurableCandidateIssuer, credentialCookie } from '../lib/b1/ingress-assertion.ts'

const refused = () => new Error('B1_OPERATOR_UNAVAILABLE')

const manifestSource = Object.freeze({ path: '/run/cleanops-b1-private/installation.json', uid: 0, gid: 999, mode: 0o440, maxBytes: 65536 })
export async function dispatchPrivateOperator(request, installation, prepared, operatorPool, operatorSigningKey, makeRuntime = selectAuthBackend) {
  let runtime
  let issuer
  try {
    let repositories
    runtime = makeRuntime({ kind: 'private', configuration: prepared.configuration }, dependencies => {
      repositories = dependencies
    })
    if (request.operation.startsWith('first-actor.')) {
      if (typeof runtime.firstActor !== 'function') throw refused()
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
    }
    if (!repositories?.credentials?.read || typeof runtime.ingressOperator !== 'function') throw refused()
    const operator = runtime.ingressOperator(operatorPool)
    const scope = operatorIngressScope(installation)
    if (request.operation === 'device.revoke') {
      await operator.revoke({ scope: { ...scope, id: request.id }, expectedRevision: request.revision,
        authorizationReference: request.authorizationReference })
      return { state: 'REVOKED' }
    }
    if (request.operation !== 'device.issue' || !operatorSigningKey) throw refused()
    issuer = createDurableCandidateIssuer({
      issuer: scope.issuer, audience: scope.audience,
      maximumDeviceLifetimeMs: installation.ingress.maximumDeviceLifetimeMs,
      contextLifetimeMs: installation.ingress.contextLifetimeMs,
      maximumBodyBytes: installation.ingress.maximumBodyBytes,
      bodyTimeoutMs: installation.ingress.timeoutMs, clock: Date.now,
      privateKey: operatorSigningKey, pseudonymKey: prepared.ingress.pseudonymKey,
      credentials: { read: repositories.credentials.read, enroll: operator.enroll,
        revoke: operator.revoke, recover: operator.recover },
    })
    const credential = await issuer.issueDeviceCredential(
      { device: request.device, browser: request.browser }, request.lifetimeMs,
      { reference: request.reference, authorizationReference: request.authorizationReference }
    )
    // The caller must install as Secure, HttpOnly, SameSite=Strict, Path=/ over HTTPS.
    // Do not print or store this token in logs. No other process may read the sealed output.
    const tokenParts = credential.split('.')
    if (tokenParts.length !== 3 || tokenParts[0] !== 'b1-device-v1') throw refused()
    const id = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString('utf8')).id
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id)) throw refused()
    return { state: 'ENROLLED', id, cookieName: credentialCookie, cookieValue: credential,
      cookieAttributes: 'Secure; HttpOnly; SameSite=Strict; Path=/' }
  } finally {
    issuer?.dispose()
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
  let installation, prepared, operatorPool, operatorSigningKey
  try {
    await resultFile.chown(0, 0)
    await resultFile.chmod(0o600)
    installation = await loadReviewedB1Installation(manifestSource)
    prepared = await assembleInstallationPrivateInputs(installation)
    const operatorConfig = { ...prepared.configuration.postgres, loginRole: request.operatorLoginRole,
      password: createPrivatePgPassword({ path: password, uid: 0, gid: 0, mode: 0o400, maxBytes: 4096 }),
      maxConnections: 1 }
    operatorPool = createPgIdentityPool(operatorConfig)
    // The operator's signer is a separately custodied root-only copy, never
    // the group-readable signer mounted into the web runtime.
    if (request.operation === 'device.issue') {
      const signingBytes = await readTrustedPrivateFile({ path: join(directory, 'ingress-signing.pem'),
        uid: 0, gid: 0, mode: 0o400, maxBytes: 65536 })
      try { operatorSigningKey = createPrivateKey(signingBytes) }
      finally { signingBytes.fill(0) }
      if (operatorSigningKey.asymmetricKeyType !== 'ed25519' ||
          !createPublicKey(operatorSigningKey).equals(createPublicKey(prepared.ingress.signingKey))) throw refused()
    }
    applied = true // from here SQL may commit; a failed output requires explicit recovery
    const value = await dispatchPrivateOperator(request, installation, prepared, operatorPool, operatorSigningKey)
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
