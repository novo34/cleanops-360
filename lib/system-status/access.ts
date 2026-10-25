import { NextResponse } from "next/server"

export type AdminAccess = { authorized: false; reason: "AUTH_GATE_05" }

export function requireAdminAccess(): AdminAccess {
  // AUTH-GATE-05 is intentionally fail-closed until the approved identity contract exists.
  return { authorized: false, reason: "AUTH_GATE_05" }
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "unauthorized", code: "AUTH_GATE_05", message: "Administrative access is unavailable until AUTH-GATE-05 is approved." }, { status: 401 })
}
