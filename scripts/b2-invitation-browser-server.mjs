// Test-only TLS transport to the owned networkless container's actual B1 backend.
import {spawn,execFileSync} from 'node:child_process'
import {createInterface} from 'node:readline'
import {createServer} from 'node:https'
import {request} from 'node:http'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {once} from 'node:events'

const fixture=JSON.parse(process.env.B2_BROWSER_FIXTURE??'{}')
if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||!/^([a-f0-9]{64})$/.test(fixture.container??'')||!/^([a-f0-9]{32})$/.test(fixture.run??''))throw Error('OWNED_HOSTED_CI_REQUIRED')
const environment={...process.env}
for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete environment[name]
const docker=['--host=unix:///var/run/docker.sock']
const meta=JSON.parse(execFileSync('docker',[...docker,'inspect',fixture.container],{env:environment,encoding:'utf8'}))[0]
if(meta.Config.Labels?.['cleanops.b2']!==fixture.run||meta.HostConfig.NetworkMode!=='none'||Object.keys(meta.HostConfig.PortBindings??{}).length||meta.Mounts.some(m=>['bind','volume'].includes(m.Type)))throw Error('ISOLATION_REQUIRED')
const directory=mkdtempSync(join(tmpdir(),'cleanops-b2-browser-'))
const pending=new Map()
let sequence=0,server,next
const child=spawn('docker',[...docker,'exec',...(fixture.access?['-e','B2_ACCESS_TEST=1']:[]),...(fixture.userChanges?['-e','B2_USER_CHANGES_TEST=1']:[]),'-i',fixture.container,'/opt/b1-pg05/node','--experimental-strip-types','/opt/b1-pg05/scripts/b2-invitation-browser-backend.ts'],{env:environment,stdio:['pipe','pipe','ignore']})
const lines=createInterface({input:child.stdout})
const ready=new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('PRIVATE_BACKEND_START_TIMEOUT')),20000)
 lines.on('line',line=>{try{const result=JSON.parse(line);if(result.ready){clearTimeout(timer);resolve()}else{const item=pending.get(result.id);if(item){pending.delete(result.id);clearTimeout(item.timer);item.resolve(result)}}}catch{reject(Error('INVALID_PRIVATE_REPLY'))}})
 child.on('exit',()=>{clearTimeout(timer);reject(Error('PRIVATE_BACKEND_EXIT'));for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('PRIVATE_BACKEND_EXIT'))}pending.clear()})
})
function rpc(path,headers,method,body){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('PRIVATE_TIMEOUT'))},20000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,path,headers,method,body})+'\n')})}
async function cleanup(){
 if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})
 child.stdin.end();child.kill('SIGTERM');if(next&&next.exitCode===null){next.kill('SIGTERM');await once(next,'exit')}
 rmSync(directory,{recursive:true,force:true})
}
try{
 await ready
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=127.0.0.1'],{stdio:'ignore'})
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3001'],{env:{...environment,DATABASE_URL:'',CLEANOPS_TEST_DATABASE_URL:''},stdio:'ignore'})
 let nextReady=false
 for(let attempt=0;attempt<100;attempt++){
  try{const response=await fetch('http://127.0.0.1:3001/administration/users',{signal:AbortSignal.timeout(1000)});if(response.ok){nextReady=true;break}}catch{/* startup only */}
  await new Promise(resolve=>setTimeout(resolve,200))
 }
 if(!nextReady)throw Error('NEXT_START_TIMEOUT')
 server=createServer({key:readFileSync(join(directory,'key.pem')),cert:readFileSync(join(directory,'cert.pem'))},async(incoming,outgoing)=>{
  try{
   if((incoming.url==='/auth/users/invitations')&&incoming.method==='POST'){
    const chunks=[];let size=0
    for await(const chunk of incoming){size+=chunk.length;if(size>16384){outgoing.writeHead(413);outgoing.end();return}chunks.push(chunk)}
    const response=await rpc(incoming.url,incoming.headers,'POST',Buffer.concat(chunks).toString('utf8'));outgoing.writeHead(response.status,response.headers);outgoing.end(response.body);return
   }
   if(incoming.url.startsWith('/auth/users')||incoming.url.startsWith('/auth/access/')){
    if(incoming.method!=='GET'){outgoing.writeHead(405);outgoing.end();return}
    const response=await rpc(incoming.url,incoming.headers,'GET');outgoing.writeHead(response.status,response.headers);outgoing.end(response.body);return
   }
   const upstream=request({hostname:'127.0.0.1',port:3001,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing)})
   upstream.on('error',()=>{outgoing.writeHead(503);outgoing.end()});incoming.pipe(upstream)
  }catch{outgoing.writeHead(503,{'cache-control':'no-store'});outgoing.end()}
 })
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3443,'127.0.0.1',resolve)})
 process.once('SIGTERM',()=>{void cleanup().then(()=>process.exit(0))})
 process.once('SIGINT',()=>{void cleanup().then(()=>process.exit(0))})
}catch{await cleanup();throw Error('B2_PRIVATE_BROWSER_START_FAILED')}
