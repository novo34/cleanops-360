import { runtimeHandler } from "./lib/b1/runtime"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
  ].join("; ")

  // Next.js reads CSP on the forwarded REQUEST to attach nonces to framework scripts.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  if (request.nextUrl.pathname === "/login") {
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("Vary", "Cookie")
    try {
      const bootstrap = await runtimeHandler().bootstrap()
      if (!(bootstrap instanceof Response)) {
        for (const value of bootstrap.headers.getSetCookie()) response.headers.append("Set-Cookie", value)
      }
    } catch { /* No bootstrap cookie is emitted on configuration/dependency failure. */ }
  }
  return response
}

export const config = {
  matcher: [
    { source: "/((?!api|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] },
  ],
}
