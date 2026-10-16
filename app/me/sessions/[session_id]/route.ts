import { handleAuth } from "@/lib/b1/runtime"

export const runtime = "nodejs"

export async function DELETE(request: Request) {
  return handleAuth(request, "revokeSelfSession")
}
