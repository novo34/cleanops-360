import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthHandler, names, digest, cookie, token, AuthError, closedBackend, type Backend, type Transaction, type Binding, type Effect, type Input } from '../../lib/b1/service.ts'
import { contract, operations, valid } from '../../lib/b1/contracts.ts'

import { sample } from './schema-fixture.ts'

const origin = 'https://cleanops.test', clock = () => Date.parse('2026-10-16T10:00:00Z')
const uuid = '11111111-1111-4111-8111-111111111111', dest = '22222222-2222-4222-8222-222222222222'
const csrf = 'C'.repeat(43), bindingToken = 'B'.repeat(43)
const active = (tenant = uuid) => ({ state: 'ACTIVE', session_id: uuid, tenant_id: tenant, absolute_expires_at: new Date(clock()+28800000).toISOString() })
const pending = () => ({ state: 'PENDING_MFA', challenge_id: uuid, allowed_methods: ['TOTP'], expires_at: new Date(clock()+600000).toISOString() })
const binding = (kind: Binding['kind'] = 'ACTIVE', state?: Binding['state']): Binding => ({ kind, state, id: 'verified-test-binding', csrfDigest: digest(csrf), absoluteExpiresAt: clock()+28800000, expiresAt: clock()+(kind === 'ACTIVE' ? 28800000 : 600000), tenantId: uuid, userId: uuid, sessionId: uuid })
function fixture(kind: Binding['kind'] = 'ACTIVE', state?: Binding['state']) {
  const records = new Map<string, { replay: boolean; requestHash: string; data: unknown; oneTime: boolean; expiresAt: number }>()
  const f = { time: clock(), renewalDeadline: undefined as number | undefined, afterCommit: undefined as number | undefined, expireDuringExecute: false, revoked: false, renewals: 0, durableRenewals: 0, binding: binding(kind, state) as Binding | null, allow: true, step: true, retry: null as number | null, commits: 0, calls: 0, commitFailure: false,
    effect: { data: active() } as Effect | AuthError, last: {} as Input, rules: [] as string[], bootstraps: [] as string[] }
  let tail = Promise.resolve()
  const backend: Backend = {
    async bootstrap(b, c) { f.bootstraps.push(b, c) },
    async transaction(work) {
      const before = tail; let release!: () => void; tail = new Promise<void>(r => { release = r }); await before
      const saved = structuredClone(records), beforeRenewals = f.renewals
      try {
        const tx: Transaction = {
          async renewActivity(binding) {
            if (f.revoked || !f.binding || f.binding.expiresAt <= f.time || (f.binding.absoluteExpiresAt ?? 0) <= f.time) throw new AuthError(401, 'AUTH_INVALID')
            f.renewals++
            return f.renewalDeadline ?? binding.expiresAt
          },
          async resolve(cookies) { return cookies[names.session] === bindingToken || cookies[names.preauth] === bindingToken ? f.binding : null },
          async authorize(_b, rule) { f.rules.push(rule); return f.allow },
          async stepUp() { return f.step },
          async auditFailure(){},async rateLimit() { return f.retry },
          async reserve(scope, hash) { return records.get(scope) ?? { replay: false, requestHash: hash } },
          async discard(scope) { records.delete(scope) },
          async complete(scope, hash, data, oneTime) { records.set(scope, { replay: true, requestHash: hash, data, oneTime, expiresAt: clock()+86400000 }) },
          async execute(_op, input) { f.calls++; f.last = input; if (f.expireDuringExecute && f.binding) f.time = f.binding.expiresAt; return f.effect },
        }
        const result = await work(tx)
        if (f.commitFailure) throw new Error('database commit failed with secret details')
        f.commits++; f.durableRenewals += f.renewals - beforeRenewals; if (f.afterCommit !== undefined) f.time = f.afterCommit; return result
      } catch (e) { records.clear(); for (const [k,v] of saved) records.set(k,v); throw e }
      finally { release() }
    },
  }
  return { f, backend, handler: createAuthHandler(backend, origin, () => f.time), records }
}
function request(path: string, method = 'POST', body?: unknown, headers: Record<string,string> = {}) {
  return new Request(origin+path, { method, headers: {
    Origin: origin, 'Sec-Fetch-Site': 'same-origin', Cookie: `${names.session}=${bindingToken}; ${names.preauth}=${bindingToken}; ${names.csrf}=${csrf}`, 'X-CSRF-Token': csrf,
    'Idempotency-Key': 'test-key-00000001', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers,
  }, body: body === undefined ? undefined : JSON.stringify(body) })
}
async function expectError(response: Response, status: number, code?: string) {
  assert.equal(response.status, status); assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('Vary'), 'Cookie')
  assert.equal(response.headers.get('Set-Cookie'), null)
  const result = await response.json(); assert.ok(valid(contract.components.schemas.Error, result)); if (code) assert.equal(result.error.code, code)
}
test('closed runtime dependency and invalid origin configuration never enable authentication', async () => {
  assert.throws(() => createAuthHandler(closedBackend, 'http://cleanops.test'))
  const handler = createAuthHandler(closedBackend, origin)
  await expectError(await handler.handle(request('/auth/me','GET'),'getCurrentIdentity'),503)
  const bootstrap = await handler.bootstrap(); assert.ok(bootstrap instanceof Response); await expectError(bootstrap,503)
})
test('bootstrap persists only digests before emitting secure host cookies', async () => {
  const {handler,f} = fixture(); const result = await handler.bootstrap(); assert.ok(!(result instanceof Response))
  const values = result.headers.getSetCookie(); assert.equal(values.length,2)
  assert.match(values[0],/Secure; SameSite=Lax; Max-Age=600; HttpOnly/); assert.ok(!values[1].includes('HttpOnly'))
  assert.equal(f.bootstraps.length,2); assert.ok(f.bootstraps.every(x => /^[a-f0-9]{64}$/.test(x)))
  assert.equal(token().length,43); assert.throws(() => cookie(names.session,'forged',60))
})
test('origin, fetch metadata, duplicate cookies, server CSRF binding, unknown query and illegal selectors', async () => {
  const {handler,f} = fixture()
  const body = { reason: 'self' }
  for (const headers of [{ Origin: 'https://evil.test' },{ 'Sec-Fetch-Site':'cross-site' },{ 'X-CSRF-Token':'X'.repeat(43) },{ Cookie:`${names.session}=${bindingToken}; ${names.csrf}=${csrf}; ${names.csrf}=${csrf}` }] as Record<string,string>[]) {
    const response = await handler.handle(request('/me/sessions/revoke-other-own','POST',body,headers),'revokeOtherOwnSessions'); assert.ok([400,403].includes(response.status)); assert.equal(f.calls,0)
  }
  f.binding!.csrfDigest = digest('different')
  await expectError(await handler.handle(request('/me/sessions/revoke-other-own','POST',body),'revokeOtherOwnSessions'),403,'CSRF_INVALID')
  await expectError(await handler.handle(request('/auth/tenants?tenant_id='+dest,'GET'),'listAuthorizedTenants'),400)
  await expectError(await handler.handle(request('/auth/tenants?limit=1&limit=2','GET'),'listAuthorizedTenants'),400)
  await expectError(await handler.handle(request('/me/sessions/revoke-other-own','POST',{...body,user_id:dest}),'revokeOtherOwnSessions'),422)
})
test('body byte limit, compression, MIME, invalid UTF-8 and no-body requests are rejected', async () => {
  const {handler} = fixture()
  await expectError(await handler.handle(request('/auth/login','POST',{email:'s@example.test',password:'a'.repeat(17000)}),'login'),413)
  await expectError(await handler.handle(request('/auth/login','POST',{}, {'Content-Encoding':'gzip'}),'login'),415)
  await expectError(await handler.handle(request('/auth/login','POST',{}, {'Content-Type':'text/plain'}),'login'),415)
  await expectError(await handler.handle(request('/auth/logout','POST',{}),'logout'),400)
  const bad = new Request(origin+'/auth/login',{ method:'POST',headers:{'Content-Type':'application/json'},body:new Uint8Array([0xff]) })
  await expectError(await handler.handle(bad,'login'),400)
})
test('preauth and expiry never authorize ACTIVE operations; policy and step-up deny before effects', async () => {
  const {handler,f} = fixture('PREAUTH','PENDING_MFA')
  await expectError(await handler.handle(request('/auth/me','GET'),'getCurrentIdentity'),401)
  f.binding = binding(); f.allow = false
  await expectError(await handler.handle(request('/me/sessions','GET'),'listSelfSessions'),403,'POLICY_DENIED')
  f.allow = true; f.step = false
  await expectError(await handler.handle(request('/me/sessions/revoke-other-own','POST',{reason:'self'}),'revokeOtherOwnSessions'),403,'STEP_UP_REQUIRED')
  f.binding!.expiresAt = clock()
  await expectError(await handler.handle(request('/auth/me','GET'),'getCurrentIdentity'),401)
  assert.equal(f.calls,0)
})
test('rate-limit counters and failed factor outcomes commit without success or token disclosure', async () => {
  const {handler,f} = fixture('PREAUTH','PENDING_MFA'); f.retry=42
  const req=()=>request('/auth/mfa/verify','POST',{challenge_id:uuid,method:'TOTP',proof:'123456'})
  const rate = await handler.handle(req(),'verifyMfa'); assert.equal(rate.headers.get('Retry-After'),'42'); await expectError(rate,429)
  assert.equal(f.commits,1); assert.equal(f.calls,0)
  f.retry=null; f.effect=new AuthError(401,'AUTH_INVALID')
  await expectError(await handler.handle(req(),'verifyMfa'),401); assert.equal(f.commits,2)
})
test('login → selection → destination MFA → ACTIVE: only committed server transitions set cookies', async () => {
  const {handler,f} = fixture('BOOTSTRAP')
  const transition=(kind:'PREAUTH'|'ACTIVE',ttl=600000)=>({kind,token:token(),csrf:token(),expiresAt:clock()+ttl})
  f.effect={data:{state:'TENANT_SELECTION_REQUIRED',expires_at:new Date(clock()+600000).toISOString()},transition:transition('PREAUTH')}
  const login=await handler.handle(request('/auth/login','POST',{email:'synthetic@example.test',password:'synthetic-password'}),'login')
  assert.equal(login.status,200); assert.ok(login.headers.getSetCookie().every(c=>c.includes('Secure')&&!c.includes('Domain='))); assert.ok(!(await login.text()).includes('__Host-cleanops'))
  f.binding=binding('PREAUTH','TENANT_SELECTION_REQUIRED'); f.effect={data:pending(),transition:transition('PREAUTH')}
  assert.equal((await handler.handle(request('/auth/tenant-switch','POST',{target_tenant_id:dest,reason:'choose'}),'switchTenant')).status,200)
  assert.equal(f.last.target_tenant_id,dest); assert.ok(f.rules.includes('B1-SELF-08'))
  f.binding=binding('PREAUTH','PENDING_MFA'); f.effect={data:active(dest),transition:transition('ACTIVE',28800000)}
  const verified=await handler.handle(request('/auth/mfa/verify','POST',{challenge_id:uuid,method:'TOTP',proof:'123456'}),'verifyMfa')
  assert.equal(verified.status,200); assert.match(verified.headers.getSetCookie().join(';'),/__Host-cleanops_session=/)
  f.commitFailure=true
  await expectError(await handler.handle(request('/auth/mfa/verify','POST',{challenge_id:uuid,method:'TOTP',proof:'123456'}),'verifyMfa'),503)
})
test('concurrent identical idempotency keys have one effect, mismatches fail and secrets are not replayed', async () => {
  const {handler,f,records}=fixture(); f.effect={data:{state:'REVOKED',revoked_count:2}}
  const req=()=>request('/me/sessions/revoke-other-own','POST',{reason:'self'})
  const responses=await Promise.all([handler.handle(req(),'revokeOtherOwnSessions'),handler.handle(req(),'revokeOtherOwnSessions')])
  assert.ok(responses.every(r=>r.status===200)); assert.equal(f.calls,1)
  await expectError(await handler.handle(request('/me/sessions/revoke-other-own','POST',{reason:'different'}),'revokeOtherOwnSessions'),409,'IDEMPOTENCY_MISMATCH')
  records.clear(); f.binding=binding('PREAUTH','ENROLLMENT_REQUIRED')
  f.effect={data:{enrollment_id:uuid,provisioning_uri:'otpauth://synthetic',expires_at:new Date(clock()+600000).toISOString()}}
  const enroll=()=>request('/mfa/totp/enroll')
  assert.equal((await handler.handle(enroll(),'enrollTotp')).status,200)
  await expectError(await handler.handle(enroll(),'enrollTotp'),409,'RESULT_NOT_REPLAYABLE')
  assert.ok(!JSON.stringify([...records]).includes('otpauth'))
})
test('backend token leakage or premature ACTIVE login aborts and never sets cookies', async () => {
  const {handler,f}=fixture('BOOTSTRAP'); f.effect={data:active()}
  const req=()=>request('/auth/login','POST',{email:'synthetic@example.test',password:'synthetic-password'})
  await expectError(await handler.handle(req(),'login'),503,'MFA_REQUIRED')
  f.effect={data:{...pending(),token:'secret'}}
  const response=await handler.handle(req(),'login'); await expectError(response,503,'INVALID_BACKEND_RESPONSE'); assert.equal(f.commits,0)
})


