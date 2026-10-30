import { selectAuthBackend, type PrivateRuntimeConfiguration } from './private-runtime.ts'
import { closedBackend, createAuthHandler, AuthError, type Backend } from './service.ts'

export type RuntimeSelection = Readonly<{ kind: 'closed' } | {
  kind: 'private'; configuration: PrivateRuntimeConfiguration
}>

export type RuntimeComposition = Readonly<{
  backend: Backend
  handler: ReturnType<typeof createAuthHandler>
  close(): Promise<void>
  firstActor?: ReturnType<typeof selectAuthBackend>['firstActor']
}>

/**
 * Trusted server composition only. Callers choose a backend in reviewed code;
 * this API is never fed request data or an environment switch. Hold a private
 * composition for the server lifetime and call close() during shutdown.
 */
export function composeTrustedRuntime(selection: RuntimeSelection = { kind: 'closed' }): RuntimeComposition {
  const selected = selectAuthBackend(selection)
  if (selection.kind === 'private') {
    if (!selected.handler) throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')
    return { ...selected, handler: selected.handler }
  }

  const origin = process.env.CLEANOPS_AUTH_ORIGIN
  if (!origin) throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')
  // Optional, exact JSON allowlist of Next listener URLs; no request header is trusted.
  // Invalid configuration fails closed through handleAuth/bootstrap callers.
  const internalOrigins: unknown = JSON.parse(process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS ?? '[]')
  if (!Array.isArray(internalOrigins) || !internalOrigins.every(value => typeof value === 'string')) throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')
  return { ...selected, backend: closedBackend, handler: createAuthHandler(closedBackend, origin, undefined, internalOrigins) }
}

/**
 * Server-owned lifecycle slot. No HTTP route, request data or environment flag
 * can select the backend. A reviewed startup module must explicitly install it.
 * Closed is the permanent fallback until that module is wired and approved.
 */
let activeRuntime: RuntimeComposition | undefined
let runtimeClosing = false
let activeRequests = 0
let drain: (() => void) | undefined

export function installTrustedRuntime(configuration: PrivateRuntimeConfiguration): void {
  if (activeRuntime || runtimeClosing || activeRequests !== 0) throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')
  const candidate = composeTrustedRuntime({ kind: 'private', configuration })
  activeRuntime = candidate
}

/** Called by server shutdown; never closes a pool while a request uses it. */
export async function closeTrustedRuntime(): Promise<void> {
  if (runtimeClosing) throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  runtimeClosing = true
  const previous = activeRuntime
  activeRuntime = undefined
  try {
    if (activeRequests !== 0) await new Promise<void>(resolve => { drain = resolve })
    if (previous) await previous.close()
  } finally { drain = undefined }
}

/** HTTP routes remain closed until trusted startup explicitly installs a runtime. */
export function runtimeHandler() {
  if (runtimeClosing) throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  return (activeRuntime ?? composeTrustedRuntime({ kind: 'closed' })).handler
}

export async function handleAuth(request: Request, operation: string): Promise<Response> {
  let acquired = false
  try {
    const handler = runtimeHandler()
    activeRequests++
    acquired = true
    return await handler.handle(request, operation)
  }
  catch { return new Response(JSON.stringify({ error: { code: 'AUTH_DEPENDENCY_UNAVAILABLE', message: 'Autenticación no disponible.', details: [] }, correlation_id: crypto.randomUUID() }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Cookie' } }) }
  finally {
    if (acquired && --activeRequests === 0 && drain) drain()
  }
}

