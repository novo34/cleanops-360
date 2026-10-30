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

/** HTTP routes deliberately keep the closed selection until reviewed activation. */
export function runtimeHandler() {
  return composeTrustedRuntime({ kind: 'closed' }).handler
}

export async function handleAuth(request: Request, operation: string): Promise<Response> {
  try { return await runtimeHandler().handle(request, operation) }
  catch { return new Response(JSON.stringify({ error: { code: 'AUTH_DEPENDENCY_UNAVAILABLE', message: 'Autenticación no disponible.', details: [] }, correlation_id: crypto.randomUUID() }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Cookie' } }) }
}

