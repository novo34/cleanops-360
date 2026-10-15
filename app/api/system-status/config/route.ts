import { NextResponse } from "next/server"
import { requireAdminAccess, unauthorizedResponse } from "../../../../lib/system-status/access"
import { withDatabase } from "../../../../lib/system-status/db"

export async function GET() {
  const access = requireAdminAccess()
  if (!access.authorized) return unauthorizedResponse()
  const flags = await withDatabase(async (client) => {
    const result = await client.query<{ key: string; enabled: boolean }>("SELECT key, enabled FROM feature_flags WHERE organization_id = $1 ORDER BY key", ["00000000-0000-0000-0000-000000000001"])
    return result.rows
  })
  return NextResponse.json({ featureFlags: flags })
}
