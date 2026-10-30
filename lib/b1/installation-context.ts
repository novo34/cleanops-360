/** Private ingress integration. A resolver must authenticate metadata before returning it. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { AuthError } from './service.ts'
import { prepareSessionLabels } from './ceremony-preparation.ts'

export type InstallationRequestContext = Readonly<{
  network: Buffer; device: Buffer
  labels: Readonly<{ device: string; browser: string }>
}>
export type InstallationRequestScope = (request: Request, work: () => Promise<Response>) => Promise<Response>
export type InstallationIntegration = Readonly<{
  normalizeEmail(email: string): string
  resolveRequestContext(request: Request): Promise<InstallationRequestContext>
}>
const unavailable = () => new AuthError(503, 'AUTH_DEPENDENCY_UNAVAILABLE')

/** Isolates concurrent requests; no global last-request state or startup dimensions. */
export function createInstallationContext(integration: InstallationIntegration) {
  if (!integration || typeof integration.normalizeEmail !== 'function' ||
      typeof integration.resolveRequestContext !== 'function') throw unavailable()
  const storage = new AsyncLocalStorage<InstallationRequestContext & { active: boolean }>()
  const current = () => { const value = storage.getStore(); if (!value?.active) throw unavailable(); return value }
  return Object.freeze({
    normalizeEmail(email: string) {
      const normalized = integration.normalizeEmail(email)
      if (typeof normalized !== 'string' || !normalized.length || /[\p{Cc}\p{Cf}]/u.test(normalized)) throw unavailable()
      return normalized
    },
    transport() { const value = current(); return { network: Buffer.from(value.network), device: Buffer.from(value.device) } },
    sessionLabels() { return current().labels },
    async requestScope(request: Request, work: () => Promise<Response>) {
      // Give the resolver a clone so validation cannot consume the handler's body.
      const value = await integration.resolveRequestContext(request.clone())
      if (!value || ![value.network, value.device].every(b => Buffer.isBuffer(b) && b.length === 32)) throw unavailable()
      const context = { network: Buffer.from(value.network), device: Buffer.from(value.device), labels: prepareSessionLabels(value.labels), active: true }
      try { return await storage.run(context, work) }
      finally { context.active = false; context.network.fill(0); context.device.fill(0) }
    },
  })
}
