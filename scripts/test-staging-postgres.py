#!/usr/bin/env python3
"""CI: real non-root PG16 packaging and exact SQL installer, isolated synthetic only."""
import argparse
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


NATIVE_MIGRATION_CHECKS = r"""
// Native tests ONLY inside the existing owned packaging harness. Never a DSN.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import pg from 'pg'
import { runMigrations, migrationLock, migrationProvenance } from './scripts/migrate-postgres.mjs'
import { loadTrustedMigrations, loadTrustedB1Baseline } from './scripts/trusted-migrations.mjs'
const socket = process.env.CLEANOPS_NATIVE_SOCKET
assert(socket && socket.startsWith('/tmp/cleanops-staging-pg-'))
const password = fs.readFileSync(process.env.CLEANOPS_NATIVE_PASSWORD_FILE, 'utf8')
const results = []
const config = database => ({ host: socket, port: 5432, database,
  user: 'cleanops_bootstrap', password, ssl: false, options: '',
  application_name: 'owned-migrations-native-harness', connectionTimeoutMillis: 3000, max: 4 })
async function withPool(database, work) {
  const pool = new pg.Pool(config(database))
  try { return await work(pool) } finally { await pool.end() }
}
const [migration] = await loadTrustedMigrations()
const source = await migrationProvenance([migration], 'CI_MIGRATIONS_NATIVE_ONLY_NO_HOSTINGER')
const baseline = await loadTrustedB1Baseline()
const baselineSource = await migrationProvenance([baseline], 'CI_SYNTHETIC_ONLY_NO_HOSTINGER')
const check = name => results.push({ name, status: 'PASS' })
const present = async (pool, name) => (await pool.query('SELECT to_regclass($1)::oid AS value', [name])).rows[0].value
await withPool('cleanops_staging', async pool => {
  const plan = await runMigrations({ connect: () => pool.connect(), profile: 'b1', mode: 'plan' })
  assert.equal(plan.baseline.applied, true)
  assert.equal(plan.history.length, 1)
  const row = plan.history[0]
  assert.equal(row.id, baseline.id); assert.equal(row.checksum, baseline.sha256)
  assert.equal(row.profile, 'b1'); assert.equal(row.source_file, baseline.sourceFile)
  assert.equal(row.source_commit, baselineSource.sourceCommit)
  assert.equal(row.runner_sha256, baselineSource.runnerSha256)
  assert.equal(row.approval_reference, baselineSource.approvalReference)
  assert.equal(row.applied_by, 'cleanops_bootstrap')
  assert.ok(row.applied_at instanceof Date && Number.isFinite(row.applied_at.getTime()))
  const nullable = await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='_migrations' AND is_nullable='YES'")
  assert.equal(nullable.rows[0].n, 0)
  check('native-baseline-complete-checksum-provenance-and-not-null-history')
  // Fixed names, new databases in THIS owned network-none container only.
  for (const name of ['migration_foundation', 'migration_legacy', 'migration_concurrency', 'migration_rollback']) {
    await pool.query('CREATE DATABASE ' + name)
  }
})
await withPool('migration_foundation', async pool => {
  const before = await runMigrations({ connect: () => pool.connect(), mode: 'plan' })
  assert.deepEqual(before.pending, [migration.id]); assert.equal(await present(pool, 'public._migrations'), null)
  check('native-absent-plan-does-not-create-registry')
  let executions = 0
  const connect = async () => {
    const client = await pool.connect()
    return { query(sql, values) { if (sql === migration.sql) executions++; return client.query(sql, values) }, release(discard) { client.release(discard) } }
  }
  assert.deepEqual((await runMigrations({ connect, source })).applied, [migration.id])
  const first = (await pool.query('SELECT * FROM public._migrations')).rows[0]
  const oid = await present(pool, 'public.organizations')
  assert.equal(first.checksum, migration.sha256); assert.equal(first.source_commit, source.sourceCommit)
  assert.equal(first.runner_sha256, source.runnerSha256); assert.equal(first.applied_by, 'cleanops_bootstrap')
  assert.deepEqual((await runMigrations({ connect, source })).applied, [])
  assert.equal(executions, 1); assert.equal(await present(pool, 'public.organizations'), oid)
  assert.deepEqual((await pool.query('SELECT * FROM public._migrations')).rows[0], first)
  check('native-foundation-first-apply-and-second-no-repeat')
  await pool.query('UPDATE public._migrations SET checksum=$1 WHERE id=$2', ['0'.repeat(64), migration.id])
  await assert.rejects(runMigrations({ connect, source }), /APPLIED_MIGRATION_CHECKSUM_MISMATCH/)
  assert.equal((await pool.query('SELECT checksum FROM public._migrations')).rows[0].checksum, '0'.repeat(64))
  await pool.query('UPDATE public._migrations SET checksum=$1 WHERE id=$2', [migration.sha256, migration.id])
  await pool.query("UPDATE public._migrations SET id='unapproved-fixture'")
  await assert.rejects(runMigrations({ connect, source }), /UNEXPECTED_MIGRATION_HISTORY/)
  check('native-tampered-checksum-and-unexpected-history-rejected')
})
await withPool('migration_legacy', async pool => {
  await pool.query('CREATE TABLE public._migrations(id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  await pool.query("INSERT INTO public._migrations(id) VALUES('0001_system_status')")
  await assert.rejects(runMigrations({ connect: () => pool.connect(), source }), /INCOMPATIBLE_MIGRATION_REGISTRY/)
  const columns = await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='_migrations'")
  assert.equal(columns.rows[0].n, 2); assert.equal(await present(pool, 'public.organizations'), null)
  check('native-legacy-registry-not-adopted-or-upgraded')
})
await withPool('migration_concurrency', async pool => {
  let entered, resume
  const acquired = new Promise(resolve => { entered = resolve })
  const barrier = new Promise(resolve => { resume = resolve })
  const connect = async () => {
    const client = await pool.connect()
    return { async query(sql, values) {
      const result = await client.query(sql, values)
      if (sql === migrationLock && result.rows[0].locked) { entered(); await barrier }
      return result
    }, release(discard) { client.release(discard) } }
  }
  const first = runMigrations({ connect, source })
  const firstOutcome = first.then(value => ({ value }), error => ({ error }))
  try {
    // Bound the synchronization wait without sleeps or a synthetic advisory-lock result.
    let timer
    try { await Promise.race([acquired, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('NATIVE_LOCK_NOT_ACQUIRED')), 10000) }), first.then(() => { throw Error('FIRST_COMPLETED_BEFORE_BARRIER') })]) }
    finally { clearTimeout(timer) }
    await assert.rejects(runMigrations({ connect: () => pool.connect(), source }), /MIGRATION_BUSY/)
    assert.equal(await present(pool, 'public._migrations'), null)
  } finally { resume() }
  const outcome = await firstOutcome
  if (outcome.error) throw outcome.error
  assert.deepEqual(outcome.value.applied, [migration.id])
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public._migrations')).rows[0].n, 1)
  check('native-two-real-connections-exclude-concurrent-execution')
})
await withPool('migration_rollback', async pool => {
  let effectsReached = false
  const connect = async () => {
    const client = await pool.connect()
    return { async query(sql, values) {
      const result = await client.query(sql, values)
      if (sql === migration.sql) {
        // Execute the EXACT trusted migration, then fail on the SAME PG transaction.
        effectsReached = true
        await client.query('SELECT 1 / 0')
      }
      return result
    }, release(discard) { client.release(discard) } }
  }
  await assert.rejects(runMigrations({ connect, source }), /MIGRATION_DATABASE_FAILURE/)
  assert.equal(effectsReached, true)
  for (const name of ['organizations', 'feature_flags', 'audit_logs', 'security_events', '_migrations']) {
    assert.equal(await present(pool, 'public.' + name), null)
  }
  check('native-failure-rolls-back-effects-and-history-together')
})
process.stdout.write(JSON.stringify(results))
"""


