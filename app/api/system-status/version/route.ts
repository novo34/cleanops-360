import { NextResponse } from "next/server"
import { requireAdminAccess, unauthorizedResponse } from "../../../../lib/system-status/access"

export async function GET() {
  const access = requireAdminAccess()
  if (!access.authorized) return unauthorizedResponse()
  return NextResponse.json({ app: process.env.npm_package_version ?? "0.1.0", commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local", environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development" })
}
