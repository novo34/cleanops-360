import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
// @ts-expect-error CI-only JS helper, never imported by application code.
import { closeOwnedServer } from '../../scripts/b1-real-browser-server.mjs'

test('native server close waits on active request; owned shutdown releases it without waiting for browser context teardown', async () => {
 const server=createServer(()=>{ /* Deliberately unfinished streaming response. */ })
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const address=server.address();assert.ok(address&&typeof address==='object')
 const incoming=once(server,'request')
 const client=request({host:'127.0.0.1',port:address.port,path:'/'})
 client.on('error',()=>{});client.end();await incoming
 let nativeCompleted=false
 const nativeClose=new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):((nativeCompleted=true),resolve())))
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(nativeCompleted,false) // Reproduces the actual Node shutdown wait.
 server.closeAllConnections();await nativeClose
 assert.equal(nativeCompleted,true)
 const second=createServer(()=>{})
 second.listen(0,'127.0.0.1');await once(second,'listening')
 const target=second.address();assert.ok(target&&typeof target==='object')
 const accepted=once(second,'request'), other=request({host:'127.0.0.1',port:target.port,path:'/'})
 other.on('error',()=>{});other.end();await accepted
 try { await closeOwnedServer(second);assert.equal(second.listening,false) }
 finally { client.destroy();other.destroy();second.closeAllConnections() }
})