test('all effective HTTP operations dispatch validated requests and responses through a transaction', async () => {
  const internalOrigins = ['http://0.0.0.0:3000', 'https://0.0.0.0:3000', 'http://127.0.0.1:3000']
  for (const transport of [origin, ...internalOrigins]) for (const operation of operations) {
    const { backend, f } = fixture()
    const handler = createAuthHandler(backend, origin, clock, internalOrigins)
    const transportedRequest = (path: string, method: string, body?: unknown) => new Request(transport + path, request(path, method, body, { Host: 'cleanops.test' }))
    const bodySchema = operation.requestBody?.content['application/json'].schema
    const body = bodySchema ? sample(bodySchema) : undefined
    if (operation.operationId === 'selectTotpMethod') (body as Input).grant_id = 'B1-SELF-05'
    const requiredQuery=operation.parameters.filter(p=>p.in==='query'&&p.required).map(p=>[p.name,String(sample(p.schema))])
    const path = operation.path.replace('{session_id}', uuid)+(requiredQuery.length?'?'+new URLSearchParams(requiredQuery).toString():'')
    const example = sample(operation.responses['200'].content['application/json'].schema) as { data: Input }
    f.effect = { data: example.data }
    if (operation.operationId === 'login') {
      f.binding = binding('BOOTSTRAP')
      f.effect = { data: pending(), transition: { kind: 'PREAUTH', token: token(), csrf: token(), expiresAt: clock()+600000 } }
    }
    if(operation.operationId==='registerTrustedDevice'){const expiresAt=clock()+600000;f.effect={data:{device:{id:uuid,created_at:new Date(clock()).toISOString(),expires_at:new Date(expiresAt).toISOString()}},trustedCookie:{token:token(),expiresAt}}}
    if(operation.operationId==='resetPassword'){f.binding=binding('BOOTSTRAP');f.effect={data:{state:'PASSWORD_RESET'},clearSession:true}}
    if (operation.operationId === 'recoverMfa') {
      f.binding = binding('PREAUTH','PENDING_MFA')
      f.effect = { data: {state:'ENROLLMENT_REQUIRED',allowed_methods:['TOTP'],expires_at:new Date(clock()+600000).toISOString()},
        transition: {kind:'PREAUTH',token:token(),csrf:token(),expiresAt:clock()+600000} }
    }
    if (operation.operationId === 'switchTenant') {
      f.effect = { data: pending(), transition: { kind: 'PREAUTH', token: token(), csrf: token(), expiresAt: clock()+600000 } }
    }
    const response = await handler.handle(transportedRequest(path, operation.method, body), operation.operationId)
    assert.equal(response.status,200,operation.operationId)
    assert.ok(valid(operation.responses['200'].content['application/json'].schema, await response.json()), operation.operationId)
    assert.equal(f.commits,1,operation.operationId)
    f.binding = null
    await expectError(await handler.handle(transportedRequest(path,operation.method,body),operation.operationId),401)
  }
})

