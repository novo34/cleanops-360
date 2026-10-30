/** Trusted B1 server bootstrap; never invoked from HTTP request data. */
import { assembleInstallationPrivateInputs, type InstallationBootstrapInputs } from './installation-bootstrap.ts'
import { closeTrustedRuntime, installTrustedRuntime } from './runtime.ts'

let started = false
let starting = false
let disposal: (() => void) | undefined

/**
 * Startup owner passes an explicit, reviewed, private-file specification.
 * This is intentionally NOT connected to a public route, process flag or env switch.
 * Keep the certificate buffers until the pool and client close: zeroing them
 * immediately after install could invalidate a subsequent TLS handshake.
 */
export async function startTrustedB1Server(spec: InstallationBootstrapInputs): Promise<void> {
  if (started || starting) throw new Error('B1_STARTUP_ALREADY_ATTEMPTED')
  starting = true
  let prepared: Awaited<ReturnType<typeof assembleInstallationPrivateInputs>> | undefined
  try {
    prepared = await assembleInstallationPrivateInputs(spec)
    installTrustedRuntime(prepared.configuration, spec.requestScope)
    disposal = prepared.dispose
    started = true
    prepared = undefined
  } finally {
    prepared?.dispose()
    starting = false
  }
}

/** Process shutdown: drain HTTP requests, close PG pool, then zero private TLS. */
export async function stopTrustedB1Server(): Promise<void> {
  if (starting || !started) throw new Error('B1_SERVER_NOT_STARTED')
  started = false
  try { await closeTrustedRuntime() }
  finally { disposal?.(); disposal = undefined }
}