FIRST_ACTOR_DIAGNOSTICS = r"""
const diagnosticErrors = new WeakMap()
const sqlstates = new Set(['42501','23502','23503','23505','23514','42P01','42703','42883','42601','55006','40P01','40001','57014','P0001','08006'])
const safeAssertions = new Set(['FA-A014', 'FA-A016', 'FA-A017', 'FA-A018', 'FA-A019', 'FA-A020', 'FA-A022', 'FA-A023']) // populated with explicitly selected count/boolean assertions below
let phase = 'FA-SETUP'
function failure(error) {
 const id = diagnosticErrors.get(error) ?? phase
 const state = sqlstates.has(error?.code) ? error.code : null
 const type = error instanceof assert.AssertionError ? 'AssertionError' : state ? 'PostgreSQLError' : error instanceof TypeError ? 'TypeError' : 'OtherError'
 const result = {id, type, sqlstate:state}
 if (type === 'AssertionError' && safeAssertions.has(id)) {
  for (const key of ['actual','expected']) {
   const v=error[key]
   if (typeof v==='boolean'||(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000)) result[key]=v
  }
 }
 return result
}
function assertion(id) {
 const mark = error => { if(error && typeof error==='object') diagnosticErrors.set(error,id); throw error }
 return Object.fromEntries(['equal','deepEqual','ok','match','rejects','throws'].map(method=>[method,(...args)=>{
  try {const value=assert[method](...args);return value instanceof Promise ? value.catch(mark) : value} catch(error){return mark(error)}
 }]))
}
"""

