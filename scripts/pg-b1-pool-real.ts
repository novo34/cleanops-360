/** Real ordinary-role pool reuse; no runtime configuration, SQL definitions or grants. */
import {Pool} from 'pg'
import assert from 'node:assert/strict'
import {createV4IdentityRepository} from '../lib/b1/v4-broker.ts'
import {AuthError} from '../lib/b1/service.ts'
const chunks:Buffer[]=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk))
const input=JSON.parse(Buffer.concat(chunks).toString()),checks:{name:string;status:string}[]=[],pids:number[]=[]
const identity=new Pool({host:'/var/run/postgresql',database:'core',user:input.identityRole,max:1,connectionTimeoutMillis:5000,statement_timeout:8000})
const pool={async connect(){const client=await identity.connect();pids.push((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);return{async query(sql:string,values?:unknown[]){return client.query(sql,values)},release(discard?:boolean){client.release(discard)}}}}
const repo=createV4IdentityRepository(pool)
const record=(name:string,ok:boolean)=>checks.push({name,status:ok?'PASS':'FAIL'})
try{
 async function context(token:string,tenant:string,user:string){return repo.transaction(async broker=>{await broker.call('beginContext',[token.repeat(43)]);const rows=await broker.call('identity',[]);return rows.length===1&&rows[0].tenant_id===tenant&&rows[0].id===user})}
 record('POOL-explicit-A-context',await context('a',input.tenant,input.user))
 record('POOL-explicit-B-context',await context('d',input.otherTenant,input.otherUser))
 record('POOL-real-same-backend-A-to-B',pids[0]===pids[1])
 let denied=false
 try{await repo.transaction(b=>b.call('identity',[]))}catch(error){denied=error instanceof AuthError&&error.status===503}
 record('POOL-stale-previous-transaction-context-denied',denied)
 record('POOL-explicit-A-context-after-denial',await context('a',input.tenant,input.user))
 record('POOL-poisoned-connection-actually-discarded',pids[3]!==pids[2])
 const client=await identity.connect()
 try{
  await client.query('BEGIN');await client.query('SELECT auth_api.begin_verified_context($1)', ['a'.repeat(43)])
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[input.otherTenant])
  const rows=await client.query('SELECT * FROM auth_api.current_identity()')
  record('POOL-client-GUC-cannot-rebind-tenant',rows.rows.length===1&&rows.rows[0].tenant_id===input.tenant)
 }finally{await client.query('ROLLBACK');client.release()}
 assert.ok(checks.every(c=>c.status==='PASS'))
}catch{record('POOL-unexpected-failure-redacted',false)}finally{await identity.end()}
process.stdout.write(JSON.stringify({checks}));process.exitCode=checks.every(c=>c.status==='PASS')?0:1
