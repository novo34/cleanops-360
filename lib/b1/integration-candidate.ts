/** Private-module factory, deliberately absent from application startup. */
import { createApprovedEmailNormalizer, type EmailCompatibilityReport } from './email-normalization.ts'
import { createIngressVerifier } from './ingress-assertion.ts'
import { createPgIngressRepositories } from './pg-ingress-repositories.ts'
import type { IdentityPool } from './pg-identity-driver.ts'
import type { InstallationIntegration } from './installation-context.ts'

/** Explicit composition for isolated review; borrows the caller's canonical pool.
 * Never constructs a pool, grants operator writes or selects runtime startup.
 */
export function createPgDurableCandidateIntegration(options: Readonly<{
  report: EmailCompatibilityReport
  approval: Parameters<typeof createApprovedEmailNormalizer>[1]
  verifier: Omit<Parameters<typeof createIngressVerifier>[0], 'replay'>
  identityPool: IdentityPool
}>): InstallationIntegration {
  const normalizeEmail = createApprovedEmailNormalizer(options.report, options.approval)
  const repositories = createPgIngressRepositories(options.identityPool)
  const verifier = createIngressVerifier({ ...options.verifier, replay: repositories.replay })
  return Object.freeze({ normalizeEmail, resolveRequestContext: verifier.resolveRequestContext })
}

/** Generate reviewed v2 private-module source. The module receives only the
 * canonical runtime repositories at startup, never HTTP parameters or a pool URL.
 * Its request resolver is closed until the single successful binding.
 */
export function renderDurablePrivateIntegration(
  factoryUrl: string,
  options: Readonly<{
    report: EmailCompatibilityReport
    approval: Parameters<typeof createApprovedEmailNormalizer>[1]
    verifier: Omit<Parameters<typeof createIngressVerifier>[0], 'replay'>
  }>,
): string {
  const parsed = new URL(factoryUrl)
  if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash ||
      options.verifier.clock !== Date.now ||
      options.verifier.topology !== 'shared-atomic-all-consumers') throw new Error('PRIVATE_MODULE_CONFIG_INVALID')
  createApprovedEmailNormalizer(options.report, options.approval)
  const verifier = { ...options.verifier, clock: undefined,
    publicKey: options.verifier.publicKey.export({ type: 'spki', format: 'pem' }) }
  const configuration = JSON.stringify({ report: options.report, approval: options.approval, verifier })
  return `import { createPublicKey } from 'node:crypto';
import { createApprovedEmailNormalizer } from ${JSON.stringify(new URL('./email-normalization.ts', factoryUrl).href)};
import { createIngressVerifier } from ${JSON.stringify(new URL('./ingress-assertion.ts', factoryUrl).href)};
const configuration = ${configuration};
const normalizeEmail = createApprovedEmailNormalizer(configuration.report, configuration.approval);
configuration.verifier.publicKey = createPublicKey(configuration.verifier.publicKey);
configuration.verifier.clock = Date.now;
let resolver;
let bindingAttempted = false;
export { normalizeEmail };
export function bindIngress(dependencies) {
  if (bindingAttempted) throw new Error('PRIVATE_MODULE_BINDING_ALREADY_ATTEMPTED');
  bindingAttempted = true;
  if (!dependencies || typeof dependencies.replay?.claim !== 'function') throw new Error('PRIVATE_MODULE_BINDING_INVALID');
  const candidate = createIngressVerifier({ ...configuration.verifier, replay: dependencies.replay });
  resolver = candidate.resolveRequestContext;
}
export async function resolveRequestContext(request) {
  if (!resolver) throw new Error('AUTH_DEPENDENCY_UNAVAILABLE');
  return resolver(request);
}
`
}
