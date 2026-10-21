// SQL5 has no execution authorization. No production adapter or session issuer is installed.
export const runtime='nodejs'
export async function POST(){
 return new Response(JSON.stringify({error:{code:'AUTH_DEPENDENCY_UNAVAILABLE',message:'Invitaciones no disponibles.',details:[]},correlation_id:crypto.randomUUID()}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
}
