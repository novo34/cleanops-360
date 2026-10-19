// Explicit operator invocation only. A closed-boundary PASS is never B1 acceptance.
const origin = process.argv[2]
try {
  if (process.env.CLEANOPS_STAGING_BROWSER_AUTHORIZED !== 'yes' || origin !== 'https://cleanops.nuvurent.com') throw Error('SCOPE')
  const login = await fetch(origin + '/login', { redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (login.status !== 200 || !(login.headers.get('content-type') || '').includes('text/html')) throw Error('UI')
  await login.body?.cancel()
  const auth = await fetch(origin + '/auth/me', { redirect: 'error', signal: AbortSignal.timeout(10000) })
  const result = await auth.json()
  if (auth.status !== 503 || result.error?.code !== 'AUTH_DEPENDENCY_UNAVAILABLE' || !(auth.headers.get('cache-control') || '').includes('no-store')) throw Error('BOUNDARY')
  console.log(JSON.stringify({ scope: 'STAGING_SYNTHETIC', uiHttps: 'PASS', closedBackend: 'PASS',
    functionalB1: 'BLOCKED_AUTH_GATE_05', productiveAcceptance: false }))
} catch { console.error('STAGING_ONLINE_CHECK_REJECTED'); process.exitCode = 1 }
