import {handleAuth} from '@/lib/b1/runtime'
export const runtime='nodejs'
export async function GET(request:Request){return handleAuth(request,'listAdministrationInvitations')}
export async function POST(request:Request){
 const result=await handleAuth(request,'changeUserInvitation')
 // Accepted request never indicates whether a principal exists in another tenant.
 return result.status===200?new Response(result.body,{status:202,headers:result.headers}):result
}
