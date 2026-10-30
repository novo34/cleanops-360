/** Reviewed site binding. No deployment secrets or selector is stored in Git. */
import type { InstallationBootstrapInputs } from './installation-bootstrap.ts'

/**
 * A site-specific reviewed integration must supply the complete private inputs.
 * Until the operative Dokploy mounts are reconciled, the only legal binding is
 * absent. Never derive a private/closed choice from environment or request data.
 */
export function reviewedB1Installation(): InstallationBootstrapInputs | undefined {
  return undefined
}
