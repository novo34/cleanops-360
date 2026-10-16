import test from 'node:test'
import assert from 'node:assert/strict'
import { createPgIdentityDriver, type IdentityConnection } from '../../lib/b1/pg-identity-driver.ts'
import { createPrivateBackend } from '../../lib/b1/private-adapter.ts'
import { AuthError, closedBackend, type Transaction } from '../../lib/b1/service.ts'

function fixture(fail?: string) {
  const commands: string[] = []; const released: boolean[] = []
  const connection: IdentityConnection = {
    async query(sql: string) {
      commands.push(sql)
      if (sql === fail) throw Error('private db diagnostic')
    },
    release(discard = false) { released.push(discard) },
  }
  const driver = createPgIdentityDriver(
    { async connect() { return connection } },
    () => ({ marker: 'bound-to-connection' }) as unknown as Transaction,
    async (c, digest, csrf, expiry) => {
      assert.equal(c, connection)
      assert.match(digest, /^[a-f]{64}$/)
      assert.match(csrf, /^[b-f]{64}$/)
      assert.equal(expiry, 1_800_000_000_000)
      if (fail === 'writer') throw Error('private bootstrap diagnostic')
    },
  )
  return { driver, commands, released }
}
const unavailable = (error: unknown) => error instanceof AuthError && error.status === 503 &&
  error.code === 'AUTH_DEPENDENCY_UNAVAILABLE' && error.cause === undefined

test('successful effect commits before returning, using one connection', async () => {
  const f = fixture()
  const output = await f.driver.transaction(async tx => {
    assert.deepEqual(tx, { marker: 'bound-to-connection' })
    return 'committable'
  })
  assert.equal(output, 'committable')
  assert.deepEqual(f.commands, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'COMMIT'])
  assert.deepEqual(f.released, [false])
})

test('typed failed-factor outcome commits attempt state rather than rolling it back', async () => {
  const f = fixture()
  const failure = new AuthError(401, 'AUTH_INVALID')
  assert.equal(await f.driver.transaction(async () => failure), failure)
  assert.deepEqual(f.commands, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'COMMIT'])
  assert.deepEqual(f.released, [false])
})

test('thrown identity failure rolls back and discards the connection', async () => {
  const f = fixture()
  await assert.rejects(f.driver.transaction(async () => { throw new AuthError(403, 'POLICY_DENIED') }),
    (e: unknown) => e instanceof AuthError && e.code === 'POLICY_DENIED')
  assert.deepEqual(f.commands, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK'])
  assert.deepEqual(f.released, [true])
})

test('commit failure never releases a successful effect or reuses connection', async () => {
  const f = fixture('COMMIT')
  await assert.rejects(f.driver.transaction(async () => ({ verified: true })), unavailable)
  assert.deepEqual(f.commands, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'COMMIT', 'ROLLBACK'])
  assert.deepEqual(f.released, [true])
})

test('bootstrap writer must commit; errors reject and do not create an active binding', async () => {
  const f = fixture()
  const backend = createPrivateBackend(f.driver)
  await backend.bootstrap('a'.repeat(64), 'b'.repeat(64), 1_800_000_000_000)
  assert.deepEqual(f.commands, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'COMMIT'])
  const g = fixture('writer')
  await assert.rejects(g.driver.bootstrap('a'.repeat(64), 'b'.repeat(64), 1_800_000_000_000), unavailable)
  assert.deepEqual(g.commands, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK'])
  assert.deepEqual(g.released, [true])
})

test('begin failure is hidden, connection discarded, runtime remains closed', async () => {
  const f = fixture('BEGIN ISOLATION LEVEL READ COMMITTED')
  await assert.rejects(f.driver.transaction(async () => true), unavailable)
  assert.deepEqual(f.released, [true])
  assert.deepEqual(f.commands, ['BEGIN ISOLATION LEVEL READ COMMITTED'])
  await assert.rejects(closedBackend.transaction(async () => true), unavailable)
})
