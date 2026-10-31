/** Candidate native Traefik ForwardAuth adapter. No listener or route is installed. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { TLSSocket } from 'node:tls'
import { isIP } from 'node:net'
import { assertionHeader } from './ingress-assertion.ts'

export function createForwardAuthHandler(options: Readonly<{
  issuer: Readonly<{ issueForAuthenticatedIngress(request: Request, canonicalNetwork: string): Promise<string> }>; audience: string
  proxyCertificateSha256: string; maximumBodyBytes: number; timeoutMs: number
}>) {
  const c = Object.freeze({ ...options })
  if (!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(c.proxyCertificateSha256) ||
      !Number.isSafeInteger(c.maximumBodyBytes) || c.maximumBodyBytes < 1 || c.maximumBodyBytes > 65536 ||
      !Number.isSafeInteger(c.timeoutMs) || c.timeoutMs < 1 || c.timeoutMs > 5000 ||
      new URL(c.audience).origin !== c.audience || !c.audience.startsWith('https://')) throw new Error('INGRESS_CONFIG_INVALID')
  return async (incoming: IncomingMessage, response: ServerResponse) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const socket = incoming.socket
      if (!(socket instanceof TLSSocket) || !socket.authorized ||
          socket.getPeerCertificate().fingerprint256 !== c.proxyCertificateSha256) throw new Error('INGRESS_DENIED')
      const one = (name: string) => {
        const values = incoming.headersDistinct[name]
        if (!values || values.length !== 1 || values[0].includes(',') || !values[0]) throw new Error('INGRESS_DENIED')
        return values[0]
      }
      const method = one('x-forwarded-method'), proto = one('x-forwarded-proto')
      const host = one('x-forwarded-host'), uri = one('x-forwarded-uri'), network = one('x-forwarded-for')
      // Single sanitized hop ONLY. A trusted certificate alone cannot prove that
      // Traefik stripped browser-supplied forwarded headers: deployment must verify it.
      if (!isIP(network) || proto !== 'https' || proto + '://' + host !== c.audience ||
          !/^[A-Z]+$/.test(method) || !uri.startsWith('/') || uri.startsWith('//') || /[\s#\\]/u.test(uri)) throw new Error('INGRESS_DENIED')
      const url = new URL(uri, c.audience)
      if (url.origin !== c.audience || url.pathname + url.search !== uri) throw new Error('INGRESS_DENIED')
      const headers = new Headers()
      for (const [name, values] of Object.entries(incoming.headersDistinct)) {
        if (!values || values.length !== 1) throw new Error('INGRESS_DENIED')
        headers.set(name, values[0])
      }
      // Forwarded metadata is consumed only after mTLS peer verification and
      // single-hop validation above. It must never be passed to the issuer as
      // untrusted request headers (including alternate X-Forwarded-* names).
      // The canonical peer network is passed explicitly as the second argument.
      for (const name of [...headers.keys()]) {
        if (name.startsWith('x-forwarded-') || name === 'forwarded' ||
            name === assertionHeader || name === 'x-real-ip') headers.delete(name)
      }
      headers.set('host', host)
      const chunks: Buffer[] = []
      let size = 0
      const read = async () => {
        for await (const chunk of incoming) {
          const part = Buffer.from(chunk); size += part.length
          if (size > c.maximumBodyBytes) throw new Error('INGRESS_DENIED')
          chunks.push(part)
        }
      }
      await Promise.race([read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { incoming.destroy(); reject(new Error('INGRESS_DENIED')) }, c.timeoutMs)
      })])
      if (size && (method === 'GET' || method === 'HEAD')) throw new Error('INGRESS_DENIED')
      const request = new Request(url, { method, headers, body: size ? Buffer.concat(chunks) : undefined })
      const assertion = await c.issuer.issueForAuthenticatedIngress(request, network)
      // A ForwardAuth 2xx response permits the proxy to forward the request.
      // Never authorize forwarding if the issuer returned no usable assertion.
      if (typeof assertion !== 'string' || assertion.length < 16 || assertion.length > 8192 ||
          !/^[A-Za-z0-9._-]+$/.test(assertion)) throw new Error('INGRESS_DENIED')
      response.writeHead(204, { [assertionHeader]: assertion, 'cache-control': 'no-store' }); response.end()
    } catch {
      if (!response.headersSent && !response.destroyed) { response.writeHead(403, { 'cache-control': 'no-store' }); response.end() }
    } finally { if (timer) clearTimeout(timer) }
  }
}
