import test from 'node:test'
import assert from 'node:assert/strict'
import { hash, verify, argon2id, argon2i } from 'argon2'
import { verifyPasswordFactor, prepareReplacementHash } from '../../lib/b1/password.ts'
import { AuthError, closedBackend } from '../../lib/b1/service.ts'
import { numeric } from '../../lib/b1/config.ts'

const password = 'Correcta 🔐 contraseña'
const current = { type: argon2id, version: 0x13, memoryCost: 65536, timeCost: 3, parallelism: 1 }
const noReplace = async () => { assert.fail('must not replace hash'); return false }
const invalid = (value: unknown) => {
  assert.ok(value instanceof AuthError)
  assert.equal(value.status, 401)
  assert.equal(value.code, 'AUTH_INVALID')
}
const unavailable = (error: unknown) => error instanceof AuthError && error.status === 503 && error.code === 'AUTH_DEPENDENCY_UNAVAILABLE'

test('Argon2id verifies real passwords with the exact B1 trial profile', async () => {
  assert.deepEqual([numeric('argon_memory'), numeric('argon_iterations'), numeric('argon_parallelism')], [65536, 3, 1])
  const encoded = await hash(password, current)
  assert.match(encoded, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/)
  assert.deepEqual(await verifyPasswordFactor(password, encoded, noReplace), { verified: true })
  invalid(await verifyPasswordFactor('incorrecta', encoded, noReplace))
  invalid(await verifyPasswordFactor(password.normalize('NFD'), encoded, noReplace))
})

test('malformed, corrupt, foreign algorithm and excessive PHC costs fail closed', async () => {
  const encoded = await hash(password, current)
  const foreign = await hash(password, { ...current, type: argon2i })
  for (const bad of [
    '', 'broken', encoded.slice(0, -1), encoded.replace('m=65536', 'm=999999'),
    encoded.replace('t=3', 't=99'), encoded.replace('p=1', 'p=4'),
    encoded.replace('v=19', 'v=20'), encoded + '$extra', foreign,
    encoded.replace(/\$[^$]+$/, '$' + Buffer.alloc(32).toString('base64').replace(/=+$/, '')),
  ]) invalid(await verifyPasswordFactor(password, bad, noReplace))
  for (const bad of ['', 'x'.repeat(129), '\uD800']) invalid(await verifyPasswordFactor(bad, encoded, noReplace))
})

test('valid legacy parameters upgrade progressively with fresh salts and CAS before success', async () => {
  const legacy = await hash(password, { ...current, memoryCost: 32768, timeCost: 2, version: 0x10, salt: Buffer.alloc(8, 7), hashLength: 16 })
  const replacements: string[] = []
  const replace = async (expected: string, replacement: string) => {
    assert.equal(expected, legacy)
    assert.equal(await verify(replacement, password), true)
    replacements.push(replacement)
    return true
  }
  invalid(await verifyPasswordFactor('incorrecta', legacy, noReplace))
  for (let i = 0; i < 2; i++) assert.deepEqual(await verifyPasswordFactor(password, legacy, replace), { verified: true })
  assert.notEqual(replacements[0], replacements[1])
  for (const replacement of replacements) {
    assert.match(replacement, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/)
    assert.equal(Buffer.from(replacement.split('$')[4], 'base64').length, 16)
    assert.equal(Buffer.from(replacement.split('$')[5], 'base64').length, 32)
    assert.deepEqual(await verifyPasswordFactor(password, replacement, noReplace), { verified: true })
  }
})

test('replacement failure or credential race throws 503; runtime remains closed', async () => {
  const legacy = await hash(password, { ...current, timeCost: 2 })
  await assert.rejects(verifyPasswordFactor(password, legacy, async () => false), unavailable)
  await assert.rejects(verifyPasswordFactor(password, legacy, async () => { throw new Error('storage offline') }), unavailable)
  await assert.rejects(closedBackend.bootstrap('unused', 'unused', Date.now() + 1000), unavailable)
  await assert.rejects(closedBackend.transaction(async () => ({ verified: true })), unavailable)
})


test('reset hash preparation uses explicit private admission and independent Argon2id salts',async()=>{
  const seen:string[]=[]
  const admission=async(value:string)=>{seen.push(value);return true}
  const first=await prepareReplacementHash(password,admission),second=await prepareReplacementHash(password,admission)
  assert.equal(typeof first,'string');assert.equal(typeof second,'string')
  assert.notEqual(first,second)
  assert.equal(await verify(first as string,password),true)
  assert.match(first as string,/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/)
  assert.deepEqual(seen,[password,password])
})
test('reset hash preparation cannot bypass unavailable policy or admit malformed passwords',async()=>{
  const refused=await prepareReplacementHash(password,async()=>false)
  assert.ok(refused instanceof AuthError && refused.status===422)
  await assert.rejects(prepareReplacementHash(password,async()=>{throw new Error('private corpus unavailable')}),unavailable)
  await assert.rejects(prepareReplacementHash(password,undefined as never),unavailable)
  const invalid=await prepareReplacementHash('\ud800',async()=>{assert.fail('must reject malformed input before policy');return true})
  assert.ok(invalid instanceof AuthError && invalid.status===422)
})
