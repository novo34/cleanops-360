import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import { createOpenBaoKeys, type PrivateKeyReference } from '../../lib/b1/openbao-keys.ts'
import { createCustodyDeadlinePool } from '../../lib/b1/custody-deadline.ts'
import { createPgIdentityUnitOfWork, type IdentityPool } from '../../lib/b1/pg-identity-driver.ts'

const ref: PrivateKeyReference = {tenantId:'11111111-1111-4111-8111-111111111111',purpose:'otp-hmac',keyId:'fixture',version:1}
const sleep = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms))
function fixture(commitDelay=0,connectDelay=0,configurationDelay=0) {
  const transport=mock.method(https,'request',(_url:URL,_options:unknown,callback:(res:EventEmitter&{statusCode:number;destroy:()=>void})=>void)=>{
    const request=Object.assign(new EventEmitter(),{end(){queueMicrotask(()=>{
      const response=Object.assign(new EventEmitter(),{statusCode:200,destroy(){}})
      callback(response)
      response.emit('data',Buffer.from(JSON.stringify({data:{metadata:{version:1,destroyed:false,deletion_time:''},data:{value:Buffer.alloc(32,19).toString('base64')}}})))
      response.emit('end');request.emit('close')
    })},destroy(){request.emit('close')}})
    return request as never
  })
  let durable=0,pending=0
  const calls:string[]=[],releases:boolean[]=[],budgets:number[]=[]
  const pool:IdentityPool={async connect(){
    await sleep(connectDelay)
    return {async query(sql,values){
      calls.push(sql)
      if(sql.startsWith("SELECT pg_catalog.set_config")){budgets.push(Number(values?.[0]));await sleep(configurationDelay)}
      if(sql==='UPDATE synthetic_fixture SET count = count + 1')pending++
      if(sql==='ROLLBACK')pending=0
      if(sql==='COMMIT'){durable+=pending;pending=0;await sleep(commitDelay)}
      return {rows:[]}
    },release(discard){releases.push(Boolean(discard))}}
  }}
  const provider=createOpenBaoKeys({origin:'https://bao.fixture.invalid',mount:'b1-keys',environment:'synthetic',ca:Buffer.from('fixture-ca'),cert:Buffer.from('fixture-cert'),key:Buffer.from('fixture-key'),token:async()=> 'fixture-token',timeoutMs:100,allowed:[ref]})
  return {provider,pool,calls,releases,budgets,durable:()=>durable,close:()=>transport.mock.restore()}
}
test('expired custody rolls back one-time effects before COMMIT and wipes keys while work is pending',async()=>{
  const f=fixture();let held:Buffer|undefined
  try{
    await assert.rejects(()=>f.provider.withKeys([ref],30,async(borrow,lease)=>{
      held=borrow(ref,key=>key)
      return createPgIdentityUnitOfWork(createCustodyDeadlinePool(f.pool,lease)).run(async connection=>{
        await connection.query('UPDATE synthetic_fixture SET count = count + 1')
        await sleep(70)
        assert.ok(held!.every(value=>value===0),'key must be zeroed before delayed work completes')
        return 'one-time-result'
      })
    }),/AUTH_DEPENDENCY_UNAVAILABLE/)
    assert.equal(f.durable(),0);assert.ok(f.calls.includes('ROLLBACK'));assert.ok(!f.calls.includes('COMMIT'))
    assert.deepEqual(f.releases,[true]);assert.ok(f.budgets.every(value=>value>0&&value<=30))
  }finally{f.close()}
})
test('observed successful COMMIT preserves its one-time result after a late acknowledgement',async()=>{
  const f=fixture(100);let held:Buffer|undefined
  try{
    const result=await f.provider.withKeys([ref],60,async(borrow,lease)=>{
      held=borrow(ref,key=>key)
      const value=await createPgIdentityUnitOfWork(createCustodyDeadlinePool(f.pool,lease)).run(async connection=>{
        await connection.query('UPDATE synthetic_fixture SET count = count + 1')
        return 'one-time-result'
      })
      assert.throws(()=>borrow(ref,key=>key),/AUTH_DEPENDENCY_UNAVAILABLE/)
      return value
    })
    assert.equal(result,'one-time-result');assert.equal(f.durable(),1);assert.ok(!f.calls.includes('ROLLBACK'))
    assert.deepEqual(f.releases,[false]);assert.ok(held!.every(value=>value===0))
  }finally{f.close()}
})
test('a connection obtained after key expiry is discarded without BEGIN or effects',async()=>{
  const f=fixture(0,50)
  try{
    await assert.rejects(()=>f.provider.withKeys([ref],15,async(_borrow,lease)=>
      createPgIdentityUnitOfWork(createCustodyDeadlinePool(f.pool,lease)).run(async()=> 'not-reached')),/AUTH_DEPENDENCY_UNAVAILABLE/)
    assert.deepEqual(f.calls,[]);assert.deepEqual(f.releases,[true]);assert.equal(f.durable(),0)
  }finally{f.close()}
})
test('timeout configuration cannot leave a stale larger budget for a business query',async()=>{
  const f=fixture(0,0,70)
  try{
    await assert.rejects(()=>f.provider.withKeys([ref],50,async(_borrow,lease)=>
      createPgIdentityUnitOfWork(createCustodyDeadlinePool(f.pool,lease)).run(async connection=>{
        await connection.query('UPDATE synthetic_fixture SET count = count + 1')
      })),/AUTH_DEPENDENCY_UNAVAILABLE/)
    assert.equal(f.durable(),0);assert.ok(!f.calls.includes('UPDATE synthetic_fixture SET count = count + 1'))
    assert.ok(f.calls.includes('ROLLBACK'));assert.ok(!f.calls.includes('COMMIT'))
  }finally{f.close()}
})