test('pending switch preserves source cookie and replay never crosses a tenant binding', async () => {
  const { handler, f, records } = fixture()
  f.effect = { data: pending(), transition: { kind: 'PREAUTH', token: token(), csrf: token(), expiresAt: clock()+600000 } }
  const response = await handler.handle(request('/auth/tenant-switch','POST',{ target_tenant_id:dest,reason:'choose' }),'switchTenant')
  assert.equal(response.status,200)
  assert.ok(!response.headers.getSetCookie().some(c=>c.startsWith(names.session+'=')))
  records.clear(); f.effect = { data: { state:'REVOKED',revoked_count:1 } }
  const req=()=>request('/me/sessions/revoke-other-own','POST',{ reason:'self' })
  assert.equal((await handler.handle(req(),'revokeOtherOwnSessions')).status,200)
  f.binding = { ...binding(), tenantId:dest, id:'other-verified-binding' }
  assert.equal((await handler.handle(req(),'revokeOtherOwnSessions')).status,200)
  assert.equal(f.calls,3) // switch + separate operation in each tenant
})


test('step-up verification cannot create a session or extend the existing absolute deadline', async () => {
  const { handler, f } = fixture()
  const req=()=>request('/auth/mfa/verify','POST',{challenge_id:uuid,method:'TOTP',proof:'123456'})
  f.effect={data:active(),transition:{kind:'ACTIVE',token:token(),csrf:token(),expiresAt:clock()+28800000}}
  await expectError(await handler.handle(req(),'verifyMfa'),503,'INVALID_STEP_UP_TRANSITION')
  f.effect={data:{...active(),session_id:dest}}
  await expectError(await handler.handle(req(),'verifyMfa'),503,'INVALID_STEP_UP_TRANSITION')
  f.effect={data:{...active(),absolute_expires_at:new Date(clock()+28800001).toISOString()}}
  await expectError(await handler.handle(req(),'verifyMfa'),503,'INVALID_STEP_UP_TRANSITION')
  assert.equal(f.commits,0)
})
test('even a malformed private adapter cannot return another tenant identity or session', async () => {
  const { handler, f } = fixture()
  f.effect={data:{id:dest,tenant_id:dest,display_name:'Foreign',email:'synthetic@example.test'}}
  await expectError(await handler.handle(request('/auth/me','GET'),'getCurrentIdentity'),503,'INVALID_SUBJECT_RESPONSE')
  f.effect={data:{items:[{id:uuid,tenant_id:dest,user_id:uuid,created_at:new Date(clock()).toISOString(),last_activity_at:new Date(clock()).toISOString(),absolute_expires_at:new Date(clock()+1000).toISOString(),device_label:'fixture',browser_label:'fixture',is_current:false}],next_cursor:null}}
  await expectError(await handler.handle(request('/me/sessions','GET'),'listSelfSessions'),503,'INVALID_SUBJECT_RESPONSE')
  assert.equal(f.commits,0)
})


