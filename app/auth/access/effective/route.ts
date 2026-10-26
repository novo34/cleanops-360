import {handleAuth} from "@/lib/b1/runtime"
export const runtime="nodejs"
export async function GET(request:Request){return handleAuth(request,"checkEffectiveAccess")}
