// Preview-only access boundary. Not application authentication or B1.
import http from 'node:http'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { URL, pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { timingSafeEqual, createHash } from 'node:crypto'
export function createPreviewGateway({ password, user = 'owner', upstream = 'http://app:3000' }) {
if (password.length < 24) throw new Error('Preview requires an independently generated password of at least 24 characters')
const digest = value => createHash('sha256').update(value).digest()
const expected = digest(`${user}:${password}`)
upstream = new URL(upstream)
return http.createServer((request, response) => {
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  response.setHeader('Cache-Control', 'no-store')
  const authorization = request.headers.authorization || ''
  const supplied = authorization.startsWith('Basic ') ? Buffer.from(authorization.slice(6), 'base64').toString('utf8') : ''
  if (!timingSafeEqual(digest(supplied), expected)) {
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="CleanOps synthetic preview", charset="UTF-8"' }); response.end('Private preview'); return
  }
  if (!request.url.startsWith('/') || request.url.startsWith('//') || request.url.includes('\\')) { response.writeHead(400); response.end(); return }
  let pathname
  try { pathname = decodeURIComponent(new URL(request.url, 'http://preview').pathname) } catch { response.writeHead(400); response.end(); return }
  if (pathname.includes('\\') || pathname.includes('%') || pathname.split('/').includes('..')) { response.writeHead(400); response.end(); return }
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return }
  if (pathname === '/') { response.writeHead(302, { Location: '/demo' }); response.end(); return }
  if (!/^\/demo(?:\/(?:empresas|clientes|empleados|planning))?\/?$/.test(pathname) && !/^\/(?:_next\/static|demo-map|demo-fonts)\//.test(pathname)) {
    response.writeHead(404); response.end('Not available in preview'); return
  }
  const headers = { ...request.headers, host: upstream.host }
  delete headers.authorization; delete headers.cookie
  const proxy = http.request(new URL(request.url, upstream), { method: request.method, headers }, result => {
    const safeHeaders = { ...result.headers, 'x-robots-tag': 'noindex, nofollow, noarchive', 'cache-control': 'no-store' }
    delete safeHeaders['set-cookie']
    response.writeHead(result.statusCode || 502, safeHeaders); result.pipe(response)
  })
  proxy.setTimeout(30_000, () => proxy.destroy())
  proxy.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('Preview unavailable') })
  request.pipe(proxy)
})
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createPreviewGateway({
    password: readFileSync(process.env.PREVIEW_PASSWORD_FILE || '/run/secrets/preview_password', 'utf8').trim(),
    user: process.env.PREVIEW_USER || 'owner', upstream: process.env.PREVIEW_UPSTREAM || 'http://app:3000',
  }).listen(Number(process.env.PORT || 8080), process.env.PREVIEW_HOST || '127.0.0.1')
}
