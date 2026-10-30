/** Next.js Node server lifecycle entry point. No request can invoke register(). */
export async function register() {
  // NEXT_RUNTIME gates Next's instrumentation worker, never backend selection.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const [{ reviewedB1Installation }, { startTrustedB1Server }] = await Promise.all([
    import('./lib/b1/reviewed-site-installation.ts'),
    import('./lib/b1/server-startup.ts'),
  ])
  const installation = reviewedB1Installation()
  if (installation) await startTrustedB1Server(installation)
  // Absent a reviewed installation, all auth routes stay fail-closed (503).
}