FIRST_ACTOR_NATIVE_CHECKS = FIRST_ACTOR_DIAGNOSTICS + r"""
// This body is reachable ONLY through --first-actor in the owned PG16 harness.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHmac, randomUUID } from 'node:crypto'
import pg from 'pg'
import { URI, TOTP } from 'otpauth'
import { verify } from 'argon2'
import { loadTrustedMigrations, loadTrustedB1Baseline } from './scripts/trusted-migrations.mjs'
import { createFirstActorCeremony, firstActorRules } from './lib/b1/first-actor.ts'
import { openEnrollmentSecret } from './lib/b1/ceremony-preparation.ts'
import { canonical } from './lib/b1/contracts.ts'
import { numeric } from './lib/b1/config.ts'
const socket=process.env.CLEANOPS_NATIVE_SOCKET
assert(socket && socket.startsWith('/tmp/cleanops-staging-pg-'))
const password=fs.readFileSync(process.env.CLEANOPS_NATIVE_PASSWORD_FILE,'utf8')
const results=[], pools=[], held=[]
const check=name=>results.push({name,status:'PASS'})
function pool(database,user='cleanops_bootstrap',tag='first-actor-native') {
  const p=new pg.Pool({host:socket,port:5432,database,user,password:user==='cleanops_bootstrap'?password:undefined,
    ssl:false,options:'',application_name:tag,max:4,connectionTimeoutMillis:3000,statement_timeout:10000})
  pools.push(p);return p
}
let root=pool('cleanops_staging')
const [proposal]=await loadTrustedMigrations(undefined,'b1',true),baseline=await loadTrustedB1Baseline()
assertion('FA-A001').equal(proposal.id,'0002_first_actor');assertion('FA-A002').deepEqual(await loadTrustedMigrations(undefined,'b1'),[])
const aead=Buffer.alloc(32,41),recovery=Buffer.alloc(32,71),testPassword='native-synthetic-only-not-operational'
const manifest={installationId:randomUUID(),operationId:randomUUID(),tenantId:randomUUID(),userId:randomUUID(),principalId:randomUUID(),
 tenantName:'Synthetic installation',displayName:'Synthetic actor',email:'first@example.invalid',accountLabel:'synthetic-only',approval:'FIRST_ACTOR_NATIVE_EPHEMERAL_ONLY'}
const key=purpose=>({tenantId:manifest.tenantId,purpose,keyId:'synthetic-'+purpose,version:1})
const totpKeyVersion='synthetic-totp-1'
const custody={async withKeys(refs,lifetime,work){
 assertion('FA-A003').deepEqual(refs,[key('totp-aead'),key('recovery-hmac')])
 const a=Buffer.from(aead),r=Buffer.from(recovery);held.push(a,r);const end=performance.now()+lifetime
 try{return await work((ref,fn)=>fn(ref.purpose==='totp-aead'?a:r),{remainingMs:()=>end-performance.now(),acknowledgeCommit(){}})}
 finally{a.fill(0);r.fill(0)}
}}
const deps={custody,totpKey:key('totp-aead'),recoveryKey:key('recovery-hmac'),totpKeyVersion,lifetimeMs:30000,
 passwordAdmission:async p=>p===testPassword,normalizeEmail:s=>s.toLowerCase()}
const ceremony=(p,m=manifest)=>createFirstActorCeremony(p,m,deps)
const value=async(p,sql,args)=>(await p.query(sql,args)).rows[0]
async function denied(p,sql,args){await assertion('FA-A004').rejects(p.query(sql,args),e=>e.code==='42501')}
async function prepare(c){const p=await c.prepare(testPassword);assertion('FA-A005').ok('capability' in p);return p}
async function confirm(c,p){const otp=URI.parse(p.provisioningUri);assertion('FA-A006').ok(otp instanceof TOTP);return c.confirm(p.capability,otp.generate(),true)}
async function uncertain(p,operation,work){
 let armed=true
 const wrapped={async connect(){const c=await p.connect();let target=false
  return {async query(sql,args){if(sql.includes('first_actor_'+operation))target=true
   const r=await c.query(sql,args)
   if(sql==='COMMIT'&&target&&armed){armed=false;throw Error('SYNTHETIC_ACK_LOST_AFTER_REAL_COMMIT')}
   return r},release(discard){c.release(discard)}}}}
 await assertion('FA-A007').rejects(work(ceremony(wrapped)));assertion('FA-A008').equal(armed,false)
}
// A real function runs on connection A and holds its transaction open. Connection B
// MUST be observed waiting on a PG lock held by A before the barrier is released.
async function lockedRace(database,operation,first,second){
 const tag='fa-contender-'+randomUUID(),p=pool(database,'fa_native_executor'),q=pool(database,'fa_native_executor',tag)
 let entered,release
 const acquired=new Promise(r=>{entered=r}),barrier=new Promise(r=>{release=r})
 const wrapped={async connect(){const c=await p.connect();return{async query(sql,args){const r=await c.query(sql,args)
  if(sql.includes('first_actor_'+operation)){entered();await barrier}return r},release(d){c.release(d)}}}}
 const settle=p=>p.then(value=>({value}),error=>({error}))
 const one=settle(first(ceremony(wrapped),wrapped))
 let timer,two
 try{
  await Promise.race([acquired,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIRST_BARRIER_NOT_REACHED')),10000)})])
  two=settle(second(ceremony(q),q))
  let blocked=false
  for(let n=0;n<200;n++){
   const r=await root.query('SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type=\'Lock\' AND cardinality(pg_blocking_pids(pid))>0',[tag])
   if(r.rowCount){blocked=true;break}await new Promise(r=>setTimeout(r,10))
  }
  assertion('FA-A009').equal(blocked,true,'SECOND_CONNECTION_MUST_ACTUALLY_WAIT_ON_LOCK')
 }finally{clearTimeout(timer);release()}
 const a=await one,b=two?await two:null;assertion('FA-A010').ok(b);return [a,b]
}
let dbNumber=0
async function scenario(work){
 phase='FA-S'+String(dbNumber+1).padStart(2,'0')
 const name='fa_native_'+(++dbNumber)
 await root.query('CREATE DATABASE '+name+' TEMPLATE first_actor_template')
 const admin=pool(name),executor=pool(name,'fa_native_executor'),reader=pool(name,'fa_native_reader'),outsider=pool(name,'fa_native_outsider')
 return work({name,admin,executor,reader,outsider,c:ceremony(executor)})
}
try{
 assertion('FA-A011').match((await value(root,'SHOW server_version')).server_version,/^16\./)
 assertion('FA-A012').equal((await value(root,'SELECT checksum FROM public._migrations WHERE id=$1',[baseline.id])).checksum,baseline.sha256)
 const client=await root.connect()
 try{
  await client.query('BEGIN');await client.query(proposal.sql);await client.query('COMMIT')
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 assertion('FA-A013').equal((await value(root,"SELECT count(*)::int AS n FROM public._migrations")).n,1)
 // Fixture-only LOGINs, no passwords or operational credentials; local Unix trust
 // inside the owned network-none container. Production HBA/TLS is NOT covered.
 await root.query('CREATE ROLE fa_native_executor LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE fa_native_reader LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE fa_native_outsider LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT cleanops_first_actor_executor TO fa_native_executor WITH INHERIT TRUE, SET FALSE; GRANT cleanops_first_actor_reader TO fa_native_reader WITH INHERIT TRUE, SET FALSE')
 // Close every connection to the source before cloning; do not reinstall SQL14.
 // root is itself on cleanops_staging, so clone from a separate admin DB connection.
 const cluster=pool('postgres');await root.end();pools.splice(pools.indexOf(root),1)
 await cluster.query('CREATE DATABASE first_actor_template TEMPLATE cleanops_staging')
 // Subsequent administrative control uses postgres, never a remote endpoint.
 root=cluster
 check('first-actor-exact-proposal-native-install-over-sql14-no-apply-queue')
 await scenario(async({admin,executor,reader,outsider,c})=>{
  phase='FA-S01-ROLES'
  const roles=await admin.query("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname LIKE 'cleanops_first_actor_%'")
  assertion('FA-A014').equal(roles.rowCount,3)
  for(const r of roles.rows)assertion('FA-A015').ok(!r.rolcanlogin&&!r.rolsuper&&!r.rolcreatedb&&!r.rolcreaterole&&!r.rolreplication&&!r.rolbypassrls)
  phase='FA-S01-MEMBERSHIPS'
  const memberships=await admin.query("SELECT granted.rolname,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid WHERE member.rolname='fa_native_executor'")
  assertion('FA-A016').deepEqual(memberships.rows,[{rolname:'cleanops_first_actor_executor',inherit_option:true,set_option:false}])
  await denied(executor,'SET ROLE cleanops_first_actor_owner');await denied(executor,'SET ROLE cleanops_first_actor_executor')
  phase='FA-S01-EXECUTE'
  const functions=await admin.query("SELECT p.oid,p.proname,has_function_privilege('fa_native_executor',p.oid,'EXECUTE') AS executor,has_function_privilege('fa_native_reader',p.oid,'EXECUTE') AS reader,has_function_privilege('fa_native_outsider',p.oid,'EXECUTE') AS outsider FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity_provision'")
  assertion('FA-A017').equal(functions.rowCount,10)
  const allowed=['begin','stage','material','confirm','denied','abort','commit','status'].map(n=>'first_actor_'+n)
  for(const f of functions.rows){assertion('FA-A018').equal(f.executor,allowed.includes(f.proname));assertion('FA-A019').equal(f.reader,f.proname==='first_actor_status');assertion('FA-A020').equal(f.outsider,false)}
  phase='FA-S01-DIRECT-ACCESS'
  for(const table of ['identity_provision.first_actor','identity_provision.first_actor_history','identity_provision.events','app.users','app.organizations','app.mfa_methods','app.recovery_codes','app.audit_logs','identity_private.credentials']){
   for(const p of [executor,reader,outsider]){await denied(p,'SELECT * FROM '+table);await denied(p,'DELETE FROM '+table)}
   for(const role of ['fa_native_executor','fa_native_reader','fa_native_outsider'])assertion('FA-A021').equal((await value(admin,"SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed",[role,table])).allowed,false)
  }
  phase='FA-S01-RLS'
  const rls=await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY($1::regclass[])",[['app.organizations','app.users','app.mfa_methods','app.recovery_codes','app.audit_logs','identity_private.principals','identity_private.credentials','identity_private.configuration']])
  assertion('FA-A022').equal(rls.rowCount,8);assertion('FA-A023').ok(rls.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity))
  phase='FA-S01-OWNER-SCOPE'
  const owner=await admin.connect()
  try{await owner.query('BEGIN');await owner.query('SET LOCAL ROLE cleanops_first_actor_owner');await denied(owner,"INSERT INTO app.organizations(id,name,state,created_at,version) VALUES(gen_random_uuid(),'forbidden','ACTIVE',now(),1)")}
  finally{await owner.query('ROLLBACK');owner.release()}
  await assertion('FA-A024').rejects(()=>ceremony(outsider).status());await assertion('FA-A025').rejects(()=>ceremony(reader).prepare(testPassword))
  phase='FA-S01-PREPARE'
  const p=await prepare(c);await assertion('FA-A026').rejects(()=>ceremony(reader).status())
  await assertion('FA-A027').rejects(()=>c.confirm(p.capability,'invalid',true));await assertion('FA-A028').rejects(()=>c.confirm(p.capability,'000000',false))
  phase='FA-S01-CONFIRM-COMMIT'
  await confirm(c,p);await c.commit(p.capability);assertion('FA-A029').equal((await ceremony(reader).status()).state,'COMMITTED')
  check('first-actor-native-roles-execute-rls-direct-access-denied')
 })
 await scenario(async({admin,c,executor,reader})=>{
  const p=await prepare(c);assertion('FA-A030').equal((await c.prepare('ignored')).state,'PREPARED')
  await confirm(c,p)
  // Real PG trigger, test fault only: business writes precede audit failure.
  await admin.query("CREATE FUNCTION public.fa_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END $$; CREATE TRIGGER fa_fail_audit BEFORE INSERT ON app.audit_logs FOR EACH ROW EXECUTE FUNCTION public.fa_fail_audit()")
  await assertion('FA-A031').rejects(()=>c.commit(p.capability))
  for(const table of ['app.organizations','app.users','app.mfa_methods','app.recovery_codes','identity_private.principals','identity_private.credentials','identity_private.configuration','app.audit_logs'])assertion('FA-A032').equal((await value(admin,'SELECT count(*)::int AS n FROM '+table)).n,0)
  assertion('FA-A033').equal((await c.status()).state,'CONFIRMED')
  await admin.query('DROP TRIGGER fa_fail_audit ON app.audit_logs; DROP FUNCTION public.fa_fail_audit()')
  await uncertain(executor,'commit',x=>x.commit(p.capability))
  const receipt=await c.status();assertion('FA-A034').equal(receipt.state,'COMMITTED');assertion('FA-A035').deepEqual(await c.commit(p.capability),receipt)
  assertion('FA-A036').deepEqual(await ceremony(reader).status(),receipt)
  assertion('FA-A037').equal((await value(admin,'SELECT count(*)::int AS n FROM app.users')).n,1)
  assertion('FA-A038').equal((await value(admin,'SELECT count(*)::int AS n FROM app.audit_logs')).n,1)
  assertion('FA-A039').equal((await value(admin,"SELECT count(*)::int AS n FROM identity_provision.events WHERE transition='COMMITTED'")).n,1)
  const method=await value(admin,'SELECT * FROM app.mfa_methods')
  assertion('FA-A040').equal(method.state,'ACTIVE');assertion('FA-A041').equal(method.algorithm,'SHA256');assertion('FA-A042').ok(method.last_totp_counter!==null)
  const decrypted=openEnrollmentSecret(method.secret_ciphertext,aead,totpKeyVersion,{tenantId:manifest.tenantId,userId:manifest.userId,methodId:method.id,initialMethodVersion:'1',algorithm:'SHA256'})
  try{const otp=URI.parse(p.provisioningUri);assertion('FA-A043').ok(otp instanceof TOTP);assertion('FA-A044').deepEqual(Array.from(decrypted),Array.from(otp.secret.bytes))}finally{decrypted.fill(0)}
  const codes=await admin.query('SELECT digest FROM app.recovery_codes')
  assertion('FA-A045').deepEqual(codes.rows.map(r=>r.digest.toString('hex')).sort(),p.recoveryCodes.map(code=>createHmac('sha256',recovery).update(canonical(['RECOVERY',manifest.tenantId,manifest.userId,code])).digest('hex')).sort())
  assertion('FA-A046').ok(await verify((await value(admin,'SELECT argon2id_hash FROM identity_private.credentials')).argon2id_hash,testPassword))
  assertion('FA-A047').deepEqual((await admin.query('SELECT rule_key FROM app.self_service_rules ORDER BY rule_key')).rows.map(r=>r.rule_key),firstActorRules)
  assertion('FA-A048').equal((await value(admin,'SELECT count(*)::int AS n FROM app.sessions')).n,0)
  assertion('FA-A049').equal((await value(admin,'SELECT deployment_enabled FROM identity_private.configuration')).deployment_enabled,false)
  assertion('FA-A050').equal((await value(admin,'SELECT material FROM identity_provision.first_actor')).material,null)
  await assertion('FA-A051').rejects(()=>c.abort('OPERATOR_CANCELLED'));await assertion('FA-A052').rejects(()=>ceremony(executor,{...manifest,operationId:randomUUID()}).prepare(testPassword))
  assertion('FA-A053').ok(!('capability' in await c.prepare('ignored')))
  check('first-actor-native-audit-rollback-uncertain-commit-persisted-totp-recovery-terminal')
 })
 await scenario(async({admin,c,executor})=>{
  await uncertain(executor,'stage',x=>x.prepare(testPassword))
  assertion('FA-A054').ok(!('capability' in await c.prepare('ignored')))
  await uncertain(executor,'abort',x=>x.abort('DELIVERY_LOST'))
  await c.abort('DELIVERY_LOST');const next=ceremony(executor,{...manifest,operationId:randomUUID()});const p=await prepare(next)
  assertion('FA-A055').equal(p.generation,2);assertion('FA-A056').equal((await c.status()).state,'ABORTED')
  assertion('FA-A057').ok(!('capability' in await c.prepare('ignored')));await assertion('FA-A058').rejects(()=>c.commit(p.capability))
  await assertion('FA-A059').rejects(()=>c.confirm(p.capability,'invalid',true));await c.abort('DELIVERY_LOST')
  assertion('FA-A060').equal((await next.status()).state,'PREPARED')
  const history=await value(admin,'SELECT count(*)::int AS n FROM identity_provision.first_actor_history');assertion('FA-A061').equal(history.n,1)
  assertion('FA-A062').equal((await value(admin,"SELECT count(*)::int AS n FROM identity_provision.events WHERE transition='ABORTED_DELIVERY_LOST'")).n,1)
  await confirm(next,p);await next.commit(p.capability)
  check('first-actor-native-lost-delivery-abort-uncertainty-generation-history')
 })
 for(const reason of ['EXPIRED','ATTEMPTS_EXHAUSTED'])await scenario(async({admin,c,executor})=>{
  const p=await prepare(c)
  if(reason==='EXPIRED')await admin.query("UPDATE identity_provision.first_actor SET expires_at=clock_timestamp()-interval '1 second'")
  else for(let n=0;n<numeric('otp_attempts');n++)await assertion('FA-A063').rejects(()=>c.confirm(p.capability,'invalid',true))
  assertion('FA-A064').equal((await c.status()).state,'EXPIRED');assertion('FA-A065').equal((await value(admin,'SELECT material FROM identity_provision.first_actor')).material,null)
  await c.abort(reason);const next=ceremony(executor,{...manifest,operationId:randomUUID()});const fresh=await prepare(next)
  assertion('FA-A066').equal(fresh.generation,2);await assertion('FA-A067').rejects(()=>next.confirm(p.capability,'invalid',true))
  check('first-actor-native-recover-'+reason.toLowerCase())
 })
 for(const firstOperation of ['abort','abort-confirm','confirm','commit'])await scenario(async({name,c,admin})=>{
  const p=await prepare(c)
  if(['abort','commit'].includes(firstOperation))await confirm(c,p)
  const [a,b]=await lockedRace(name,firstOperation==='abort-confirm'?'abort':firstOperation,
   x=>firstOperation.startsWith('abort')?x.abort('OPERATOR_CANCELLED'):firstOperation==='confirm'?confirm(x,p):x.commit(p.capability),
   x=>firstOperation==='abort'?x.commit(p.capability):firstOperation==='abort-confirm'?confirm(x,p):x.abort('OPERATOR_CANCELLED'))
  assertion('FA-A068').ok(!a.error)
  if(firstOperation==='confirm'){assertion('FA-A069').ok(!b.error);assertion('FA-A070').equal((await c.status()).state,'ABORTED')}
  else {assertion('FA-A071').ok(b.error);assertion('FA-A072').equal((await c.status()).state,firstOperation==='commit'?'COMMITTED':'ABORTED')}
  assertion('FA-A073').equal((await value(admin,'SELECT count(*)::int AS n FROM app.users')).n,firstOperation==='commit'?1:0)
  check('first-actor-native-real-lock-race-'+firstOperation+'-first')
 })
 await scenario(async({name,c,executor,admin})=>{
  await prepare(c)
  const nextManifest={...manifest,operationId:randomUUID()}
  const [a,b]=await lockedRace(name,'abort',x=>x.abort('DELIVERY_LOST'),(_x,q)=>ceremony(q,nextManifest).prepare(testPassword))
  assertion('FA-A074').ok(!a.error&&!b.error);assertion('FA-A075').ok('capability' in b.value);assertion('FA-A076').equal(b.value.generation,2)
  const next=ceremony(executor,nextManifest);await next.abort('OPERATOR_CANCELLED')
  const m1={...manifest,operationId:randomUUID()},m2={...manifest,operationId:randomUUID()}
  const [one,two]=await lockedRace(name,'begin',(_x,p)=>ceremony(p,m1).prepare(testPassword),(_x,q)=>ceremony(q,m2).prepare(testPassword))
  assertion('FA-A077').ok(!one.error&&two.error)
  assertion('FA-A078').equal((await value(admin,'SELECT generation FROM identity_provision.first_actor')).generation,'3')
  check('first-actor-native-real-lock-abort-new-generation-and-competing-generations')
 })
 assertion('FA-A079').ok(held.every(b=>b.every(v=>v===0)))
 process.stdout.write(JSON.stringify(results))
}catch(error){results.push({name:'first-actor-native-failure-redacted',status:'FAIL',diagnostic:failure(error)});process.stdout.write(JSON.stringify(results));process.exitCode=1
}finally{aead.fill(0);recovery.fill(0);await Promise.all(pools.map(p=>p.end()))}
"""


