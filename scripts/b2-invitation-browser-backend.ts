/** SQL4 REVIEW TEST ONLY: ordinary B1 identity role, synthetic local mail custody; never sends email. */
import { createInterface } from 'node:readline'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { hash, argon2id } from 'argon2'
import { createApprovedPrivateBackend } from '../lib/b1/approved-backend.ts'
import { createAuthHandler } from '../lib/b1/service.ts'
import { operations } from '../lib/b1/contracts.ts'

const input=createInterface({input:process.stdin})
const pool=new Pool({host:'/var/run/postgresql',database:'core',user:'pgtest_identity',max:2,connectionTimeoutMillis:5000,statement_timeout:8000})
const buffers=Array.from({length:7},()=>randomBytes(32))
const backend=createApprovedPrivateBackend(pool,{
 factors:{dummyPasswordHash:await hash(randomBytes(32),{type:argon2id,memoryCost:65536,timeCost:3,parallelism:1}),auditKey:buffers[0],otpKey:buffers[1],recoveryKey:buffers[2],async decryptTotp(){throw Error('NO_FACTOR_CAPABILITY_IN_READ_ONLY_TEST')}},
 invitationMail:{async withWriteKey(tenant,work){if(!tenant)throw Error('TENANT_REQUIRED');return work(buffers[6],'sql4-synthetic-mail-key')}},
 cursorKey:buffers[3],transport:()=>({network:buffers[4],device:buffers[5]}),normalizeEmail:value=>value.trim().toLowerCase(),
})
const handler=createAuthHandler(backend,'https://127.0.0.1:3443')
const allowed=new Set(['listAdministrationUsers','getAdministrationUser','getAdministrationSession','getUserAccess','listAdministrationInvitations','changeUserInvitation'])
process.stdout.write(JSON.stringify({ready:true})+'\n')
try{
 for await(const line of input){
  const value=JSON.parse(line)
  try{
   const url=new URL(value.path,'https://127.0.0.1:3443')
   const op=operations.find(op=>op.path===url.pathname&&op.method===(value.method??'GET')&&allowed.has(op.operationId))
   if(!op||url.origin!=='https://127.0.0.1:3443')throw Error('READ_ONLY_ROUTE_REQUIRED')
   const response=await handler.handle(new Request(url,{method:op.method,headers:value.headers,...(op.method==='POST'?{body:value.body}: {})}),op.operationId)
   process.stdout.write(JSON.stringify({id:value.id,status:response.status===200&&op.operationId==='changeUserInvitation'?202:response.status,headers:Object.fromEntries(response.headers),body:await response.text()})+'\n')
  }catch{process.stdout.write(JSON.stringify({id:value.id,status:503,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({error:{code:'TEST_DEPENDENCY_UNAVAILABLE'}})})+'\n')}
 }
}finally{await pool.end();for(const buffer of buffers)buffer.fill(0)}
