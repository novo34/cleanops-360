import test from 'node:test'
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { createMailDispatchStore } from '../../lib/b1/mail-dispatch-store.ts'
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const row=()=>({tenantId:id(1),userId:id(2),methodId:id(3),methodVersion:'1',recipientVersion:'1',outboxId:id(4),challengeId:id(5),ciphertext:'02'+'ab'.repeat(60),keyVersion:'v1',expiresAt:'2030-01-01T00:00:00Z'})
test('worker broker calls are parameterized and material is returned only after COMMIT',async()=>{
 const calls:{sql:string;values:unknown[]|undefined}[]=[];const releases:boolean[]=[]
 const store=createMailDispatchStore({connect:async()=>({query:async(sql,values)=>{calls.push({sql,values});return {rows:[{value:sql.includes('claim_mail_v2')?row():true}]}},release:d=>{releases.push(!!d)}})})
 const digest=Buffer.alloc(32,2),correlation=id(6);const claim=await store.claim(digest,correlation);assert.ok(claim)
 assert.equal(calls[0].sql,'BEGIN ISOLATION LEVEL READ COMMITTED');assert.equal(calls[2].sql,'COMMIT')
 assert.equal(calls[1].values?.[0],digest);assert.equal(calls[1].values?.[1],correlation)
 assert.equal(JSON.stringify(claim).includes('abab'),false);assert.equal(inspect(claim).includes('abab'),false)
 assert.equal(await store.authorizeDispatch(claim,digest,correlation),true)
 assert.equal(await store.finish(claim,digest,'UNKNOWN',correlation),true)
 assert.deepEqual(releases,[false,false,false]);assert.equal(calls.some(c=>/SET ROLE|FROM app\./.test(c.sql)),false)
 claim.ciphertext.fill(0)
})
test('malformed broker result and failed COMMIT rollback/discard without exposing claim',async()=>{
 for(const mode of ['malformed','commit'] as const){
  const calls:string[]=[];let discarded=false
  const store=createMailDispatchStore({connect:async()=>({query:async sql=>{calls.push(sql);if(sql==='COMMIT'&&mode==='commit')throw Error('private-sql-detail');return {rows:[{value:mode==='malformed'?{...row(),recipientVersion:null}:row()}]}},release:d=>{discarded=!!d}})})
  await assert.rejects(store.claim(Buffer.alloc(32,2),id(6)))
  assert.equal(calls.at(-1),'ROLLBACK');assert.equal(discarded,true)
 }
})
