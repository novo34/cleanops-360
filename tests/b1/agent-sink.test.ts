import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAgentSinkToken } from '../../lib/b1/openbao-keys.ts'

test('Agent sink validates descriptors/permissions and rereads replacement without mtime/TTL assumptions (tmpfs simulated)',async()=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'cleanops-agent-'))
  await fs.chmod(dir,0o700)
  const path=join(dir,'token'),uid=process.getuid!(),gid=process.getgid!()
  const real=await fs.statfs(dir)
  const mocked=mock.method(fs,'statfs',async()=>({...real,type:0x01021994}))
  const allocations:Buffer[]=[]
  const allocate=Buffer.alloc.bind(Buffer)
  const captured=mock.method(Buffer,'alloc',(...args:Parameters<typeof Buffer.alloc>)=>{const b=allocate(...args);if(args[0]===1025)allocations.push(b);return b})
  const options={path,uid,gid,directoryUid:uid,directoryGid:gid,mode:0o600 as const,directoryMode:0o700 as const,timeoutMs:1000}
  const token=createAgentSinkToken(options)
  try {
    await assert.rejects(token,/AUTH_DEPENDENCY_UNAVAILABLE/)
    await fs.writeFile(path,'synthetic-first\n',{mode:0o600})
    assert.equal(await token(),'synthetic-first')
    await fs.writeFile(join(dir,'new'),'synthetic-second',{mode:0o600})
    await fs.rename(join(dir,'new'),path)
    assert.equal(await token(),'synthetic-second')
    await fs.chmod(path,0o644);await assert.rejects(token,/AUTH_DEPENDENCY_UNAVAILABLE/)
    await fs.chmod(path,0o600)
    await assert.rejects(createAgentSinkToken({...options,uid:uid+1}),/AUTH_DEPENDENCY_UNAVAILABLE/)
    await fs.writeFile(path,'x'.repeat(1025));await assert.rejects(token,/AUTH_DEPENDENCY_UNAVAILABLE/)
    await fs.writeFile(path,Buffer.from([0xff]));await assert.rejects(token,/AUTH_DEPENDENCY_UNAVAILABLE/)
    await fs.unlink(path);await fs.symlink(join(dir,'missing'),path)
    await assert.rejects(token,/AUTH_DEPENDENCY_UNAVAILABLE/)
    await fs.symlink(dir,join(dir,'parent'))
    await assert.rejects(createAgentSinkToken({...options,path:join(dir,'parent','token')}),/AUTH_DEPENDENCY_UNAVAILABLE/)
    await fs.chmod(dir,0o755);await assert.rejects(token,/AUTH_DEPENDENCY_UNAVAILABLE/)
    assert.ok(allocations.length>0&&allocations.every(b=>b.every(v=>v===0)))
  } finally {mocked.mock.restore();captured.mock.restore();await fs.rm(dir,{recursive:true,force:true})}
})

test('Agent sink rejects non-tmpfs, unsafe configuration and delayed filesystem completion',async()=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'cleanops-agent-'))
  await fs.chmod(dir,0o700)
  const options={path:join(dir,'token'),uid:process.getuid!(),gid:process.getgid!(),directoryUid:process.getuid!(),directoryGid:process.getgid!(),mode:0o600 as const,directoryMode:0o700 as const,timeoutMs:1000}
  const real=await fs.statfs(dir)
  const mocked=mock.method(fs,'statfs',async()=>({...real,type:0}))
  try {await assert.rejects(createAgentSinkToken(options),/AUTH_DEPENDENCY_UNAVAILABLE/)}finally{mocked.mock.restore()}
  for(const path of ['relative','/tmp/../token','/tmp//token'])assert.throws(()=>createAgentSinkToken({...options,path}))
  const original=fs.open.bind(fs)
  const delayed=mock.method(fs,'open',async(...args:Parameters<typeof fs.open>)=>{await new Promise(r=>setTimeout(r,20));return original(...args)})
  try {
    await assert.rejects(createAgentSinkToken({...options,timeoutMs:1}),/AUTH_DEPENDENCY_UNAVAILABLE/)
    await new Promise(r=>setTimeout(r,60)) // allow late descriptor cleanup, not a token TTL
  }finally{delayed.mock.restore();await fs.rm(dir,{recursive:true,force:true})}
})

test('Agent sink wipes material and sanitizes descriptor-close failures instead of returning a token',async()=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'cleanops-agent-'))
  await fs.chmod(dir,0o700);const path=join(dir,'token')
  await fs.writeFile(path,'synthetic-token',{mode:0o600})
  const real=await fs.statfs(dir),original=fs.open.bind(fs)
  const mocked=mock.method(fs,'statfs',async()=>({...real,type:0x01021994}))
  const opened=mock.method(fs,'open',async(...args:Parameters<typeof fs.open>)=>{
    const handle=await original(...args),close=handle.close.bind(handle)
    handle.close=async()=>{await close();throw Error('PRIVATE_CLOSE_DETAIL')}
    return handle
  })
  try {
    await assert.rejects(createAgentSinkToken({path,uid:process.getuid!(),gid:process.getgid!(),directoryUid:process.getuid!(),directoryGid:process.getgid!(),mode:0o600,directoryMode:0o700,timeoutMs:1000}),
      e=>String(e).includes('AUTH_DEPENDENCY_UNAVAILABLE')&&!String(e).includes('PRIVATE_CLOSE_DETAIL'))
  } finally {opened.mock.restore();mocked.mock.restore();await fs.rm(dir,{recursive:true,force:true})}
})
