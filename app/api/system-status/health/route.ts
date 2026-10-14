import { NextResponse } from "next/server"
import { checkDatabase } from "../../../../lib/system-status/db"
import { requireAdminAccess, unauthorizedResponse } from "../../../../lib/system-status/access"

export async function GET() {
  const access = requireAdminAccess()
  if (!access.authorized) return unauthorizedResponse()
  const database = await checkDatabase()
  return NextResponse.json({ api: "operational", database, jobs: { status: "disconnected" } })
}
