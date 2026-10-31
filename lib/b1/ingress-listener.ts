/** Internal mTLS ingress listener. Explicitly owned by the trusted server lifecycle.
 * Not exposed by instrumentation or Traefik until AUTH-GATE-05 acceptance.
 */
import { createServer, type ServerOptions } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { isIP } from 'node:net'
import { TLSSocket } from 'node:tls'

const deny = (response: ServerResponse) => {
  if (!response.headersSent && !response.destroyed) {
    response.writeHead(403, { 'cache-control': 'no-store', 'content-length': '0' })
    response.end()
  }
}

export type B1IngressListenerInputs = Readonly<{
  binding: string
  port: number
  tls: Readonly<Pick<ServerOptions, 'key' | 'cert' | 'ca'>>
  allowedPaths: readonly string[]
  ready: () => Promise<boolean>
  handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>
  drainTimeoutMs: number
}>

/** The caller owns the reviewed TLS identity and must close this before closing B1 runtime.
 * TLS authorization and proxy certificate pin are additionally enforced by handle().
 */
export async function startB1IngressListener(input: B1IngressListenerInputs): Promise<Readonly<{
  address: AddressInfo
  close(): Promise<void>
}>> {
  if (!input || !isIP(input.binding) || input.binding === '0.0.0.0' ||
      input.binding === '::' || !Number.isSafeInteger(input.port) ||
      input.port < 1 || input.port > 65535 || !input.tls?.key || !input.tls.cert || !input.tls.ca ||
      !Array.isArray(input.allowedPaths) || !input.allowedPaths.length ||
      input.allowedPaths.some(path => typeof path !== 'string' || !path.startsWith('/') ||
        path.startsWith('//') || /[\\s?#%\\\\]/u.test(path)) ||
      new Set(input.allowedPaths).size !== input.allowedPaths.length ||
      typeof input.ready !== 'function' || typeof input.handle !== 'function' ||
      !Number.isSafeInteger(input.drainTimeoutMs) || input.drainTimeoutMs < 1 ||
      input.drainTimeoutMs > 30000) throw new Error('B1_INGRESS_LISTENER_CONFIG_INVALID')

  let closing = false
  const active = new Set<Promise<void>>()
  const allowed = new Set(input.allowedPaths)
  const server = createServer({
    ...input.tls, requestCert: true, rejectUnauthorized: true,
    minVersion: 'TLSv1.2', honorCipherOrder: true,
  }, (request, response) => {
    if (closing || !(request.socket instanceof TLSSocket) || !request.socket.authorized) { deny(response); return }
    let path: string
    try {
      const url = new URL(request.url ?? '', 'https://ingress.invalid')
      path = url.pathname
      if (!request.url?.startsWith('/') || request.url.startsWith('//') ||
          url.pathname + url.search !== request.url || !allowed.has(path)) {
        deny(response); return
      }
    } catch { deny(response); return }
    const work = (async () => {
      try {
        if (closing || await input.ready() !== true || closing) { deny(response); return }
        await input.handle(request, response)
      } catch { deny(response) }
    })()
    active.add(work)
    void work.finally(() => active.delete(work))
  })
  server.headersTimeout = 5000
  server.requestTimeout = 5000
  server.keepAliveTimeout = 1000
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => { server.off('listening', done); reject(error) }
      const done = () => { server.off('error', fail); resolve() }
      server.once('error', fail)
      server.once('listening', done)
      server.listen(input.port, input.binding)
    })
  } catch {
    server.closeAllConnections()
    throw new Error('B1_INGRESS_LISTENER_START_FAILED')
  }
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.closeAllConnections()
    throw new Error('B1_INGRESS_LISTENER_START_FAILED')
  }
  let closingPromise: Promise<void> | undefined
  return Object.freeze({
    address,
    close: () => {
      if (closingPromise) return closingPromise
      closing = true
      closingPromise = new Promise<void>((resolve, reject) => {
        let socketClosed = false
        let timedOut = false
        const timeout = setTimeout(() => {
          timedOut = true
          server.closeAllConnections()
          reject(new Error('B1_INGRESS_DRAIN_TIMEOUT'))
        }, input.drainTimeoutMs)
        const awaitDrain = async () => {
          while (!timedOut && active.size > 0) await Promise.allSettled([...active])
          if (!timedOut && socketClosed) { clearTimeout(timeout); resolve() }
        }
        server.close(error => {
          if (error) {
            clearTimeout(timeout)
            reject(new Error('B1_INGRESS_CLOSE_FAILED'))
            return
          }
          socketClosed = true
          void awaitDrain()
        })
        server.closeIdleConnections()
      })
      return closingPromise
    },
  })
}
