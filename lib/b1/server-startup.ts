/** Trusted B1 server bootstrap; never invoked from HTTP request data. */
import { assembleInstallationPrivateInputs, type InstallationBootstrapInputs } from './installation-bootstrap.ts'
import { prepareB1IngressListenerPlan } from './installation-config.ts'
import { createIngressIssuer } from './ingress-assertion.ts'
import { createForwardAuthHandler } from './ingress-forward-auth.ts'
import { resolveIngressBinding, startB1IngressListener } from './ingress-listener.ts'
import type { B1IngressPoolBinder } from './private-runtime.ts'
import { closeTrustedRuntime, installTrustedRuntime } from './runtime.ts'

type Issuer = ReturnType<typeof createIngressIssuer>
type Listener = Awaited<ReturnType<typeof startB1IngressListener>>

let started = false
let starting = false
let stopping = false
let disposal: (() => void) | undefined
let ingress: Readonly<{ listener: Listener; issuer: Issuer }> | undefined
let onSignal: (() => void) | undefined

/** Process termination is the only trigger; Next.js owns the HTTP server and exits
 * afterwards, so the shutdown here must only begin synchronously (listener first).
 */
function watchTermination() {
  onSignal = () => {
    // D4: B1_SHUTDOWN_COMPLETE is the only evidence that listener drain, pool close and key
    // zeroing finished. A process that exits (Next calls process.exit(143) after its own
    // server.close, without awaiting B1) without this line did NOT complete B1 shutdown.
    void stopTrustedB1Server().then(() => console.info('B1_SHUTDOWN_COMPLETE'), error => {
      if ((error as Error)?.message !== 'B1_SERVER_NOT_STARTED') console.error('B1_SHUTDOWN_INCOMPLETE')
    })
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
}
function unwatchTermination() {
  if (!onSignal) return
  process.off('SIGINT', onSignal)
  process.off('SIGTERM', onSignal)
  onSignal = undefined
}

/**
 * The only owner of the private runtime and its internal mTLS ingress. The ingress
 * is reviewed manifest data (never a selector from a request, query or environment
 * toggle); a private runtime without it is refused before any custody file is read.
 */
export async function startTrustedB1Server(spec: InstallationBootstrapInputs): Promise<void> {
  if (started || starting || stopping) throw new Error('B1_STARTUP_ALREADY_ATTEMPTED')
  starting = true
  let prepared: Awaited<ReturnType<typeof assembleInstallationPrivateInputs>> | undefined
  let runtimeInstalled = false
  let issuer: Issuer | undefined
  let listener: Listener | undefined
  try {
    // A private B1 server must always use the shared durable ingress binding.
    // Reject before reading custody files or opening connections.
    if (spec && typeof spec.bindIngress !== 'function') throw new Error('B1_INGRESS_BINDING_REQUIRED')
    // Never enable a private web runtime without its reviewed internal ingress.
    // This prevents a partially installed B1 service from going live.
    if (spec && !spec.ingress) throw new Error('B1_INGRESS_LISTENER_REQUIRED')
    prepared = await assembleInstallationPrivateInputs(spec)
    // The ingress repositories borrow the one canonical pool created by the runtime;
    // the reviewed private module and the issuer share exactly the same instances.
    let repositories: Parameters<B1IngressPoolBinder>[0] | undefined
    installTrustedRuntime(prepared.configuration, spec.requestScope, dependencies => {
      repositories = dependencies
      spec.bindIngress(dependencies)
    })
    runtimeInstalled = true
    if (!repositories) throw new Error('B1_INGRESS_BINDING_REQUIRED')

    const config = spec.ingress
    const audience = new URL(spec.inputs.origin).origin
    const plan = prepareB1IngressListenerPlan({
      binding: resolveIngressBinding(config.binding), port: config.port, allowedPaths: config.allowedPaths,
      issuer: config.issuer, audience, nextOrigin: audience,
      topology: 'shared-atomic-all-consumers',
      trust: {
        transport: 'pinned-mutual-tls', forwardedHeaders: 'reconstructed-single-hop',
        assertion: 'ed25519-request-bound', proxyCertificateSha256: config.proxyCertificateSha256,
        evidenceReference: config.evidenceReference, tlsAuthorizationReference: config.tlsAuthorizationReference,
      },
      dependencies: repositories,
      // Ready only while the server owns an installed runtime; close reuses this owner.
      lifecycle: { ready: async () => started && !stopping, close: stopTrustedB1Server, drainTimeoutMs: config.drainTimeoutMs },
    }).configuration
    issuer = createIngressIssuer({
      issuer: plan.issuer, audience: plan.audience, contextLifetimeMs: config.contextLifetimeMs,
      maximumBodyBytes: config.maximumBodyBytes, bodyTimeoutMs: config.timeoutMs, clock: Date.now,
      privateKey: prepared.ingress.signingKey, pseudonymKey: prepared.ingress.pseudonymKey,
    })
    listener = await startB1IngressListener({
      binding: plan.binding, port: plan.port, tls: prepared.ingress.tls,
      allowedPaths: plan.allowedPaths, ready: plan.lifecycle.ready, drainTimeoutMs: plan.lifecycle.drainTimeoutMs,
      handle: createForwardAuthHandler({
        issuer, audience: plan.audience, proxyCertificateSha256: plan.trust.proxyCertificateSha256,
        maximumBodyBytes: config.maximumBodyBytes, timeoutMs: config.timeoutMs,
      }),
    })
    ingress = Object.freeze({ listener, issuer })
    disposal = prepared.dispose
    started = true
    prepared = undefined
    watchTermination()
  } catch (error) {
    // Failure after pool creation must not leak an active backend, signer or TLS buffers.
    if (listener) {
      try { await listener.close() } catch { /* retain original startup error */ }
    }
    issuer?.dispose()
    ingress = undefined
    if (runtimeInstalled) {
      try { await closeTrustedRuntime() } catch { /* retain original startup error */ }
    }
    throw error
  } finally {
    prepared?.dispose()
    starting = false
  }
}

/** Shutdown order: deny and drain ingress, drain HTTP requests/pool, then zero keys and TLS. */
export async function stopTrustedB1Server(): Promise<void> {
  if (starting || stopping || !started) throw new Error('B1_SERVER_NOT_STARTED')
  stopping = true
  started = false
  unwatchTermination()
  const current = ingress
  ingress = undefined
  try {
    try { await current?.listener.close() }
    finally { await closeTrustedRuntime() }
  } finally {
    current?.issuer.dispose()
    disposal?.()
    disposal = undefined
    stopping = false
  }
}
