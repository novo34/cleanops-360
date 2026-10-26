/** SQL13 remaining temporal/revocation races, real ordinary-role connections. */
import {Pool} from 'pg'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const chunks:Buffer[]=[];for await(const c of process.stdin)chunks.push(Buffer.from(c))
const input=JSON.parse(Buffer.concat(chunks).toString()),checks:{name:string;status:string;detail?:string}[]=[]
const admin=new Pool({host:'/var/run/postgresql',database:'core',user:'postgres',max:2})
const identity=new Pool({host:'/var/run/postgresql',database:'core',user:input.identityRole,max:2,statement_timeout:10000})
const hash=(s:string)=>createHash('sha256').update(s).digest(),fresh=()=>randomBytes(32).toString('base64url')
async function test(name:string,work:()=>Promise<void>){try{await work();checks.push({name,status:'PASS'})}catch{checks.push({name,status:'FAIL',detail:'REDACTED'})}}
async function waitBlocked(pid:number){for(let n=0;n<60;n++){const r=await admin.query("SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",[pid]);if(r.rows[0]?.blocked)return;await new Promise(r=>setTimeout(r,50))}throw Error('NO_REAL_LOCK_WAIT')}
async function race(expire:boolean){
 const raw=fresh(),csrf=fresh(),key=randomBytes(32),request=randomBytes(32)
 const q=(await identity.query("SELECT auth_api.new_preauth_verified($1::uuid,NULL,1,'$argon2id$fixture-not-a-real-password',$2::bytea,$3::bytea) AS id",[input.principal,hash(raw),hash(csrf)])).rows[0].id
 if(expire)await admin.query("UPDATE identity_private.preauth SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=$1",[q])
 const holder=await admin.connect(),client=await identity.connect()
 let outstanding:Promise<unknown>|undefined
 try{
  await holder.query('BEGIN')
  if(expire)await holder.query('SELECT 1 FROM app.policy_versions WHERE tenant_id=$1 FOR UPDATE',[input.tenant])
  else await holder.query('SELECT 1 FROM app.users WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[input.tenant,input.user])
  await client.query('BEGIN');await client.query("SELECT auth_api.reserve_owned($1,'switchTenant',$2,$3,true)",[raw,key,request])
  const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
  outstanding=client.query('SELECT auth_api.select_tenant_rotated_owned($1,$2,$3,$4,$5,$6,$7) AS value',[raw,hash(fresh()),hash(fresh()),input.tenant,key,request,randomUUID()]).then(r=>({value:r.rows[0].value}),()=>({error:true}))
  await waitBlocked(pid)
  if(expire)await holder.query('SELECT pg_sleep(2.2)')
  else await holder.query("UPDATE app.users SET state='DISABLED' WHERE tenant_id=$1 AND id=$2",[input.tenant,input.user])
  await holder.query('COMMIT');const result=await outstanding as {error?:boolean;value?:{selected:boolean}};assert.ok(result.error||result.value?.selected===false)
  await client.query('ROLLBACK')
  const after=(await admin.query('SELECT state,tenant_id,cookie_digest FROM identity_private.preauth WHERE id=$1',[q])).rows[0];assert.equal(after.state,'SELECTION');assert.equal(after.tenant_id,null);assert.ok(after.cookie_digest.equals(hash(raw)))
 }finally{await holder.query('ROLLBACK');await Promise.allSettled(outstanding?[outstanding]:[]);await client.query('ROLLBACK');holder.release();client.release();if(!expire)await admin.query("UPDATE app.users SET state='ACTIVE' WHERE tenant_id=$1 AND id=$2",[input.tenant,input.user])}
}
async function malformed(index:number){
 const raw=fresh(),csrf=fresh(),key=randomBytes(32),request=randomBytes(32)
 const q=(await identity.query("SELECT auth_api.new_preauth_verified($1::uuid,NULL,1,'$argon2id$fixture-not-a-real-password',$2::bytea,$3::bytea) AS id",[input.principal,hash(raw),hash(csrf)])).rows[0].id
 if(index===-1)await admin.query('UPDATE identity_private.preauth SET factor_verified_at=clock_timestamp() WHERE id=$1',[q])
 if(index===-2){const source=(await admin.query("SELECT tenant_id,id FROM app.sessions WHERE principal_id=$1 AND state='ACTIVE' LIMIT 1",[input.principal])).rows[0];assert.ok(source);await admin.query('UPDATE identity_private.preauth SET origin_tenant_id=$2,origin_session_id=$3 WHERE id=$1',[q,source.tenant_id,source.id])}
 const c=await identity.connect()
 try{await c.query('BEGIN');let denied=false;try{await c.query("SELECT auth_api.reserve_owned($1,'switchTenant',$2,$3,true)",[raw,key,request]);const values:unknown[]=[raw,hash(fresh()),hash(fresh()),input.tenant,key,request,randomUUID()];if(index>=0)values[index]=null;const r=await c.query('SELECT auth_api.select_tenant_rotated_owned($1,$2,$3,$4,$5,$6,$7) AS value',values);denied=r.rows[0].value.selected===false}catch{denied=true}assert.ok(denied)}finally{await c.query('ROLLBACK');c.release()}
 const after=(await admin.query('SELECT cookie_digest FROM identity_private.preauth WHERE id=$1',[q])).rows[0];assert.ok(after.cookie_digest.equals(hash(raw)))
}
try{
 for(const index of [1,2,3,4,5,6,-1,-2])await test('SQL13-ROT-05-08-null-or-bound-input-'+index,()=>malformed(index))
 await test('SQL13-ACL-02-direct-private-INSERT-and-log-DML-denied',async()=>{for(const sql of ['INSERT INTO identity_private.preauth DEFAULT VALUES','INSERT INTO identity_private.security_log DEFAULT VALUES','DELETE FROM identity_private.security_log']){let denied=false;try{await identity.query(sql)}catch(e){denied=!!e&&typeof e==='object'&&'code'in e&&e.code==='42501'}assert.ok(denied)}})
 await test('SQL13-ROT-07-real-policy-row-wait-expires-owned-marker-no-effects',()=>race(true))
 await test('SQL13-ROT-10-real-membership-row-wait-revocation-revalidated-no-effects',()=>race(false))
}finally{await identity.end();await admin.end()}
process.stdout.write(JSON.stringify({checks,coverage:{scope:'SQL13_ADDITIONAL_REAL_LOCK_WAIT_CASES'}}));process.exitCode=checks.every(c=>c.status==='PASS')?0:1
