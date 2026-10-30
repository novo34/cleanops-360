import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { rootCertificates } from 'node:tls'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { selectAuthBackend, type PrivateRuntimeConfiguration } from '../../lib/b1/private-runtime.ts'
import { composeTrustedRuntime } from '../../lib/b1/runtime.ts'
import { closedBackend } from '../../lib/b1/service.ts'
import { numeric, profile } from '../../lib/b1/config.ts'
const tenantId='11111111-1111-4111-8111-111111111111'
function config(): PrivateRuntimeConfiguration {
 const ref=(purpose:PrivateRuntimeConfiguration['references']['audit']['purpose'])=>({tenantId,purpose,keyId:'synthetic-key',version:1})
 const content=Buffer.from('0'.repeat(64)+'\n')
 return {
  origin:'https://fixture.invalid',internalOrigins:[],
  postgres:{environment:'fixture',host:'db.invalid',port:5432,database:'fixture',loginRole:'identity_login',contractualRole:'cleanops_identity_service',ca:Buffer.from(rootCertificates[0]),password:async()=>{throw Error('no credential access')},maxConnections:1,connectionTimeoutMs:1000},
  bao:{origin:'https://bao.invalid',mount:'keys',environment:'fixture',ca:Buffer.from('synthetic'),cert:Buffer.from('synthetic'),key:Buffer.from('synthetic'),timeoutMs:1000},
  sink:{path:'/sink/token',uid:100,gid:100,directoryUid:100,directoryGid:100,mode:0o600,directoryMode:0o700,timeoutMs:1000},
  references:{audit:ref('audit-hmac'),otp:ref('otp-hmac'),recovery:ref('recovery-hmac'),cursor:ref('cursor-hmac')},totpKeys:[{keyVersion:'synthetic-v1',reference:ref('totp-aead')}],lifetimeMs:1000,
  dummyPasswordHash:`$argon2id$v=19$m=${numeric('argon_memory')},t=${numeric('argon_iterations')},p=${numeric('argon_parallelism')}$${Buffer.alloc(numeric('argon_salt'),1).toString('base64').replace(/=+$/,'')}$${Buffer.alloc(32,1).toString('base64').replace(/=+$/,'')}`,
  maxEligibleTotpMethods:1,corpus:{version:'synthetic',sha256:createHash('sha256').update(content).digest('hex'),content},passwordPolicy:{minimumCodePoints:12,maximumCodePoints:128,maximumCorpusBytes:65},
  normalizeEmail:s=>s.toLowerCase(),transport:()=>({network:Buffer.alloc(32,1),device:Buffer.alloc(32,2)}),sessionLabels:()=>({device:'Synthetic',browser:'Synthetic'}),
 }
}
test('private selection defaults closed and rejects incomplete or inconsistent configuration before I/O',async()=>{
 assert.equal(selectAuthBackend().backend,closedBackend)
 const oldOrigin=process.env.CLEANOPS_AUTH_ORIGIN,oldInternal=process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS
 try{
  process.env.CLEANOPS_AUTH_ORIGIN='https://fixture.invalid'
  process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS='[]'
  const runtime=composeTrustedRuntime()
  assert.equal(runtime.backend,closedBackend)
  await runtime.close()
 }finally{
  if(oldOrigin===undefined)delete process.env.CLEANOPS_AUTH_ORIGIN;else process.env.CLEANOPS_AUTH_ORIGIN=oldOrigin
  if(oldInternal===undefined)delete process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS;else process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS=oldInternal
 }
 for(const field of Object.keys(config())){
  const incomplete={...config()} as unknown as Record<string,unknown>;delete incomplete[field]
  assert.throws(()=>selectAuthBackend({kind:'private',configuration:incomplete as unknown as PrivateRuntimeConfiguration}),/AUTH_CONFIGURATION_REQUIRED/)
 }
 for(const patch of [{passwordPolicy:{...config().passwordPolicy,minimumCodePoints:8}},{passwordPolicy:{...config().passwordPolicy,maximumCodePoints:129}},{origin:'http://invalid'},{sink:undefined},{normalizeEmail:undefined},{dummyPasswordHash:'invalid'},{lifetimeMs:0},{totpKeys:[]},{postgres:{...config().postgres,environment:'other'}},{references:{...config().references,otp:{...config().references.otp,tenantId:'22222222-2222-4222-8222-222222222222'}}}]){
  assert.throws(()=>selectAuthBackend({kind:'private',configuration:{...config(),...patch} as PrivateRuntimeConfiguration}),/AUTH_CONFIGURATION_REQUIRED/)
 }
})
test('request context is not invoked outside a request during runtime selection',async()=>{
 let calls=0
 const c={...config(),transport:()=>{calls++;throw Error('no request context')},sessionLabels:()=>{calls++;throw Error('no request context')}}
 const selected=selectAuthBackend({kind:'private',configuration:c})
 assert.equal(calls,0)
 await selected.close()
})
test('public HTTP remains closed even if process environment attempts private activation',async()=>{
 const oldOrigin=process.env.CLEANOPS_AUTH_ORIGIN
 const oldInternal=process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS
 const oldSelection=process.env.CLEANOPS_AUTH_BACKEND
 try{
  process.env.CLEANOPS_AUTH_ORIGIN='https://fixture.invalid'
  process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS='[]'
  process.env.CLEANOPS_AUTH_BACKEND='private'
  const response=await (await import('../../lib/b1/runtime.ts')).handleAuth(
   new Request('https://fixture.invalid/auth/me',{headers:{'Sec-Fetch-Site':'same-origin'}}),
   'getCurrentIdentity')
  assert.equal(response.status,503)
  assert.equal(response.headers.get('Set-Cookie'),null)
 }finally{
  if(oldOrigin===undefined)delete process.env.CLEANOPS_AUTH_ORIGIN;else process.env.CLEANOPS_AUTH_ORIGIN=oldOrigin
  if(oldInternal===undefined)delete process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS;else process.env.CLEANOPS_AUTH_INTERNAL_ORIGINS=oldInternal
  if(oldSelection===undefined)delete process.env.CLEANOPS_AUTH_BACKEND;else process.env.CLEANOPS_AUTH_BACKEND=oldSelection
 }
})
test('same selected composition serves bootstrap and HTTP transactions with real factories and simulated transports',async()=>{
 let reads=0,commits=0,fd=0
 const mocks=[]
 mocks.push(mock.method(fs,'open',async(path:unknown)=>{
  const file=String(path).endsWith('/token'); const raw=Buffer.from('synthetic')
  return {fd:++fd,async stat(){return {uid:100,gid:100,mode:file?0o100600:0o40700,size:raw.length,nlink:1,isFile:()=>file}},async read(buffer:Buffer,offset:number,length:number,position:number){const count=Math.max(0,Math.min(length,raw.length-position));raw.copy(buffer,offset,position,position+count);return{bytesRead:count}},async close(){}} as never
 }))
 mocks.push(mock.method(fs,'statfs',async()=>({type:0x01021994}) as never))
 mocks.push(mock.method(https,'request',(_url:unknown,_options:unknown,callback:(res:never)=>void)=>{
  reads++;const req=Object.assign(new EventEmitter(),{destroy(){},end(){queueMicrotask(()=>{
   const res=Object.assign(new EventEmitter(),{statusCode:200,destroy(){}});callback(res as never)
   res.emit('data',Buffer.from(JSON.stringify({data:{metadata:{version:1,destroyed:false,deletion_time:''},data:{value:Buffer.alloc(32,1).toString('base64')}}})));res.emit('end');req.emit('close')
  })}});return req as never
 }))
 mocks.push(mock.method(pg.Pool.prototype,'connect',async()=>({async query(sql:string){if(sql==='COMMIT')commits++;return {rows:[{value:sql.includes('security_policy')?profile.values:null}]}},release(){}}) as never))
 const c=config()
 const selected=composeTrustedRuntime({kind:'private',configuration:c})
 const manifest={installationId:tenantId,operationId:tenantId,tenantId,userId:tenantId,principalId:tenantId,tenantName:'Synthetic',displayName:'Synthetic',email:'user@example.invalid',accountLabel:'Synthetic',approval:'SYNTHETIC_ONLY'}
 const operatorPool={async connect(){throw Error('must not connect during composition')}}
 assert.ok(selected.firstActor!(manifest,operatorPool,'synthetic-v1'))
 assert.throws(()=>selected.firstActor!({...manifest,email:'USER@example.invalid'},operatorPool,'synthetic-v1'))
 assert.throws(()=>selected.firstActor!(manifest,operatorPool,'unknown'))
 assert.throws(()=>selected.firstActor!({...manifest,tenantId:'22222222-2222-4222-8222-222222222222'},operatorPool,'synthetic-v1'))

 assert.equal(reads,0)
 try{
  const result=await selected.handler!.bootstrap();assert.ok(!(result instanceof Response));assert.equal(commits,1)
  assert.equal(await selected.backend.transaction(async()=>true),true);assert.equal(commits,2);assert.equal(reads,10)
  const response=await selected.handler!.handle(new Request('https://fixture.invalid/auth/me',{headers:{'Sec-Fetch-Site':'same-origin'}}),'getCurrentIdentity')
  assert.equal(response.status,401);assert.equal(response.headers.get('Set-Cookie'),null)
 }finally{await selected.close();for(const m of mocks)m.mock.restore()}
})

