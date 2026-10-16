import { numeric, profile } from './config.ts'

export type Bucket = { startedAt: number; failures: number; blockedUntil: number }
/** Pure policy kernel. The private adapter must atomically lock/persist HMAC-keyed buckets;
 * failure to load/store a bucket is a dependency error, never permission to continue. */
export function bucketAt(bucket: Bucket, now: number): Bucket {
  if (!Number.isFinite(now) || bucket.failures < 0 || !Number.isSafeInteger(bucket.failures)) throw new Error('INVALID_RATE_BUCKET')
  return now >= bucket.startedAt + numeric('rate_window') * 1000 ? { startedAt: now, failures: 0, blockedUntil: 0 } : { ...bucket }
}
export function retryAfter(buckets: readonly Bucket[], limits: readonly number[], now: number): number | null {
  if (buckets.length !== 3 || limits.length !== 3) throw new Error('RATE_DIMENSIONS_REQUIRED')
  let blockedUntil = 0
  buckets.forEach((item, i) => {
    const b = bucketAt(item, now)
    if (b.failures >= limits[i]) blockedUntil = Math.max(blockedUntil, b.startedAt + numeric('rate_window') * 1000)
    blockedUntil = Math.max(blockedUntil, b.blockedUntil)
  })
  return blockedUntil > now ? Math.max(1,Math.min(numeric('rate_window'),Math.ceil((blockedUntil-now)/1000))) : null
}
export function failure(bucket: Bucket, now: number): Bucket {
  const b = bucketAt(bucket,now), backoff = profile.values.progressive_backoff
  if (!Array.isArray(backoff)) throw new Error('BACKOFF_REQUIRED')
  const count = b.failures + 1
  return { startedAt: b.startedAt, failures: count, blockedUntil: now + backoff[Math.min(count-1,backoff.length-1)] * 1000 }
}
export function rateLimits(kind: 'login' | 'otp'): readonly number[] {
  return kind === 'login' ? [numeric('login_user_limit'),numeric('login_ip_limit'),numeric('login_device_limit')] : [numeric('otp_issue_user_limit'),numeric('otp_issue_ip_limit'),numeric('otp_issue_device_limit')]
}
