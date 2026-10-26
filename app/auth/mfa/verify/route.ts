import { handleAuth } from "@/lib/b1/runtime"

export const runtime = "nodejs"

export async function POST(request: Request) {
  return handleAuth(request, "verifyMfa")
}
