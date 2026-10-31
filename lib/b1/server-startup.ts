/** Trusted B1 server bootstrap; never invoked from HTTP request data. */
import { assembleInstallationPrivateInputs, type InstallationBootstrapInputs } from './installation-bootstrap.ts'
import { closeTrustedRuntime, installTrustedRuntime } from './runtime.ts'
import { startB1IngressListener, type B1IngressListenerInputs } from './ingress-listener.ts'

let started = false
let starting = false
let stopping = false
let disposal: (() => void) | undefined
let ingress: Awaited<ReturnType<typeof startB1IngressListener>> | undefined

/**
 * Only an explicitly reviewed server owner may supply the internal mTLS ingress.
 * This is not selected by a request, query parameter, or environment toggle.
 * Without an approved ingress specification the listener is not opened.
 */
export async function startTrustedB1Server(
  spec: InstallationBootstrapInputs,
  ingressSpec?: B1IngressListenerInputs,
): Promise<void> {
  if (started || starting || stopping) throw new Error('B1_STARTUP_ALREADY_ATTEMPTED')
  starting = true
  let prepared: Awaited<ReturnType<typeof assembleInstallationPrivateInputs>> | undefined
  let runtimeInstalled = false
  try {
    prepared = await assembleInstallationPrivateInputs(spec)
    // Durable ingress requires a canonical PG pool binding; never fall back.
    if (ingressSpec && typeof spec.bindIngress !== 'function') throw new Error('B1_INGRESS_BINDING_REQUIRED')
    installTrustedRuntime(prepared.configuration, spec.requestScope, spec.bindIngress)
    runtimeInstalled = true
    if (ingressSpec) {
      // The listener is not externally ready until the server is installed.
      ingress = await startB1IngressListener({
        ...ingressSpec,
        ready: async () => started && await ingressSpec.ready() === true,
      })
    }
    disposal = prepared.dispose
    started = true
    prepared = undefined
  } catch (error) {
    // Failure after pool creation must not leak an active backend or TLS buffers.
    if (ingress) {
      try { await ingress.close() } catch { /* retain original startup error */ }
      ingress = undefined
    }
    if (runtimeInstalled) {
      try { await closeTrustedRuntime() } catch { /* retain original startup error */ }
    }
    throw error
  } finally {
    prepared?.dispose()
    starting = false
  }
}

/** Shutdown order: stop ingress, drain HTTP requests/pool, then zero TLS. */
export async function stopTrustedB1Server(): Promise<void> {
  if (starting || stopping || !started) throw new Error('B1_SERVER_NOT_STARTED')
  stopping = true
  started = false
  const listener = ingress
  ingress = undefined
  try {
    try { await listener?.close() }
    finally { await closeTrustedRuntime() }
  } finally {
    disposal?.()
    disposal = undefined
    stopping = false
  }
}
