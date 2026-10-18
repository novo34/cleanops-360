/** Exact SQL14 isolated runner entry. Harness verifies approval, bytes and isolation first. */
import {Pool} from 'pg'
import assert from 'node:assert/strict'
import {runPreparedRoleRiskTests,SQL14_REVIEW_ARTIFACT} from './pg14-role-risk-tests.ts'
const chunks:Buffer[]=[];for await(const c of process.stdin)chunks.push(Buffer.from(c))
const input=JSON.parse(Buffer.concat(chunks).toString())
assert.equal(SQL14_REVIEW_ARTIFACT.gitBlob,'1971a9fdc5c1f3fd1fcb5f6706459678e5399256')
const admin=new Pool({host:'/var/run/postgresql',database:'core',user:'postgres',max:2,statement_timeout:12000})
const identity=new Pool({host:'/var/run/postgresql',database:'core',user:input.identityRole,max:4,statement_timeout:10000})
const checks:{name:string;status:'PASS'|'FAIL';detail?:'REDACTED'}[]=[]
async function check(name:string,work:()=>Promise<void>){try{await work();checks.push({name,status:'PASS'})}catch{checks.push({name,status:'FAIL',detail:'REDACTED'})}}
try{
 await check('SQL14-UI07-catalogue-owner-forced-RLS-and-broker-read-only',async()=>{
  const r=await admin.query("SELECT relowner='cleanops_ddl_owner'::regrole AS owner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='identity_private.role_risk_catalogue'::regclass");assert.deepEqual(r.rows[0],{owner:true,relrowsecurity:true,relforcerowsecurity:true})
  assert.equal((await admin.query("SELECT has_table_privilege('cleanops_auth_broker','identity_private.role_risk_catalogue','SELECT') AS allowed")).rows[0].allowed,true)
  for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER'])assert.equal((await admin.query("SELECT has_table_privilege('cleanops_auth_broker','identity_private.role_risk_catalogue',$1) AS allowed",[privilege])).rows[0].allowed,false)
 })
 await check('SQL14-UI07-helper-owner-definer-path-public-ACL',async()=>{
  const r=await admin.query("SELECT proowner='cleanops_auth_broker'::regrole AS owner,prosecdef,proconfig=ARRAY['search_path=pg_catalog'] AS path,NOT EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0) AS private FROM pg_proc WHERE oid='identity_private.effective_risk(uuid,uuid)'::regprocedure");assert.deepEqual(r.rows[0],{owner:true,prosecdef:true,path:true,private:true})
 })
 for(const role of input.roles)await check('SQL14-UI07-ordinary-role-denied-'+role,async()=>{
  const p=new Pool({host:'/var/run/postgresql',database:'core',user:role,max:1})
  try{const r=await p.query("SELECT has_function_privilege(current_user,'identity_private.effective_risk(uuid,uuid)','EXECUTE') AS exec,has_table_privilege(current_user,'identity_private.role_risk_catalogue','SELECT') AS read,rolsuper,rolbypassrls,pg_has_role(current_user,'cleanops_auth_broker','MEMBER') AS broker FROM pg_roles WHERE rolname=current_user");assert.deepEqual(r.rows[0],{exec:false,read:false,rolsuper:false,rolbypassrls:false,broker:false})
   for(const sql of ['SELECT * FROM identity_private.role_risk_catalogue','INSERT INTO identity_private.role_risk_catalogue DEFAULT VALUES',"SELECT identity_private.effective_risk(NULL,NULL)"]){let denied=false;try{await p.query(sql)}catch(e){denied=!!e&&typeof e==='object'&&'code'in e&&e.code==='42501'}assert.ok(denied)}
  }finally{await p.end()}
 })
 for(const c of await runPreparedRoleRiskTests(admin,identity,input))checks.push({name:'SQL14-'+c.id,status:c.status,...(c.detail?{detail:c.detail}:{} )})
}finally{await identity.end();await admin.end()}
process.stdout.write(JSON.stringify({checks}));process.exitCode=checks.every(c=>c.status==='PASS')?0:1
