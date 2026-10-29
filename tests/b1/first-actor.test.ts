import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { URI, TOTP } from 'otpauth'
import { createFirstActorCeremony, firstActorRules, type FirstActorManifest } from '../../lib/b1/first-actor.ts'
import { canonical } from '../../lib/b1/contracts.ts'
import { numeric } from '../../lib/b1/config.ts'
import type { IdentityPool } from '../../lib/b1/pg-identity-driver.ts'
import type { PrivateCustody } from '../../lib/b1/custody-composition.ts'

const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`
const manifest:FirstActorManifest={installationId:id(1),operationId:id(2),tenantId:id(3),userId:id(4),principalId:id(5),tenantName:'Synthetic installation',displayName:'Synthetic actor',email:'first@example.invalid',accountLabel:'synthetic-only',approval:'OFFLINE_REVIEW_ONLY'}
type Row={input:string;digest:string;state:string;expiresAt:number;material:Record<string,unknown>|null;receipt:Record<string,unknown>|null;attempts:number}
function fixture(){
  let clock=Date.now(),durable:Row|null=null,tail=Promise.resolve(),admissions=0,effects=0,loseCommit=false,losePreparation=false,failAudit=false,rejectPassword=false
  const held:Buffer[]=[]
  const recoveryKey=Buffer.alloc(32,71)
  const pool:IdentityPool={async connect(){
    let tx:Row|null=null,unlock:(()=>void)|undefined,transactionEffects=0
    return {async query(sql,values=[]){
      if(sql.startsWith('BEGIN')){
        const previous=tail;tail=new Promise<void>(resolve=>{unlock=resolve});await previous
        tx=structuredClone(durable);transactionEffects=effects;return {rows:[]}
      }
      if(sql==='ROLLBACK'){unlock?.();unlock=undefined;return {rows:[]}}
      if(sql==='COMMIT'){
        durable=structuredClone(tx);effects=transactionEffects;unlock?.();unlock=undefined
        if(loseCommit&&tx?.state==='COMMITTED'){loseCommit=false;throw Error('PRIVATE_LOST_COMMIT')}
        if(losePreparation&&tx?.state==='PREPARED'){losePreparation=false;throw Error('PRIVATE_LOST_PREPARE')}
        return {rows:[]}
      }
      if(sql.startsWith('SELECT pg_catalog.set_config'))return {rows:[]}
      let value:unknown
      const status=()=>{
        if(tx&&tx.state!=='COMMITTED'&&tx.expiresAt<=clock){tx.state='EXPIRED';tx.material=null}
        return tx?{state:tx.state,expiresAt:tx.expiresAt,receipt:tx.receipt}:{state:'ABSENT'}
      }
      if(sql.includes('first_actor_begin')){
        const input=String(values[0]),digest=(values[1] as Buffer).toString('hex')
        if(tx&&(tx.input!==input||tx.digest!==digest))throw Error('PRIVATE_MANIFEST_CONFLICT')
        tx??={input,digest,state:'RESERVED',expiresAt:clock+600000,material:null,receipt:null,attempts:0}
        value=status()
      }else{
        if(tx&&(JSON.parse(tx.input).installationId!==values[0]||JSON.parse(tx.input).operationId!==values[1]||tx.digest!==(values[2] as Buffer).toString('hex')))throw Error('PRIVATE_SCOPE_CONFLICT')
        if(sql.includes('first_actor_status'))value=status()
        else if(sql.includes('first_actor_denied')){
          if(failAudit)throw Error('PRIVATE_AUDIT_FAILURE')
          if(tx?.state==='PREPARED'&&++tx.attempts>=numeric('otp_attempts')){tx.state='EXPIRED';tx.material=null}
          value=true
        }
        else if(sql.includes('first_actor_stage')){
          assert.equal(tx?.state,'RESERVED');tx!.material=JSON.parse(String(values[3]));tx!.state='PREPARED';value=status()
        }else if(sql.includes('first_actor_material')){
          status()
          value=tx?.state==='PREPARED'&&tx.material?.capDigest===(values[3] as Buffer).toString('hex')?tx.material:null
        }else if(sql.includes('first_actor_confirm')){
          value=tx?.state==='PREPARED'&&tx.material?.capDigest===(values[3] as Buffer).toString('hex')&&values[5]===true
          if(value){tx!.state='CONFIRMED';tx!.material!.counter=values[4]}
        }else if(sql.includes('first_actor_commit')){
          status()
          if(tx?.state==='COMMITTED')value=status()
          else {
            if(tx?.state!=='CONFIRMED'||tx.material?.capDigest!==(values[3] as Buffer).toString('hex'))throw Error('PRIVATE_STATE')
            transactionEffects++ // business writes precede audit, but are not durable yet
            if(failAudit)throw Error('PRIVATE_AUDIT_FAILURE')
            tx.state='COMMITTED';tx.receipt={installationId:values[0],operationId:values[1],requestDigest:tx.digest};tx.material=null;value=status()
          }
        }else throw Error('Unexpected protocol')
      }
      return {rows:[{value}]}
    },release(){unlock?.();unlock=undefined}}
  }}
  const custody:PrivateCustody={async withKeys(refs,lifetime,work){
    assert.ok(refs.every(r=>r.tenantId===manifest.tenantId))
    const aead=Buffer.alloc(32,41),recovery=Buffer.from(recoveryKey);held.push(aead,recovery)
    const until=performance.now()+lifetime
    try{return await work((ref,fn)=>fn(ref.purpose==='totp-aead'?aead:recovery),{remainingMs(){return until-performance.now()},acknowledgeCommit(){}})}finally{aead.fill(0);recovery.fill(0)}
  }}
  const deps={custody,totpKey:{tenantId:manifest.tenantId,purpose:'totp-aead' as const,keyId:'synthetic-totp',version:1},totpKeyVersion:'synthetic-totp-1',recoveryKey:{tenantId:manifest.tenantId,purpose:'recovery-hmac' as const,keyId:'synthetic-recovery',version:1},lifetimeMs:30000,passwordAdmission:async()=>{admissions++;return !rejectPassword},normalizeEmail:(email:string)=>email.toLowerCase(),now:()=>clock}
  return {create:(m=manifest)=>createFirstActorCeremony(pool,m,deps),held,recoveryKey,admissions:()=>admissions,effects:()=>effects,row:()=>durable,
    expire(){clock+=600001},loseCommit(){loseCommit=true},losePreparation(){losePreparation=true},rejectPassword(){rejectPassword=true},auditFailure(value:boolean){failAudit=value}}
}

test('FIRST-ACTOR concurrent preparation delivers once, confirms TOTP/recovery and recovers an uncertain atomic commit (simulation)',async()=>{
  const f=fixture(),ceremony=f.create()
  const responses=await Promise.all([ceremony.prepare('synthetic-password-not-a-real-credential'),ceremony.prepare('ignored-on-retry')])
  const prepared=responses.find(r=>'capability' in r)
  assert.ok(prepared&&'capability' in prepared)
  assert.equal(responses.filter(r=>'capability' in r).length,1);assert.equal(f.admissions(),1)
  assert.ok(!JSON.stringify(prepared).includes(prepared.capability))
  const stored=f.row()!.material!
  assert.deepEqual(stored.recovery,prepared.recoveryCodes.map(code=>createHmac('sha256',f.recoveryKey).update(canonical(['RECOVERY',manifest.tenantId,manifest.userId,code])).digest('hex')))
  const totp=URI.parse(prepared.provisioningUri);assert.ok(totp instanceof TOTP)
  await assert.rejects(()=>ceremony.confirm(prepared.capability,totp.generate(),false))
  await assert.rejects(()=>ceremony.confirm(prepared.capability,'invalid',true))
  assert.equal((await ceremony.status()).state,'PREPARED')
  assert.equal((await ceremony.confirm(prepared.capability,totp.generate(),true)).state,'CONFIRMED')
  await assert.rejects(()=>ceremony.confirm(prepared.capability,totp.generate(),true))
  f.auditFailure(true);await assert.rejects(()=>ceremony.commit(prepared.capability));assert.equal(f.effects(),0)
  f.auditFailure(false);f.loseCommit()
  const commits=await Promise.allSettled([ceremony.commit(prepared.capability),ceremony.commit(prepared.capability)])
  assert.equal(commits.filter(r=>r.status==='rejected').length,1)
  assert.equal(commits.filter(r=>r.status==='fulfilled').length,1)
  const receipt=await ceremony.status();assert.equal(receipt.state,'COMMITTED');assert.equal(f.effects(),1)
  assert.deepEqual(await ceremony.commit(prepared.capability),receipt)
  assert.ok(!('recoveryCodes' in await ceremony.prepare('ignored')));assert.equal(f.admissions(),1)
  assert.equal(f.effects(),1);assert.deepEqual(firstActorRules,Array.from({length:8},(_,i)=>`B1-SELF-0${i+1}`))
  assert.ok(f.held.every(key=>key.every(byte=>byte===0)))
})

test('FIRST-ACTOR lost preparation acknowledgement never reissues secrets; password rejection rolls back reservation (simulation)',async()=>{
  const lost=fixture(),ceremony=lost.create();lost.losePreparation()
  await assert.rejects(()=>ceremony.prepare('synthetic-password-only'))
  const replay=await ceremony.prepare('must-not-be-rehashed')
  assert.equal(replay.state,'PREPARED');assert.ok(!('capability' in replay));assert.equal(lost.admissions(),1)
  const denied=fixture();denied.rejectPassword()
  await assert.rejects(()=>denied.create().prepare('synthetic-denied'))
  assert.equal((await denied.create().status()).state,'ABSENT')
  assert.equal(denied.effects(),0);assert.ok(denied.held.every(key=>key.every(b=>b===0)))
})

test('FIRST-ACTOR expiry, capability and immutable installation/operation isolation fail closed without regeneration (simulation)',async()=>{
  const f=fixture(),ceremony=f.create(),prepared=await ceremony.prepare('synthetic-password-only')
  assert.ok('capability' in prepared)
  await assert.rejects(()=>ceremony.confirm('A'.repeat(43),'000000',true))
  await assert.rejects(()=>f.create({...manifest,operationId:id(9)}).prepare('ignored'))
  await assert.rejects(()=>f.create({...manifest,installationId:id(9)}).status())
  assert.throws(()=>f.create({...manifest,tenantId:id(9)}))
  f.expire();assert.equal((await ceremony.status()).state,'EXPIRED');assert.equal(f.row()!.material,null)
  await assert.rejects(()=>ceremony.commit(prepared.capability))
  assert.equal((await ceremony.prepare('ignored')).state,'EXPIRED');assert.equal(f.admissions(),1);assert.equal(f.effects(),0)
  assert.ok(f.held.every(key=>key.every(byte=>byte===0)))
})

test('FIRST-ACTOR factor denials commit the canonical attempt limit and erase expired material (simulation)',async()=>{
  const f=fixture(),ceremony=f.create(),prepared=await ceremony.prepare('synthetic-password-only')
  assert.ok('capability' in prepared)
  for(let i=0;i<numeric('otp_attempts');i++)await assert.rejects(()=>ceremony.confirm(prepared.capability,'invalid',true))
  assert.equal((await ceremony.status()).state,'EXPIRED');assert.equal(f.row()!.material,null)
  assert.equal(f.effects(),0);assert.equal(f.admissions(),1)
})
