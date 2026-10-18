import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import { inspect } from 'node:util'
import { createOpenBaoKeys, type PrivateKeyReference, type OpenBaoKeyOptions } from '../../lib/b1/openbao-keys.ts'
const ref:PrivateKeyReference={tenantId:'11111111-1111-4111-8111-111111111111',purpose:'totp-aead',keyId:'key-v1',version:1}
const secret=Buffer.alloc(32,29).toString('base64')
const options=():OpenBaoKeyOptions=>({origin:'https://bao.fixture.invalid',mount:'b1-keys',environment:'synthetic',ca:Buffer.from('synthetic-ca'),cert:Buffer.from('synthetic-cert'),key:Buffer.from('synthetic-private-key'),token:async()=> 'synthetic-token',timeoutMs:100,allowed:[ref]})
function transport(status:number,value:unknown,onRequest?:(url:URL)=>void){
 return mock.method(https,'request',(url:URL,_options:unknown,callback:(res:EventEmitter&{statusCode:number;destroy:()=>void})=>void)=>{
  onRequest?.(url)
  const req=new EventEmitter() as EventEmitter&{end:()=>void;destroy:()=>void}
  req.destroy=()=>{req.emit('error',new Error('Do not expose transport internals'));req.emit('close')}
  req.end=()=>queueMicrotask(()=>{
   const res=Object.assign(new EventEmitter(),{statusCode:status,destroy:()=>{}});callback(res)
   if(status===200){res.emit('data',Buffer.from(JSON.stringify(value)));res.emit('end')}
   req.emit('close')
  })
  return req as never
 })
}
const response=(version=1,value=secret)=>({data:{metadata:{version,destroyed:false,deletion_time:''},data:{value}}})
test('OpenBao exact authorized version, borrowed keys zeroed, no inspect/JSON secrets',async()=>{
 const mocked=transport(200,response(),url=>assert.equal(url.pathname+url.search,`/v1/b1-keys/data/synthetic/${ref.tenantId}/totp-aead/key-v1?version=1`))
 let held:Buffer|undefined,after:((r:PrivateKeyReference,f:(b:Buffer)=>unknown)=>unknown)|undefined
 try{
  const provider=createOpenBaoKeys(options());assert.ok(!inspect(provider).includes('synthetic-private-key'));assert.ok(!JSON.stringify(provider).includes(secret))
  await provider.withKeys([ref],100,async use=>{after=use;held=use(ref,b=>b);assert.equal(held.toString('base64'),secret)})
  assert.ok(held?.every(v=>v===0));assert.throws(()=>after!(ref,b=>b))
 }finally{mocked.mock.restore()}
})
test('OpenBao partial preload failure wipes prior keys and never runs transaction',async()=>{
 const second={...ref,keyId:'key-v2'};let count=0,ran=false
 const mocked=transport(200,response(),()=>{if(++count===2)throw Error('PRIVATE_CONNECTION_DETAIL')})
 try{await assert.rejects(()=>createOpenBaoKeys({...options(),allowed:[ref,second]}).withKeys([ref,second],100,async()=>{ran=true}),e=>String(e).includes('AUTH_DEPENDENCY_UNAVAILABLE'));assert.equal(ran,false)}finally{mocked.mock.restore()}
})
test('OpenBao denies wrong version, deleted, destroyed, malformed, redirect and forbidden responses',async()=>{
 for(const[status,body]of[[200,response(2)],[200,{data:{metadata:{version:1,destroyed:true,deletion_time:''},data:{value:secret}}}],[200,{data:{metadata:{version:1,destroyed:false,deletion_time:'2026-01-01'},data:{value:secret}}}],[200,response(1,'not-key-material')],[302,{location:'https://foreign.invalid'}],[403,{errors:['PRIVATE_SERVER_DETAIL']}]]as const){
  const mocked=transport(status,body);let ran=false
  try{await assert.rejects(()=>createOpenBaoKeys(options()).withKeys([ref],100,async()=>{ran=true}),e=>!String(e).includes('PRIVATE_SERVER_DETAIL'));assert.equal(ran,false)}finally{mocked.mock.restore()}
 }
})
test('OpenBao scope and provider failures fail closed before any network/transaction',async()=>{
 const mocked=transport(200,response());let ran=false
 try{
  const provider=createOpenBaoKeys(options())
  await assert.rejects(()=>provider.withKeys([{...ref,tenantId:'22222222-2222-4222-8222-222222222222'}],100,async()=>{ran=true}))
  await assert.rejects(()=>createOpenBaoKeys({...options(),token:async()=>{throw Error('PRIVATE_TOKEN_DETAIL')}}).withKeys([ref],100,async()=>{ran=true}),e=>!String(e).includes('PRIVATE_TOKEN_DETAIL'))
  assert.equal(ran,false);assert.equal(mocked.mock.callCount(),0)
  for(const origin of ['http://bao.fixture.invalid','https://user:pass@bao.fixture.invalid','https://bao.fixture.invalid/redirect','https://bao.fixture.invalid/?query=private'])assert.throws(()=>createOpenBaoKeys({...options(),origin}))
 }finally{mocked.mock.restore()}
})
test('OpenBao scope deadline denies late key use and cleans up after callback failure',async()=>{
 const mocked=transport(200,response());let held:Buffer|undefined
 try{
  await assert.rejects(()=>createOpenBaoKeys(options()).withKeys([ref],1,async use=>{held=use(ref,b=>b);await new Promise(r=>setTimeout(r,10));use(ref,b=>b)}))
  assert.ok(held?.every(v=>v===0))
 }finally{mocked.mock.restore()}
})
