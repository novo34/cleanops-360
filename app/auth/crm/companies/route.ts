import { handleAuth } from '../../../../lib/b1/runtime'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) { return handleAuth(request, 'listCrmCompanies') }
