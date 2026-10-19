// No token or provider body is logged. Readiness is NOT unseal/custody acceptance.
import https from 'node:https'
import { readFileSync } from 'node:fs'
try {
  const url = new URL(process.env.OPENBAO_HEALTH_ORIGIN || 'https://openbao:8200')
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('CONFIG')
  const request = https.get(new URL('/v1/sys/health', url), {
    ca: readFileSync('/run/openbao-tls/workload-ca.pem'),
    cert: readFileSync('/run/openbao-tls/health-client.pem'),
    key: readFileSync('/run/openbao-tls/health-client-key.pem'),
    rejectUnauthorized: true, agent: false,
  }, response => {
    const chunks = []; let length = 0
    response.on('data', chunk => {
      length += chunk.length
      if (length > 8192) request.destroy()
      else chunks.push(chunk)
    })
    response.on('error', () => { process.exitCode = 1 })
    response.on('end', () => {
      try {
        const state = JSON.parse(Buffer.concat(chunks).toString())
        process.exitCode = response.statusCode === 200 && state.initialized === true && state.sealed === false ? 0 : 1
      } catch { process.exitCode = 1 }
    })
  })
  const timer = setTimeout(() => request.destroy(), 5000)
  request.once('close', () => clearTimeout(timer))
  request.on('error', () => { process.exitCode = 1 })
} catch { process.exitCode = 1 }
