/** Private-module factory, deliberately absent from application startup. */
import { createApprovedEmailNormalizer, type EmailCompatibilityReport } from './email-normalization.ts'
import { createCandidateVerifier } from './ingress-assertion.ts'
import type { InstallationIntegration } from './installation-context.ts'

export function createCandidateIntegration(options: Readonly<{
  report: EmailCompatibilityReport
  approval: Parameters<typeof createApprovedEmailNormalizer>[1]
  verifier: Parameters<typeof createCandidateVerifier>[0]
}>): InstallationIntegration {
  const normalizeEmail = createApprovedEmailNormalizer(options.report, options.approval)
  const verifier = createCandidateVerifier(options.verifier)
  return Object.freeze({ normalizeEmail, resolveRequestContext: verifier.resolveRequestContext })
}
/** Render public verifier configuration and reviewed receipt into the exact private
 * module bytes. No secondary private configuration import or environment selector.
 * The static helper belongs to the reviewed immutable application image.
 */
export function renderPrivateIntegration(factoryUrl: string, options: Parameters<typeof createCandidateIntegration>[0]): string {
  const parsed = new URL(factoryUrl)
  if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash ||
      options.verifier.clock !== Date.now) throw new Error('PRIVATE_MODULE_CONFIG_INVALID')
  createCandidateIntegration(options) // Validate before producing candidate bytes; no approval is created.
  const verifier = { ...options.verifier, clock: undefined,
    publicKey: options.verifier.publicKey.export({ type: 'spki', format: 'pem' }) }
  const configuration = JSON.stringify({ report: options.report, approval: options.approval, verifier })
  return `import { createPublicKey } from 'node:crypto';\nimport { createCandidateIntegration } from ${JSON.stringify(factoryUrl)};\nconst configuration = ${configuration};\nconfiguration.verifier.publicKey = createPublicKey(configuration.verifier.publicKey);\nconfiguration.verifier.clock = Date.now;\nconst integration = createCandidateIntegration(configuration);\nexport const normalizeEmail = integration.normalizeEmail;\nexport const resolveRequestContext = integration.resolveRequestContext;\n`
}