test('login and MFA verification never become replayable when a caller adds an idempotency header', async () => {
  const { handler, f, records } = fixture('PREAUTH','PENDING_MFA')
  const req=()=>request('/auth/mfa/verify','POST',{challenge_id:uuid,method:'TOTP',proof:'123456'})
  f.effect={data:active(),transition:{kind:'ACTIVE',token:token(),csrf:token(),expiresAt:clock()+28800000}}
  assert.equal((await handler.handle(req(),'verifyMfa')).status,200)
  f.effect=new AuthError(401,'AUTH_INVALID')
  await expectError(await handler.handle(req(),'verifyMfa'),401,'AUTH_INVALID')
  assert.equal(f.calls,2);assert.equal(records.size,0)
})

test('internal HTTP preserves digest-bound CSRF denial before any business effect', async () => {
  const { backend, f } = fixture()
  const handler = createAuthHandler(backend, origin, clock, ['http://0.0.0.0:3000'])
  const req = () => new Request('http://0.0.0.0:3000/me/sessions/revoke-other-own', request('/me/sessions/revoke-other-own', 'POST', { reason: 'self' }, { Host: 'cleanops.test', 'X-CSRF-Token': 'X'.repeat(43) }))
  await expectError(await handler.handle(req(), 'revokeOtherOwnSessions'), 403, 'CSRF_INVALID')
  assert.equal(f.calls, 0); assert.equal(f.commits, 1)
})



