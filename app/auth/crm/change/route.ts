import { handleAuth } from '../../../../lib/b1/runtime'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) { return handleAuth(request, 'changeCrmRecord') }
