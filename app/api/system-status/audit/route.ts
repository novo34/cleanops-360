import { NextResponse } from "next/server"
import { requireAdminAccess, unauthorizedResponse } from "../../../../lib/system-status/access"
import { withDatabase } from "../../../../lib/system-status/db"

export async function GET() {
  const access = requireAdminAccess()
  if (!access.authorized) return unauthorizedResponse()
  const rows = await withDatabase(async (client) => {
    const result = await client.query("SELECT action, resource_type, resource_id, metadata, created_at FROM audit_logs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50", ["00000000-0000-0000-0000-000000000001"])
    return result.rows
  })
  return NextResponse.json({ entries: rows })
}