test('separately evaluated Next bundles share startup runtime, request scope and shutdown drain', async () => {
 const probe = async (runtimeUrl: string) => {
 // nosemgrep: cleanops-code-execution-import -- parent supplies a fixed local test module.
 const runtime = await import(runtimeUrl)
 const copyUrl = new URL(runtimeUrl)
 copyUrl.search = '?b1-independent-bundle'
 // nosemgrep: cleanops-code-execution-import -- fixed local test module with cache-busting query, no user input.
 const other = await import(copyUrl.href) as typeof runtime
 assert.notEqual(runtime.installTrustedRuntime, other.installTrustedRuntime)
 let entered!: () => void, release!: () => void
 const ready = new Promise<void>(resolve => { entered = resolve })
 const barrier = new Promise<void>(resolve => { release = resolve })
 runtime.installTrustedRuntime(config(), async () => { entered(); await barrier; return new Response('synthetic scope', { status: 418 }) })
 assert.equal(runtime.runtimeHandler(), other.runtimeHandler())
 assert.throws(() => other.installTrustedRuntime(config()), /AUTH_CONFIGURATION_REQUIRED/)
 const pending = other.handleAuth(new Request('https://fixture.invalid/auth/me', { headers: { 'sec-fetch-site': 'same-origin' } }), 'getCurrentIdentity')
 await ready
 let drained = false
 const closing = runtime.closeTrustedRuntime().then(() => { drained = true })
 await Promise.resolve()
 assert.equal(drained, false)
 assert.equal((await other.handleAuth(new Request('https://fixture.invalid/auth/me'), 'getCurrentIdentity')).status, 503)
 release()
 assert.equal((await pending).status, 418)
 await closing
 assert.equal(drained, true)
 }
 const runtimeUrl = new URL('../../lib/b1/runtime.ts', import.meta.url).href
 const configUrl = new URL('../../lib/b1/config.ts', import.meta.url).href
 const code = `import assert from 'node:assert/strict'; import {rootCertificates} from 'node:tls'; import {createHash} from 'node:crypto'; import {numeric} from ${JSON.stringify(configUrl)}; const tenantId=${JSON.stringify(tenantId)}; const config=${config.toString()}; await (${probe.toString()})(${JSON.stringify(runtimeUrl)});`
 await promisify(execFile)(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code])
})
