import { selectAuthBackend, type PrivateRuntimeConfiguration } from './private-runtime.ts'
import { closedBackend, createAuthHandler, AuthError, type Backend } from './service.ts'
import type { InstallationRequestScope } from './installation-context.ts'

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
// Next emits separate instrumentation, proxy and route bundles. Module-local
// variables would give each bundle a different backend. One Node-process slot
// preserves startup ownership and the same drain counter across those bundles.
const runtimeKey = Symbol.for('cleanops.b1.trusted-runtime')
type RuntimeState = {
  activeRuntime?: RuntimeComposition
  activeRequestScope?: InstallationRequestScope
  runtimeClosing: boolean
  activeRequests: number
  drain?: () => void
}
const owner = globalThis as typeof globalThis & { [runtimeKey]?: RuntimeState }
const state = owner[runtimeKey] ??= { runtimeClosing: false, activeRequests: 0 }

export function installTrustedRuntime(configuration: PrivateRuntimeConfiguration, requestScope?: InstallationRequestScope): void {
  if (state.activeRuntime || state.runtimeClosing || state.activeRequests !== 0) throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')
  if (requestScope !== undefined && typeof requestScope !== 'function') throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')
  const candidate = composeTrustedRuntime({ kind: 'private', configuration })
  state.activeRuntime = candidate
  state.activeRequestScope = requestScope
}

/** Called by server shutdown; never closes a pool while a request uses it. */
export async function closeTrustedRuntime(): Promise<void> {
  if (state.runtimeClosing) throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  state.runtimeClosing = true
  const previous = state.activeRuntime
  try {
    // Keep ownership until outstanding requests release it, but deny new ones.
    if (state.activeRequests !== 0) await new Promise<void>(resolve => { state.drain = resolve })
    if (previous) await previous.close()
  } finally {
    state.activeRuntime = undefined
    state.activeRequestScope = undefined
    state.drain = undefined
  }
}

/** HTTP routes remain closed until trusted startup explicitly installs a runtime. */
export function runtimeHandler() {
  if (state.runtimeClosing) throw new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')
  return (state.activeRuntime ?? composeTrustedRuntime({ kind: 'closed' })).handler
}

export async function handleAuth(request: Request, operation: string): Promise<Response> {
  let acquired = false
  try {
    const handler = runtimeHandler()
    state.activeRequests++
    acquired = true
    const work = () => handler.handle(request, operation)
    return await (state.activeRequestScope ? state.activeRequestScope(request, work) : work())
  }
  catch { return new Response(JSON.stringify({ error: { code: 'AUTH_DEPENDENCY_UNAVAILABLE', message: 'Autenticación no disponible.', details: [] }, correlation_id: crypto.randomUUID() }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Cookie' } }) }
  finally {
    if (acquired && --state.activeRequests === 0 && state.drain) state.drain()
  }
}

