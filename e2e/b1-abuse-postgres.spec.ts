import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {numeric} from '../lib/b1/config'
// @ts-expect-error Owned isolated test bridge, never an application dependency.
import {startRealBrowserServer} from '../scripts/b1-real-browser-server.mjs'
const phase=(description:string)=>test.info().annotations.push({type:'phase',description})
async function post(page:Page,path:string,body:object){return page.evaluate(async input=>{
 const csrf=document.cookie.split('; ').find(c=>c.startsWith('__Host-cleanops_csrf='))!.split('=')[1]
 const r=await fetch(input.path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'X-Forwarded-For':'203.0.113.'+(1+Math.floor(Math.random()*200)),'X-Device-Id':crypto.randomUUID()},body:JSON.stringify(input.body)})
 return {status:r.status,body:await r.json(),retry:r.headers.get('retry-after')}
},{path,body})}
async function begin(page:Page,email:string,password='PG05 synthetic passphrase!'){
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password)
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/login')
 await page.getByRole('button',{name:'Continuar',exact:true}).click();const r=await response;phase('LOGIN_START_'+r.status());return {status:r.status(),data:(await r.json()).data}
}
for(const dimension of ['USER','IP','DEVICE'] as const)test('ABUSE real login '+dimension+' ceiling persists and spoofed transport headers do not bypass it',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const email=(await server.rpc({kind:'fixtureEmail'})).email,limit=numeric('login_'+dimension.toLowerCase()+'_limit')
  for(let i=1;i<=limit;i++){
   if(dimension==='USER')await server.rpc({kind:'rotateAbuseTransport',network:true,device:true})
   if(dimension==='IP')await server.rpc({kind:'rotateAbuseTransport',device:true})
   if(dimension==='DEVICE')await server.rpc({kind:'rotateAbuseTransport',network:true})
   await page.goto('/login')
   const result=await post(page,'/auth/login',{email:dimension==='USER'?(i%2?email:email.toUpperCase()):'unknown-'+randomUUID()+'@fixture.invalid',password:'Incorrect synthetic password!'})
   phase('LOGIN_'+dimension+'_'+result.status)
   expect(result.status).toBe(i<limit?401:429)
   if(i===limit){expect(result.body.error.code).toBe('RATE_LIMITED');expect(Number(result.retry)).toBeGreaterThan(0);expect(Number(result.retry)).toBeLessThanOrEqual(numeric('rate_window'))}
  }
  const state=await server.rpc({kind:'inspectAbuse'})
  expect(state.rates.some((r:{dimension:string;purpose:string;maximum:number})=>r.dimension===dimension&&r.purpose==='LOGIN'&&r.maximum>=limit)).toBe(true)
  expect(state.events.some((r:{code:string;subject_hashed:boolean;network_hashed:boolean;device_hashed:boolean})=>r.code==='RATE_LIMITED'&&r.subject_hashed&&r.network_hashed&&r.device_hashed)).toBe(true)
  expect(state.active).toBe(0)
  // Age only this synthetic fixture's recorded buckets; no limits/control changes.
  await server.rpc({kind:'ageRateWindow'});await page.goto('/login')
  const positive=await post(page,'/auth/login',{email,password:'PG05 synthetic passphrase!'})
  expect(positive.status).toBe(200);expect(positive.body.data.state).toBe('PENDING_MFA');expect((await server.rpc({kind:'inspectAbuse'})).active).toBe(0)
 }finally{await server.close()}
})
test('ABUSE real known unknown and disabled accounts have the same safe denial and no session',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const email=(await server.rpc({kind:'fixtureEmail'})).email,responses=[]
  for(const candidate of [email,'unknown-'+randomUUID()+'@fixture.invalid']){await page.goto('/login');responses.push(await post(page,'/auth/login',{email:candidate,password:'Incorrect synthetic password!'}))}
  await server.rpc({kind:'disableAbusePrincipal'});await page.goto('/login');responses.push(await post(page,'/auth/login',{email,password:'PG05 synthetic passphrase!'}))
  for(const response of responses){expect(response.status).toBe(401);expect(Object.keys(response.body).sort()).toEqual(['correlation_id','error']);expect(response.body.error).toEqual(responses[0].body.error)}
  const state=await server.rpc({kind:'inspectAbuse'});expect(state.active).toBe(0)
  expect(state.events.some((r:{code:string;total:number;subject_hashed:boolean})=>r.code==='LOGIN_DENIED'&&r.total===3&&r.subject_hashed)).toBe(true)
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0)
 }finally{await server.close()}
})
test('OTP real TOTP invalid proofs persist attempts and rate ceiling blocks a later valid code',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const login=await begin(page,(await server.rpc({kind:'fixtureEmail'})).email);expect(login.status).toBe(200)
  const correct=(await server.rpc({kind:'proof'})).proof,wrong=correct.slice(0,-1)+(correct.endsWith('0')?'1':'0')
  const body={challenge_id:login.data.challenge_id,method:'TOTP',proof:wrong},limit=numeric('otp_issue_user_limit')
  for(let i=1;i<limit;i++){const r=await post(page,'/auth/mfa/verify',body);expect(r.status).toBe(401)}
  const state=await server.rpc({kind:'inspectAbuse'});expect(state.challenges[0].attempts).toBe(limit-1);expect(state.active).toBe(0)
  const denied=await post(page,'/auth/mfa/verify',{...body,proof:correct});expect(denied.status).toBe(429)
  const final=await server.rpc({kind:'inspectAbuse'});expect(final.active).toBe(0);expect(final.consumedMethods).toBe(0)
 }finally{await server.close()}
})
test('OTP real TOTP concurrent browsers consume a global counter once and replay cannot issue another session',async({page,browser})=>{
 const server=await startRealBrowserServer('abuse'),other=await browser.newContext({ignoreHTTPSErrors:true,baseURL:'https://127.0.0.1:3000'})
 try{
  const email=(await server.rpc({kind:'fixtureEmail'})).email,first=await begin(page,email);expect(first.status).toBe(200)
  await server.rpc({kind:'ageChallengeCooldown'});const peer=await other.newPage(),second=await begin(peer,email);expect(second.status).toBe(200)
  const proof=(await server.rpc({kind:'proof'})).proof
  const results=await Promise.all([post(page,'/auth/mfa/verify',{challenge_id:first.data.challenge_id,method:'TOTP',proof}),post(peer,'/auth/mfa/verify',{challenge_id:second.data.challenge_id,method:'TOTP',proof})])
  expect(results.map(r=>r.status).sort()).toEqual([200,401]);const state=await server.rpc({kind:'inspectAbuse'});expect(state.active).toBe(1);expect(state.consumedMethods).toBe(1)
  const loser=results[0].status===401?page:peer,challenge=results[0].status===401?first:second
  expect((await post(loser,'/auth/mfa/verify',{challenge_id:challenge.data.challenge_id,method:'TOTP',proof})).status).toBe(401);expect((await server.rpc({kind:'inspectAbuse'})).active).toBe(1)
 }finally{await other.close();await server.close()}
})
test('OTP real expired TOTP challenge denies a correct code without consuming it or issuing a session',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const login=await begin(page,(await server.rpc({kind:'fixtureEmail'})).email);expect(login.status).toBe(200)
  await server.rpc({kind:'expireAbuseChallenge'});const result=await post(page,'/auth/mfa/verify',{challenge_id:login.data.challenge_id,method:'TOTP',proof:(await server.rpc({kind:'proof'})).proof})
  expect(result.status).toBe(401);const state=await server.rpc({kind:'inspectAbuse'});expect(state.active).toBe(0);expect(state.consumedMethods).toBe(0)
 }finally{await server.close()}
})
test('ABUSE valid PREAUTH cannot evade durable OTP rate limits by guessing challenge UUIDs',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  expect((await begin(page,(await server.rpc({kind:'fixtureEmail'})).email)).status).toBe(200)
  const limit=numeric('otp_issue_user_limit')
  for(let i=1;i<=limit;i++)expect((await post(page,'/auth/mfa/verify',{challenge_id:randomUUID(),method:'TOTP',proof:'000000'})).status).toBe(i<limit?401:429)
  const state=await server.rpc({kind:'inspectAbuse'});expect(state.active).toBe(0)
  expect(state.rates.some((r:{dimension:string;purpose:string;maximum:number})=>r.dimension==='USER'&&r.purpose==='OTP_VERIFY'&&r.maximum>=limit)).toBe(true)
 }finally{await server.close()}
})
test('CSRF durable real denial uses trusted hashed context and never consumes credentials or issues session',async({page})=>{
 const server=await startRealBrowserServer('abuse')
 try{
  const email=(await server.rpc({kind:'fixtureEmail'})).email;await page.goto('/login')
  const denied=await page.evaluate(async email=>{const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'x'.repeat(43)},body:JSON.stringify({email,password:'PG05 synthetic passphrase!'})});return{status:r.status,body:await r.json()}},email)
  expect(denied.status).toBe(403);expect(denied.body.error.code).toBe('CSRF_INVALID')
  const state=await server.rpc({kind:'inspectAbuse'});expect(state.active).toBe(0);expect(state.events.some((r:{code:string;total:number;subject_hashed:boolean;network_hashed:boolean;device_hashed:boolean})=>r.code==='CSRF_DENIED'&&r.total===1&&r.subject_hashed&&r.network_hashed&&r.device_hashed)).toBe(true)
  expect((await post(page,'/auth/login',{email,password:'PG05 synthetic passphrase!'})).status).toBe(200)
 }finally{await server.close()}
})
