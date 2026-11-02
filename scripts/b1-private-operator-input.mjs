/** Pure validation and public redaction for the private B1 operator. No backend imports. */
const refused = () => new Error('B1_OPERATOR_UNAVAILABLE')
const own = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys

export function validateRequest(request) {
  if (!request || request.version !== 1 || typeof request.operatorLoginRole !== 'string' ||
      !/^[a-z_][a-z0-9_]{0,62}$/.test(request.operatorLoginRole) || typeof request.operation !== 'string') throw refused()
  const expected = {
    'first-actor.prepare': 'keyVersion,manifest,operation,operatorLoginRole,password,version',
    'first-actor.confirm': 'capability,keyVersion,manifest,operation,operatorLoginRole,proof,recoveryAcknowledged,version',
    'first-actor.commit': 'capability,keyVersion,manifest,operation,operatorLoginRole,version',
    'first-actor.status': 'keyVersion,manifest,operation,operatorLoginRole,version',
    'first-actor.abort': 'keyVersion,manifest,operation,operatorLoginRole,reason,version',
    'device.issue': 'authorizationReference,browser,device,lifetimeMs,operation,operatorLoginRole,reference,version',
    'device.revoke': 'authorizationReference,id,operation,operatorLoginRole,revision,version',
  }[request.operation]
  if (!expected || !own(request, expected)) throw refused()
  if (request.operation.startsWith('first-actor.')) {
    if (!request.manifest || typeof request.keyVersion !== 'string' || !request.keyVersion.length) throw refused()
    if (request.operation === 'first-actor.prepare' && (typeof request.password !== 'string' || !request.password.length)) throw refused()
    if (request.operation === 'first-actor.confirm' && (typeof request.capability !== 'string' ||
        typeof request.proof !== 'string' || request.recoveryAcknowledged !== true)) throw refused()
    if (request.operation === 'first-actor.abort' && !['DELIVERY_LOST','EXPIRED','ATTEMPTS_EXHAUSTED','OPERATOR_CANCELLED'].includes(request.reason)) throw refused()
  }
  return request
}

export function publicState(result) {
  if (!result || typeof result.state !== 'string' || !['ABSENT','RESERVED','PREPARED','CONFIRMED','COMMITTED','EXPIRED','ABORTED'].includes(result.state)) throw refused()
  const state = { state: result.state }
  if (Number.isSafeInteger(result.generation)) state.generation = result.generation
  if (typeof result.abortReason === 'string') state.abortReason = result.abortReason
  // Never serialize arbitrary SQL receipt or the privateArtifact object.
  return state
}

/** Resolve the only audience the reviewed installer actually provides. */
export function operatorIngressScope(installation) {
  const issuer = installation?.ingress?.issuer
  const audience = installation?.inputs?.origin
  if (typeof issuer !== 'string' || !issuer || typeof audience !== 'string') throw refused()
  try {
    const u = new URL(audience)
    if (u.protocol !== 'https:' || u.origin !== audience) throw refused()
  } catch { throw refused() }
  return Object.freeze({ issuer, audience })
}
