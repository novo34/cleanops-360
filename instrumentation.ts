/** Next.js Node server lifecycle entry point; never selects auth from requests. */
import { reviewedB1Installation } from './lib/b1/reviewed-site-installation.ts'
import { startTrustedB1Server } from './lib/b1/server-startup.ts'

export async function register() {
  // Next.js invokes register for each runtime; only the Node server owns B1.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const installation = reviewedB1Installation()
  if (installation) await startTrustedB1Server(installation)
  // No approved site binding means all authentication remains fail-closed.
}