def valid_native_diagnostic(d):
    if d is None:
        return True
    return (isinstance(d, dict) and set(d) <= {"id", "type", "sqlstate", "actual", "expected"}
            and {"id", "type", "sqlstate"} <= set(d)
            and isinstance(d["id"], str) and re.fullmatch(r"FA-(?:A[0-9]{3}|SETUP|S[0-9]{2}(?:-[A-Z-]+)?)", d["id"])
            and d["type"] in ("AssertionError", "PostgreSQLError", "TypeError", "OtherError")
            and d["sqlstate"] in (None, "42501", "23502", "23503", "23505", "23514", "42P01", "42703", "42883", "42601", "55006", "40P01", "40001", "57014", "P0001", "08006")
            and all(type(d[k]) is bool or (type(d[k]) is int and 0 <= d[k] <= 10000) for k in ("actual", "expected") if k in d))


def isolated_environment(inherited):
    env = dict(inherited)
    for k in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
        env.pop(k, None)

    # Node pg receives an explicit owned Unix socket/config; discard operational hints.
    for key in ["DATABASE_URL", "CLEANOPS_TEST_DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD",
                "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGSSLMODE", "PGOPTIONS"]:
        env.pop(key, None)

    return env


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--first-actor", action="store_true", help="Only owned ephemeral FIRST-ACTOR native acceptance")
    parser.add_argument("--authorization", choices=["FIRST-ACTOR-NATIVE-01"])
    options = parser.parse_args(argv)
    if options.first_actor != (options.authorization == "FIRST-ACTOR-NATIVE-01"):
        parser.error("FIRST_ACTOR_EXPLICIT_AUTHORIZATION_REQUIRED")
    owner = "cleanops-staging-pg-" + uuid.uuid4().hex
    container = None
    checks = []
    volume_created = False
    pg_image_id = None
    env = isolated_environment(os.environ)

    def docker(*args, data=None, check=True):
        r = subprocess.run(["docker", "--host=unix:///var/run/docker.sock", *args], input=data,
                           capture_output=True, env=env, timeout=120)
        if check and r.returncode:
            code = re.search(rb"ERROR:\s+([0-9A-Z]{5})\b", r.stderr)
            raise RuntimeError("STAGING_PG_PROCESS_FAILED_" + (code[1].decode() if code else "REDACTED"))
        return r

    def load():
        spec = importlib.util.spec_from_file_location("actual_sql_installer", ROOT / "scripts/staging-sql14.py")
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        return m

    status = "FAIL"
    try:
        # Existing CI installs the reviewed lock with scripts disabled before this harness.
        probe = subprocess.run(["node", "--input-type=module", "-e", "await import('pg')"],
                               cwd=ROOT, env=env, capture_output=True, timeout=30)
        if probe.returncode:
            raise RuntimeError("LOCKED_NODE_PG_DEPENDENCIES_REQUIRED")
        docker("volume", "create", "--label", "cleanops.staging-pg=" + owner, owner)
        volume_created = True
        with tempfile.TemporaryDirectory(prefix=owner, dir="/tmp") as d:
            socket = Path(d) / "pg-socket"; socket.mkdir(mode=0o770)
            password = Path(d) / "synthetic-password"
            password.write_text(uuid.uuid4().hex)
            subprocess.run(["sudo", "chgrp", "999", d, str(password), str(socket)], check=True, capture_output=True)
            Path(d).chmod(0o750); password.chmod(0o640); socket.chmod(0o770)
            args = ["run", "-d", "--network=none", "--cap-drop=ALL", "--security-opt=no-new-privileges",
                    "--label", "cleanops.staging-pg=" + owner,
                    "--label", "com.docker.compose.project=" + json.loads((ROOT / "deploy/staging/RESOURCE_RECORD.json").read_text())["STAGING_SYNTHETIC"]["composeProject"],
                    "--label", "com.docker.compose.service=postgres",
                    "-e", "POSTGRES_DB=cleanops_staging", "-e", "POSTGRES_USER=cleanops_bootstrap",
                    "-e", "POSTGRES_PASSWORD_FILE=/run/secrets/password",
                    "--mount", "type=bind,src=" + str(password) + ",dst=/run/secrets/password,readonly",
                    "--mount", "type=bind,src=" + str(socket) + ",dst=/run/cleanops-native-socket",
                    "-v", owner + ":/var/lib/postgresql/data"]
            if options.first_actor:
                args.extend(["--pull=never", "--cpus=1", "--memory=768m", "--pids-limit=128"])
            server = ["postgres:16-bookworm", "-c", "unix_socket_directories=/var/run/postgresql,/run/cleanops-native-socket"]
            if not options.first_actor:
                # Reproduce the old root+drop-ALL incompatibility before testing the fixed recipe.
                container = docker(*args, *server).stdout.decode().strip()
                for _ in range(30):
                    meta = json.loads(docker("inspect", container).stdout)[0]
                    if not meta["State"]["Running"]: break
                    time.sleep(0.25)
                assert not meta["State"]["Running"], "ROOT_DROP_ALL_FAILURE_NOT_REPRODUCED"
                checks.append({"name": "old-root-drop-all-startup-failure-reproduced", "status": "PASS"})
                docker("rm", "-f", container); container = None
            container = docker(*args, "--user=postgres", *server).stdout.decode().strip()
            for _ in range(100):
                logs = docker("logs", container, check=False)
                initialized = b"init process complete; ready for start up" in logs.stdout + logs.stderr
                probe = docker("exec", container, "psql", "-XqAt", "-U", "cleanops_bootstrap", "-d", "cleanops_staging", "-c", "SELECT 1", check=False)
                if initialized and probe.returncode == 0 and probe.stdout.strip() == b"1": break
                time.sleep(0.25)
            else: raise RuntimeError("NONROOT_PG16_NOT_READY")
            checks.append({"name": "fixed-nonroot-pg16-starts-with-drop-all", "status": "PASS"})
            m = load()
            compose_env = Path(d) / "staging.env"
            # Synthetic fixture outside checkout. No operational env file is consulted.
            compose_env.write_text("COMPOSE_NATIVE_FIXTURE_ONLY=yes\n")
            compose_env.chmod(0o600)

            def runner(arguments, data=None):
                if arguments[0] == "inspect": return docker(*arguments).stdout.decode()
                if "ps" in arguments: return container
                command = arguments[arguments.index("psql"):]
                return docker("exec", "-i", container, *command, data=data).stdout.decode().strip()

            record = json.loads((ROOT / "deploy/staging/RESOURCE_RECORD.json").read_text())
            record["STAGING_SYNTHETIC"].update(deploymentAuthorized=True,
                deploymentApprovalReference="CI_SYNTHETIC_ONLY_NO_HOSTINGER", sql14FreshInstallAuthorized=True)
            assert m.install(record, True, runner, compose_env_file=compose_env).startswith("EXACT_SQL14_INSTALLED")
            checks.append({"name": "exact-sql14-verified-installer-fresh-real-pg16", "status": "PASS"})
            if not options.first_actor:
                try: m.install(record, True, runner, compose_env_file=compose_env)
                except ValueError: pass
                else: raise RuntimeError("REINSTALL_NOT_DENIED")
                checks.append({"name": "existing-installed-state-rejected-no-overwrite", "status": "PASS"})
            meta = json.loads(docker("inspect", container).stdout)[0]
            if (meta["Config"]["Labels"].get("cleanops.staging-pg") != owner
                or meta["HostConfig"].get("NetworkMode") != "none"
                or meta["HostConfig"].get("PortBindings")
                or not any(v.get("Source") == str(socket) and v.get("Destination") == "/run/cleanops-native-socket" for v in meta["Mounts"])):
                raise RuntimeError("NATIVE_SOCKET_OWNERSHIP_REQUIRED")
            pg_image_id = meta["Image"]
            native_env = dict(env, CLEANOPS_NATIVE_SOCKET=str(socket), CLEANOPS_NATIVE_PASSWORD_FILE=str(password))
            result = subprocess.run(["node", "--experimental-strip-types", "--input-type=module", "-"], cwd=ROOT, env=native_env,
                                    input=(FIRST_ACTOR_NATIVE_CHECKS if options.first_actor else NATIVE_MIGRATION_CHECKS).encode(), capture_output=True, timeout=300 if options.first_actor else 120)
            if result.returncode:
                if options.first_actor:
                    try:
                        partial = json.loads(result.stdout)
                        if isinstance(partial, list) and all(isinstance(c, dict) and
                                set(c) in ({"name", "status"}, {"name", "status", "diagnostic"}) and
                                valid_native_diagnostic(c.get("diagnostic")) and re.fullmatch(r"first-actor-[a-z0-9_-]+", c["name"]) and
                                c["status"] in ("PASS", "FAIL") for c in partial):
                            checks.extend(partial)
                    except (ValueError, TypeError, KeyError):
                        pass
                raise RuntimeError("NATIVE_MIGRATION_CHECKS_FAILED_REDACTED")
            native_checks = json.loads(result.stdout)
            if len(native_checks) != (11 if options.first_actor else 7) or any(item.get("status") != "PASS" for item in native_checks):
                raise RuntimeError("NATIVE_MIGRATION_CHECKS_INCOMPLETE")
            checks.extend(native_checks)
            status = "PASS"
    except Exception as error:
        checks.append({"name": "native-pg-execution", "status": "FAIL", "detail":
                       str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__})
    finally:
        if container:
            meta = json.loads(docker("inspect", container).stdout)[0]
            if meta["Config"]["Labels"].get("cleanops.staging-pg") != owner: raise RuntimeError("CLEANUP_OWNER_MISMATCH")
            docker("rm", "-f", container)
        if volume_created:
            meta = json.loads(docker("volume", "inspect", owner).stdout)[0]
            if meta["Labels"].get("cleanops.staging-pg") != owner: raise RuntimeError("CLEANUP_VOLUME_MISMATCH")
            docker("volume", "rm", owner)
        artifacts = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in
                     ["scripts/test-staging-postgres.py", "db/migrations/0002_first_actor.review.sql",
                      "docs/proposals/b1-consolidated-sql/revisions/14/schema.review.sql"]} if options.first_actor else {}
        source_commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                                       text=True, timeout=10).stdout.strip() if options.first_actor else None
        report = {"sourceCommit": source_commit, "pgImageId": pg_image_id, "artifactSha256": artifacts, "scope": "FIRST_ACTOR_NATIVE_EPHEMERAL" if options.first_actor else "STAGING_SYNTHETIC_PG_PACKAGING", "result": status, "checks": checks, "cleanup": "PASS",
                  "runtime": "closedBackend", "hostingerAccessed": False}
        path = ROOT / "artifacts/staging-synthetic"; path.mkdir(parents=True, exist_ok=True)
        (path / ("first-actor-native.json" if options.first_actor else "postgres-smoke.json")).write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception: raise SystemExit("STAGING_PG_SMOKE_FAILED_REDACTED")
