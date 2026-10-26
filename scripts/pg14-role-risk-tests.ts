/** PREPARED, NOT EXECUTED. No entry point or automatic connection/installation.
 * Future authorized isolated harness supplies already-owned PG16 pools/fixtures.
 * Administrator is used ONLY for synthetic setup/inspection; every functional
 * material/session/permission operation uses the ordinary identity role.
 * VERIFIED PREAUTH below is synthetic policy-test setup, NOT evidence of MFA E2E.
 */
import type {Pool,PoolClient} from 'pg'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import assert from 'node:assert/strict'
export const SQL14_REVIEW_ARTIFACT=Object.freeze({gitBlob:'1971a9fdc5c1f3fd1fcb5f6706459678e5399256',sha256:'965dc8a96e70eb9104920916f635239bf8289b937a6c10a63130c203a47e37aa'})
type Risk='SENSITIVE'|'OPERATIONAL'
type Role={risk?:Risk;revoked?:'role'|'membership';timing?:'future'|'expired';foreign?:boolean}
type Input={tenant:string;otherTenant:string;user:string;otherUser:string;principal:string}
type Case={id:string;baseline:Risk;roles:Role[];expected:Risk|null}
export const roleCases:readonly Case[]=[
 {id:'MR01',baseline:'OPERATIONAL',roles:[],expected:'OPERATIONAL'},
 {id:'MR02',baseline:'OPERATIONAL',roles:[{risk:'OPERATIONAL'},{risk:'OPERATIONAL'}],expected:'OPERATIONAL'},
 {id:'MR03',baseline:'OPERATIONAL',roles:[{risk:'OPERATIONAL'},{risk:'SENSITIVE'}],expected:'SENSITIVE'},
 {id:'MR04',baseline:'OPERATIONAL',roles:[{risk:'SENSITIVE'},{risk:'OPERATIONAL'}],expected:'SENSITIVE'},
 {id:'MR05',baseline:'SENSITIVE',roles:[{risk:'OPERATIONAL'}],expected:'SENSITIVE'},
 {id:'MR06',baseline:'OPERATIONAL',roles:[{}],expected:null},
 {id:'MR07',baseline:'OPERATIONAL',roles:[{risk:'SENSITIVE',revoked:'role'}],expected:'OPERATIONAL'},
 {id:'MR08',baseline:'OPERATIONAL',roles:[{risk:'SENSITIVE',revoked:'membership'}],expected:'OPERATIONAL'},
 {id:'MR09',baseline:'OPERATIONAL',roles:[{risk:'SENSITIVE',timing:'future'}],expected:'OPERATIONAL'},
 {id:'MR10',baseline:'OPERATIONAL',roles:[{risk:'SENSITIVE',timing:'expired'}],expected:'OPERATIONAL'},
 {id:'MR11',baseline:'OPERATIONAL',roles:[{risk:'SENSITIVE',foreign:true}],expected:'OPERATIONAL'},
 {id:'MR12',baseline:'SENSITIVE',roles:[{}],expected:'SENSITIVE'},
]
const hash=(s:string)=>createHash('sha256').update(s).digest(),token=()=>randomBytes(32).toString('base64url')
const absolute=(r:Risk)=>r==='SENSITIVE'?43200:86400,idle=(r:Risk)=>r==='SENSITIVE'?1800:28800
const issueSql='SELECT auth_api.issue_active_session($1,$2,$3,$4,$5,$6,$7,$8) AS value'
export async function runPreparedRoleRiskTests(admin:Pool,identity:Pool,input:Input){
 for(const value of Object.values(input))assert.match(value,/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i)
 assert.equal((await admin.query('SHOW server_version_num')).rows[0].server_version_num.slice(0,2),'16')
 // The future runner must verify owner approval, exact artifact bytes and isolation
 // BEFORE importing/calling this module. This module never installs SQL or grants.
 const results:{id:string;status:'PASS'|'FAIL';detail?:unknown}[]=[]
 const roleIds:string[]=[],preauthIds:string[]=[],sessionIds:string[]=[]
 const original=(await admin.query('SELECT risk_class FROM app.users WHERE tenant_id=$1 AND id=$2',[input.tenant,input.user])).rows[0].risk_class
 async function check(id:string,work:()=>Promise<void>){try{await work();results.push({id,status:'PASS'})}catch(e){const error=e as {code?:unknown;stack?:unknown};results.push({id,status:'FAIL',detail:{sqlstate:/^[0-9A-Z]{5}$/.test(String(error.code))?String(error.code):'REDACTED',line:Number(/pg14-role-risk-tests\.ts:(\d+)/.exec(String(error.stack))?.[1]??0)}})}}
 async function clearRoles(){
  if(!roleIds.length)return
  await admin.query('DELETE FROM identity_private.role_risk_catalogue WHERE role_id=ANY($1::uuid[])',[roleIds])
  await admin.query('DELETE FROM app.access_role_memberships WHERE role_id=ANY($1::uuid[])',[roleIds])
  await admin.query('DELETE FROM app.access_roles WHERE id=ANY($1::uuid[])',[roleIds]);roleIds.length=0
 }
 async function addRole(role:Role,client:Pool|PoolClient=admin){
  const id=randomUUID(),t=role.foreign?input.otherTenant:input.tenant,u=role.foreign?input.otherUser:input.user
  roleIds.push(id)
  await client.query("INSERT INTO app.access_roles(tenant_id,id,label,revoked_at) VALUES($1,$2,'Synthetic policy-only role',CASE WHEN $3 THEN clock_timestamp() END)",[t,id,role.revoked==='role'])
  await client.query("INSERT INTO app.access_role_memberships VALUES($1,$2,$3,clock_timestamp()+CASE WHEN $4='future' THEN interval '1 hour' ELSE interval '-2 hours' END,CASE WHEN $4='expired' THEN clock_timestamp()-interval '1 hour' END,CASE WHEN $5 THEN clock_timestamp() END)",[t,id,u,role.timing??null,role.revoked==='membership'])
  if(role.risk)await client.query('INSERT INTO identity_private.role_risk_catalogue VALUES($1,$2,$3)',[t,id,role.risk])
  return id
 }
 async function ceremony(verified=false){
  const raw=token(),csrf=token()
  const r=await identity.query("SELECT auth_api.new_preauth_verified($1::uuid,NULL,1,'$argon2id$fixture-not-a-real-password',$2::bytea,$3::bytea) AS id",[input.principal,hash(raw),hash(csrf)])
  const id=r.rows[0].id;preauthIds.push(id)
  await identity.query('SELECT auth_api.select_tenant($1,$2,$3)',[raw,input.tenant,randomUUID()])
  if(verified)await admin.query("UPDATE identity_private.preauth SET state='VERIFIED',factor_verified_at=clock_timestamp() WHERE id=$1",[id])
  return{raw,id}
 }
 async function issue(raw:string,risk:Risk,client:Pool|PoolClient=identity){
  const rawSession=token(),r=await client.query(issueSql,[raw,hash(rawSession),randomBytes(32),absolute(risk),idle(risk),'Synthetic policy test','Synthetic browser',randomUUID()])
  const id=r.rows[0].value.session_id;sessionIds.push(id);return{id,rawSession}
 }
 async function expectDenied(work:()=>Promise<unknown>,messages:readonly string[]){
  let denied=false;try{await work()}catch(e){denied=!!e&&typeof e==='object'&&'code'in e&&'message'in e&&['42501','P0001'].includes(String(e.code))&&messages.includes(String(e.message))}assert.ok(denied)
 }
 try{
  for(const scenario of roleCases)await check(scenario.id,async()=>{
   await clearRoles();await admin.query('UPDATE app.users SET risk_class=$3 WHERE tenant_id=$1 AND id=$2',[input.tenant,input.user,scenario.baseline])
   for(const role of scenario.roles)await addRole(role)
   const q=await ceremony()
   if(scenario.expected===null){await expectDenied(()=>identity.query("SELECT auth_api.trusted_mfa_material($1,'ENROLLMENT',NULL,NULL)",[q.raw]),['AUTH_INVALID']);return}
   const material=(await identity.query("SELECT auth_api.trusted_mfa_material($1,'ENROLLMENT',NULL,NULL) AS value",[q.raw])).rows[0].value
   assert.equal(material.riskClass,scenario.expected);assert.equal(material.tenantId,input.tenant);assert.equal(material.userId,input.user)
   await admin.query("UPDATE identity_private.preauth SET state='VERIFIED',factor_verified_at=clock_timestamp() WHERE id=$1",[q.id])
   if(scenario.expected==='SENSITIVE')await expectDenied(()=>issue(q.raw,'OPERATIONAL'),['RISK_POLICY_MISMATCH'])
   const active=await issue(q.raw,scenario.expected)
   const saved=(await admin.query('SELECT extract(epoch FROM absolute_expires_at-created_at)::float AS absolute,idle_seconds FROM app.sessions WHERE tenant_id=$1 AND id=$2',[input.tenant,active.id])).rows[0]
   assert.equal(saved.absolute,absolute(scenario.expected));assert.equal(saved.idle_seconds,idle(scenario.expected))
  })
  await check('MR13',async()=>{
   await clearRoles();await admin.query("UPDATE app.users SET risk_class='OPERATIONAL' WHERE tenant_id=$1 AND id=$2",[input.tenant,input.user])
   const q=await ceremony(true),active=await issue(q.raw,'OPERATIONAL');await addRole({risk:'SENSITIVE'})
   await expectDenied(()=>identity.query('SELECT auth_api.begin_verified_context($1)',[active.rawSession]),['INVALID_SESSION','AUTH_INVALID'])
   const s=(await admin.query('SELECT extract(epoch FROM absolute_expires_at-created_at)::float AS lifetime FROM app.sessions WHERE tenant_id=$1 AND id=$2',[input.tenant,active.id])).rows[0]
   assert.equal(s.lifetime,86400) // rejected rather than silently renewing/rewriting
  })
  await check('MR14',async()=>{
   await clearRoles();await admin.query("UPDATE app.users SET risk_class='OPERATIONAL' WHERE tenant_id=$1 AND id=$2",[input.tenant,input.user]);const role=await addRole({risk:'OPERATIONAL'}),q=await ceremony(true)
   const holder=await admin.connect();let pending:Promise<unknown>|undefined
   try{
    await holder.query('BEGIN');await holder.query('SELECT 1 FROM app.policy_versions WHERE tenant_id=$1 FOR UPDATE',[input.tenant])
    // Dedicated ordinary client; pid inspection is fixture-only, not authority.
    const caller=await identity.connect()
    try{
     const pid=(await caller.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
     pending=issue(q.raw,'OPERATIONAL',caller).then(()=>({denied:false}),e=>({denied:e?.message==='RISK_POLICY_MISMATCH'}))
     let blocked=false
     for(let n=0;n<60;n++){if((await admin.query("SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.blocked){blocked=true;break}await new Promise(r=>setTimeout(r,50))}
     assert.ok(blocked);await holder.query("UPDATE identity_private.role_risk_catalogue SET risk_class='SENSITIVE' WHERE tenant_id=$1 AND role_id=$2",[input.tenant,role]);await holder.query('COMMIT');assert.deepEqual(await pending,{denied:true})
    }finally{await holder.query('ROLLBACK');if(pending)await Promise.allSettled([pending]);caller.release()}
    await issue(q.raw,'SENSITIVE')
   }finally{await holder.query('ROLLBACK');holder.release()}
  })
  for(const mode of ['rollback','terminate'] as const)await check(mode==='rollback'?'MR15':'MR16',async()=>{
   await clearRoles();await admin.query("UPDATE app.users SET risk_class='SENSITIVE' WHERE tenant_id=$1 AND id=$2",[input.tenant,input.user]);const q=await ceremony(true),c=await identity.connect();c.on('error',()=>{})
   let destroyed=false
   try{await c.query('BEGIN');const s=await issue(q.raw,'SENSITIVE',c)
    if(mode==='rollback')await c.query('ROLLBACK')
    else{const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;await admin.query('SELECT pg_terminate_backend($1)',[pid]);destroyed=true;await assert.rejects(c.query('COMMIT'))}
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM app.sessions WHERE tenant_id=$1 AND id=$2',[input.tenant,s.id])).rows[0].n,0)
    assert.equal((await admin.query('SELECT state FROM identity_private.preauth WHERE id=$1',[q.id])).rows[0].state,'VERIFIED')
   }finally{if(!destroyed)await c.query('ROLLBACK');c.release(destroyed)}
  })
  await check('MR18',async()=>{
   await clearRoles();await admin.query("UPDATE app.users SET risk_class='OPERATIONAL' WHERE tenant_id=$1 AND id=$2",[input.tenant,input.user]);const role=await addRole({risk:'SENSITIVE'}),q=await ceremony(true),active=await issue(q.raw,'SENSITIVE')
   const before=(await admin.query('SELECT absolute_expires_at,idle_seconds FROM app.sessions WHERE tenant_id=$1 AND id=$2',[input.tenant,active.id])).rows[0]
   await admin.query("UPDATE identity_private.role_risk_catalogue SET risk_class='OPERATIONAL' WHERE tenant_id=$1 AND role_id=$2",[input.tenant,role]);await identity.query('SELECT auth_api.begin_verified_context($1)',[active.rawSession])
   const after=(await admin.query('SELECT absolute_expires_at,idle_seconds FROM app.sessions WHERE tenant_id=$1 AND id=$2',[input.tenant,active.id])).rows[0]
   assert.equal(+after.absolute_expires_at,+before.absolute_expires_at);assert.equal(after.idle_seconds,before.idle_seconds)
  })
  await check('MR19',async()=>{
   await clearRoles();await admin.query("UPDATE app.users SET risk_class='OPERATIONAL' WHERE tenant_id=$1 AND id=$2",[input.tenant,input.user]);await addRole({risk:'SENSITIVE'});await addRole({})
   const q=await ceremony();await expectDenied(()=>identity.query("SELECT auth_api.trusted_mfa_material($1,'ENROLLMENT',NULL,NULL)",[q.raw]),['AUTH_INVALID'])
  })
  await check('MR20',async()=>{
   await clearRoles();await admin.query("UPDATE app.users SET risk_class='SENSITIVE' WHERE tenant_id=$1 AND id=$2",[input.tenant,input.user]);const q=await ceremony();await expectDenied(()=>issue(q.raw,'SENSITIVE'),['MFA_REQUIRED'])
  })
  await check('MR17',async()=>{
   for(const sql of ['SELECT * FROM identity_private.role_risk_catalogue','INSERT INTO identity_private.role_risk_catalogue DEFAULT VALUES','UPDATE identity_private.role_risk_catalogue SET risk_class=\'OPERATIONAL\'','DELETE FROM identity_private.role_risk_catalogue',"SELECT identity_private.effective_risk(NULL,NULL)",'SET ROLE cleanops_auth_broker']){
    let denied=false;try{await identity.query(sql)}catch(e){denied=!!e&&typeof e==='object'&&'code'in e&&e.code==='42501'}assert.ok(denied)
   }
  })
 }finally{
  await clearRoles();if(sessionIds.length)await admin.query('DELETE FROM identity_private.tx_context WHERE session_id=ANY($1::uuid[])',[sessionIds]);if(sessionIds.length)await admin.query('DELETE FROM app.sessions WHERE id=ANY($1::uuid[])',[sessionIds]);if(preauthIds.length)await admin.query('DELETE FROM identity_private.preauth WHERE id=ANY($1::uuid[])',[preauthIds]);await admin.query('UPDATE app.users SET risk_class=$3 WHERE tenant_id=$1 AND id=$2',[input.tenant,input.user,original])
 }
 return results // redacted IDs/status only; never tokens/material/SQL diagnostics
}
