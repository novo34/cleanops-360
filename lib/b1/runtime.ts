import { closedBackend, createAuthHandler, AuthError } from './service.ts'

// Deliberately no runtime setter, seed or environment flag that installs grants/identities.
// A reviewed private identity/broker adapter will replace this boundary in a later increment.
export function runtimeHandler() {
  const origin = process.env.CLEANOPS_AUTH_ORIGIN
  if (!origin) throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')
  // Optional, exact JSON allowlist of Next listener URLs; no request header is trusted.
  // Invalid configuration fails closed through handleAuth/bootstrap callers.
  const internalOrigins: unknown = JSON.parse(process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS ?? '[]')
  if (!Array.isArray(internalOrigins) || !internalOrigins.every(value => typeof value === 'string')) throw new AuthError(503, 'AUTH_CONFIGURATION_REQUIRED')
  return createAuthHandler(closedBackend, origin, undefined, internalOrigins)
}
export async function handleAuth(request: Request, operation: string): Promise<Response> {
  try { return await runtimeHandler().handle(request, operation) }
  catch { return new Response(JSON.stringify({ error: { code: 'AUTH_DEPENDENCY_UNAVAILABLE', message: 'Autenticación no disponible.', details: [] }, correlation_id: crypto.randomUUID() }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Cookie' } }) }
}

