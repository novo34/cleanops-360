import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createV4IdentityRepository, type V4Broker } from '../../lib/b1/v4-broker.ts'
import { AuthError } from '../../lib/b1/service.ts'
import type { IdentityConnection } from '../../lib/b1/pg-identity-driver.ts'

const unavailable = (error: unknown) => error instanceof AuthError && error.status === 503 && error.cause === undefined
type Call = { sql: string; values: unknown[] }
function fixture(answer: (name: string, values: unknown[]) => unknown = () => null) {
  const calls: Call[] = [], released: boolean[] = []
  const client: IdentityConnection = {
    async query(sql, values = []) {
      calls.push({ sql, values })
      if (!sql.startsWith('SELECT')) return {}
      const name = /auth_api\.([a-z_]+)/.exec(sql)?.[1] ?? ''
      const value = answer(name, values)
      return sql.startsWith('SELECT *') ? { rows: value } : { rows: [{ value }] }
    },
    release(discard = false) { released.push(discard) },
  }
  let connects = 0
  const pool = { async connect() { connects++; return client } }
  return { pool, client, calls, released, get connects() { return connects } }
}
test('broker uses canonical functions and placeholders; no SQL value interpolation', async () => {
  const injection = "x'); DROP TABLE app.users; --"
  const f = fixture(name => name === 'login_material' ? [] : null)
  await createV4IdentityRepository(f.pool).transaction(async broker => {
    assert.deepEqual(await broker.call('loginMaterial', [injection]), [])
    await broker.call('bootstrap', [Buffer.alloc(32, 1), Buffer.alloc(32, 2)])
  })
  assert.equal(f.connects, 1)
  assert.deepEqual(f.calls.map(c => c.sql), [
    'BEGIN ISOLATION LEVEL READ COMMITTED',
    'SELECT * FROM auth_api.login_material($1::text)',
    'SELECT auth_api.bootstrap_csrf($1::bytea, $2::bytea) AS value', 'COMMIT',
  ])
  assert.equal(f.calls[1].values[0], injection)
  assert.deepEqual(f.released, [false])
  const ddl = readFileSync(new URL('../../docs/canonical/auth-review/v4/b1-review-only.sql', import.meta.url), 'utf8')
  // Static drift check for every literal statement, not SQL execution.
  const source = readFileSync(new URL('../../lib/b1/v4-broker.ts', import.meta.url), 'utf8')
  const functions = [...source.matchAll(/SELECT (?:\* FROM )?auth_api\.([a-z_]+)\(/g)].map(match => match[1])
  assert.equal(functions.length, 68)
  const sql07 = readFileSync(new URL('../../docs/proposals/b1-consolidated-sql/revisions/11/schema.review.sql', import.meta.url), 'utf8')
  const extension = readFileSync(new URL('../../docs/proposals/b1-v4-extension/review-only.sql', import.meta.url), 'utf8')
  const d1 = readFileSync(new URL('../../docs/proposals/b1-ceremony-material/review-only.sql', import.meta.url), 'utf8')
  for (const name of functions) assert.ok(sql07.includes('CREATE FUNCTION auth_api.' + name + '(') || sql07.includes('CREATE OR REPLACE FUNCTION auth_api.' + name + '(') || d1.includes('CREATE FUNCTION auth_api.' + name + '(') || ddl.includes('CREATE FUNCTION auth_api.' + name + '(') || extension.includes('CREATE FUNCTION auth_api.' + name + '('), name)
})

test('database error poisons the transaction even if the consumer catches it', async () => {
  const f = fixture(() => { throw Object.assign(new Error('secret database diagnostic'), { code: '40001' }) })
  await assert.rejects(createV4IdentityRepository(f.pool).transaction(async broker => {
    await assert.rejects(broker.call('identity', []), unavailable)
    return 'must not commit'
  }), unavailable)
  assert.equal(f.calls.at(-1)?.sql, 'ROLLBACK')
  assert.deepEqual(f.released, [true])
})

test('SQL08 reset material is strict, private and bound to the same transaction as CAS',async()=>{
  const material={tenantId:'00000000-0000-4000-8000-000000000001',userId:'00000000-0000-4000-8000-000000000002',principalId:'00000000-0000-4000-8000-000000000003',credentialVersion:'9',expiresAt:new Date(Date.now()+60000).toISOString(),requiresRecovery:true}
  const f=fixture(name=>name==='password_reset_material'?material:name==='reset_password_cas'?true:null)
  await createV4IdentityRepository(f.pool).transaction(async broker=>{
    const ticket=Buffer.alloc(32,1),value=await broker.call('resetMaterial',[ticket])
    assert.equal(value?.credentialVersion,'9')
    assert.equal(JSON.stringify(value),'"[REDACTED_RESET_MATERIAL]"')
    assert.equal(await broker.call('resetPassword',[ticket,value!.credentialVersion,Buffer.alloc(32,2),'$argon2id$private','00000000-0000-4000-8000-000000000004']),true)
  })
  assert.equal(f.connects,1);assert.equal(f.calls.at(-1)?.sql,'COMMIT')
  for(const bad of [{...material,credentialVersion:'0'},{...material,requiresRecovery:'true'},{...material,passwordHash:'private'}]){
    const broken=fixture(()=>bad)
    await assert.rejects(createV4IdentityRepository(broken.pool).transaction(b=>b.call('resetMaterial',[Buffer.alloc(32)])),unavailable)
    assert.equal(broken.calls.at(-1)?.sql,'ROLLBACK')
  }
})

test('EMAIL verified recipient material is private under serialization and spread', async () => {
  const address='verified-private@fixture.invalid'
  const f=fixture(name=>name==='mail_recipient_material'?{recipient:address,recipientVersion:'3'}:null)
  await createV4IdentityRepository(f.pool).transaction(async broker=>{
    const material=await broker.call('mailMaterial',['a'.repeat(43),'LOGIN',null,null]) as Record<string,unknown>
    assert.equal(material.recipient,address)
    assert.equal(JSON.stringify(material).includes(address),false)
    assert.equal(Object.hasOwn({...material},'recipient'),false)
  })
})

test('escaped broker cannot query a released connection or rebind another tenant', async () => {
  const f = fixture()
  let escaped: V4Broker | undefined
  await createV4IdentityRepository(f.pool).transaction(async broker => { escaped = broker })
  const count = f.calls.length
  await assert.rejects(escaped!.call('beginContext', ['b'.repeat(43)]), unavailable)
  assert.equal(f.calls.length, count)
})

test('unawaited work drains before rollback and never commits', async () => {
  const f = fixture(() => null)
  let task: Promise<unknown> | undefined
  await assert.rejects(createV4IdentityRepository(f.pool).transaction(async broker => {
    task = broker.call('policy', [])
    return 'early'
  }), unavailable)
  await task
  assert.equal(f.calls.at(-1)?.sql, 'ROLLBACK')
  assert.equal(f.calls.some(c => c.sql === 'COMMIT'), false)
})


test('expected TOTP material denial restores a savepoint for durable counters while unknown SQL errors still poison',async()=>{
 const args:[string,string,'LOGIN']=['a'.repeat(43),'00000000-0000-4000-8000-000000000001','LOGIN']
 const f=fixture(name=>{if(name==='totp_material_locked')throw Object.assign(new Error('AUTH_INVALID'),{code:'42501'});return null})
 await createV4IdentityRepository(f.pool).transaction(async broker=>{
  await assert.rejects(broker.call('totpMaterial',args),(e:unknown)=>e instanceof AuthError&&e.status===401)
  await broker.call('securityEvent',['MFA_DENIED',Buffer.alloc(32),null,null,'00000000-0000-4000-8000-000000000002'])
 })
 assert.ok(f.calls.some(c=>c.sql==='ROLLBACK TO SAVEPOINT b1_totp_material'));assert.equal(f.calls.at(-1)?.sql,'COMMIT');assert.deepEqual(f.released,[false])
 const broken=fixture(()=>{throw Object.assign(new Error('private native failure'),{code:'40001'})})
 await assert.rejects(createV4IdentityRepository(broken.pool).transaction(async broker=>{await assert.rejects(broker.call('totpMaterial',args),unavailable)}),unavailable)
 assert.equal(broken.calls.at(-1)?.sql,'ROLLBACK');assert.deepEqual(broken.released,[true])
})
