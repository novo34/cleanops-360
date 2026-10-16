import test from 'node:test'
import assert from 'node:assert/strict'
import { bucketAt, failure, retryAfter, rateLimits } from '../../lib/b1/rate-limit.ts'

test('rate dimensions and progressive backoff preserve 900s window without permanent lockout', () => {
  const start=100000, empty={ startedAt:start,failures:0,blockedUntil:0 }
  assert.deepEqual(rateLimits('login'),[5,30,10]); assert.deepEqual(rateLimits('otp'),[5,30,10])
  assert.equal(retryAfter([empty,empty,empty],rateLimits('login'),start),null)
  const failed=failure(empty,start)
  assert.equal(retryAfter([failed,empty,empty],rateLimits('login'),start),1)
  assert.equal(retryAfter([failed,empty,empty],rateLimits('login'),start+1000),null)
  assert.equal(retryAfter([{...empty,failures:5},empty,empty],rateLimits('login'),start),900)
  assert.deepEqual(bucketAt({...empty,failures:100},start+900000),{ startedAt:start+900000,failures:0,blockedUntil:0 })
  let b=empty;for(let i=0;i<20;i++) b=failure(b,start)
  assert.equal(b.blockedUntil-start,60000)
  assert.throws(()=>retryAfter([empty],rateLimits('login'),start))
})