test('activity renewal uses the persisted deadline and unchanged cookies under both approved risk policies', async () => {
  for (const [idle, absolute] of [[1800, 43200], [28800, 86400]]) {
    const { f, handler } = fixture()
    f.binding = { ...binding(), expiresAt: clock()+1000, absoluteExpiresAt: clock()+absolute*1000 }
    f.renewalDeadline = clock()+idle*1000
    f.effect = { data: { ...active(), absolute_expires_at: new Date(f.binding.absoluteExpiresAt!).toISOString() } }
    const response = await handler.handle(request('/auth/users/session','GET'), 'getAdministrationSession')
    assert.equal(response.status, 200)
    assert.equal(f.durableRenewals, 1)
    assert.deepEqual(response.headers.getSetCookie(), [
      cookie(names.session, bindingToken, idle), cookie(names.csrf, csrf, idle, false),
    ])
    assert.equal((await response.json()).data.absolute_expires_at, new Date(f.binding.absoluteExpiresAt!).toISOString())
  }
})

test('renewal never exceeds the original absolute deadline or accepts invalid persisted expiry', async () => {
  for (const deadline of [clock(), clock()-1, clock()+28800001, NaN, Infinity]) {
    const { f, handler } = fixture()
    f.renewalDeadline = deadline
    await expectError(await handler.handle(request('/auth/users/session','GET'),'getAdministrationSession'),503,'INVALID_COOKIE_TRANSITION')
    assert.equal(f.commits,0); assert.equal(f.durableRenewals,0)
  }
  const { f, handler } = fixture()
  f.binding = { ...binding(), absoluteExpiresAt: clock()+5000 }
  f.renewalDeadline = f.binding.absoluteExpiresAt
  f.effect = { data: { ...active(), absolute_expires_at: new Date(f.renewalDeadline!).toISOString() } }
  const response = await handler.handle(request('/auth/users/session','GET'),'getAdministrationSession')
  assert.equal(response.status,200)
  assert.ok(response.headers.getSetCookie().every(c=>c.includes('Max-Age=5')))
})

