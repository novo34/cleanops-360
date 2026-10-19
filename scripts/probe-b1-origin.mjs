import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

// Isolated synthetic application: never add a diagnostic endpoint to CleanOps.
const require = createRequire(import.meta.url)
const root = process.cwd()
const next = require.resolve('next/dist/bin/next')
const fixture = await mkdtemp(path.join(tmpdir(), 'cleanops-origin-'))
const port = 3109
const publicOrigin = 'https://cleanops.nuvurent.com'
let server
try {
  await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir')
  await mkdir(path.join(fixture, 'app/probe'), { recursive: true })
  await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ private: true, dependencies: { next: require('next/package.json').version, react: require('react/package.json').version, 'react-dom': require('react-dom/package.json').version } }))
  await writeFile(path.join(fixture, 'next.config.mjs'), 'export default {}\n')
  await writeFile(path.join(fixture, 'app/probe/route.js'), `export const dynamic = 'force-dynamic'
export async function POST(request) {
  return Response.json({ url: request.url, headers: Object.fromEntries(['host', 'origin', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded'].map(key => [key, request.headers.get(key)])) })
}
`)
  const build = spawn(process.execPath, [next, 'build', fixture, '--webpack'], { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
  assert.equal((await once(build, 'exit'))[0], 0, 'isolated Next production build')
  server = spawn(process.execPath, [next, 'start', fixture, '-H', '0.0.0.0', '-p', String(port)], { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(`http://127.0.0.1:${port}/probe`, { signal: AbortSignal.timeout(1000) }); break } catch { await new Promise(resolve => setTimeout(resolve, 200)) }
  }
  const cases = [
    { name: 'internal-http', headers: { origin: publicOrigin } },
    { name: 'https-proxy', headers: { host: 'cleanops.nuvurent.com', origin: publicOrigin, 'x-forwarded-host': 'cleanops.nuvurent.com', 'x-forwarded-proto': 'https' } },
    { name: 'forged-forwarded', headers: { host: 'evil.example', origin: publicOrigin, 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', forwarded: 'host=evil.example;proto=https' } },
  ]
  const observations = []
  for (const scenario of cases) {
    const response = await fetch(`http://127.0.0.1:${port}/probe`, { method: 'POST', headers: scenario.headers })
    assert.equal(response.status, 200)
    const observation = { scenario: scenario.name, ...await response.json() }
    observations.push(observation)
    console.log(JSON.stringify(observation))
  }
  assert.ok(observations.some(item => new URL(item.url).origin !== publicOrigin), 'internal URL differs from configured public HTTPS origin')
  const nextPackage = JSON.parse(await readFile(require.resolve('next/package.json'), 'utf8'))
  console.log(JSON.stringify({ next: nextPackage.version, result: 'URL_ORIGIN_IS_NOT_PUBLIC_ORIGIN', observations }))
} finally {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit') }
  await rm(fixture, { recursive: true, force: true })
}