test('expired, revoked and no-longer-valid activity never commits a renewal', async () => {
  for (const scenario of ['idle-exact','idle-past','absolute-exact','revoked','during-operation']) {
    const { f, handler } = fixture()
    if (scenario==='idle-exact') f.binding={...binding(),expiresAt:clock()}
    if (scenario==='idle-past') f.binding={...binding(),expiresAt:clock()-1}
    if (scenario==='absolute-exact') f.binding={...binding(),absoluteExpiresAt:clock()}
    if (scenario==='revoked') f.revoked=true
    if (scenario==='during-operation') { f.binding={...binding(),expiresAt:clock()+1000}; f.expireDuringExecute=true }
    await expectError(await handler.handle(request('/auth/users/session','GET'),'getAdministrationSession'),401,'AUTH_INVALID')
    assert.equal(f.durableRenewals,0);assert.equal(f.commits,0)
  }
})

test('GET with an unverified CSRF cookie cannot touch activity or overwrite CSRF', async () => {
  const { f, handler } = fixture()
  const headers={Cookie:names.session+'='+bindingToken+'; '+names.csrf+'='+'X'.repeat(43)}
  const response=await handler.handle(request('/auth/users/session','GET',undefined,headers),'getAdministrationSession')
  assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal(f.renewals,0)
})

test('denied, rate-limited and invalid responses do not renew activity', async () => {
  for (const scenario of ['rate','invalid','factor']) {
    const { f, handler } = fixture()
    if (scenario==='rate') f.retry=30
    if (scenario==='invalid') f.effect={data:{unexpected:true}}
    if (scenario==='factor') f.effect=new AuthError(422,'MFA_INVALID')
    const response=await handler.handle(request('/auth/users/session','GET'),'getAdministrationSession')
    assert.notEqual(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal(f.renewals,0)
  }
})

test('commit failure never emits refreshed cookies and a delayed expired response does not delete newer cookies', async () => {
  const failed=fixture();failed.f.commitFailure=true
  await expectError(await failed.handler.handle(request('/auth/users/session','GET'),'getAdministrationSession'),503)
  assert.equal(failed.f.durableRenewals,0)
  const delayed=fixture();delayed.f.afterCommit=delayed.f.binding!.expiresAt+1
  const response=await delayed.handler.handle(request('/auth/users/session','GET'),'getAdministrationSession')
  assert.equal(response.status,200);assert.equal(delayed.f.durableRenewals,1)
  assert.equal(response.headers.get('set-cookie'),null)
})

test('concurrent authorized idempotent replays renew without repeating the business effect', async () => {
  const { f, handler }=fixture()
  f.effect={data:{challenge_id:uuid,allowed_methods:['TOTP'],expires_at:new Date(clock()+600000).toISOString()}}
  const req=()=>request('/auth/step-up','POST',{grant_id:'B1-SELF-05'})
  const responses=await Promise.all([handler.handle(req(),'startStepUp'),handler.handle(req(),'startStepUp')])
  assert.deepEqual(responses.map(r=>r.status),[200,200])
  assert.equal(f.calls,1);assert.equal(f.durableRenewals,2)
  assert.ok(responses.every(r=>r.headers.getSetCookie().length===2))
})
