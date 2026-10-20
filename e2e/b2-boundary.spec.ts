import { test, expect } from '@playwright/test'

test('B2 directory routes stay closed and never issue session cookies', async ({request}) => {
 for (const path of ['/auth/users','/auth/users/detail?target_user_id=11111111-1111-4111-8111-111111111111']) {
  const response=await request.get(path)
  const body=await response.json()
  expect(response.status(),JSON.stringify({path,code:body.error?.code})).toBe(503)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(response.headers()['set-cookie']).toBeUndefined()
  expect(body.error.code).toBe('AUTH_DEPENDENCY_UNAVAILABLE')
 }
})
test('B2 rejects tenant claims and malformed selectors before closed backend access', async ({request}) => {
 for (const query of ['tenant_id=11111111-1111-4111-8111-111111111111','limit=51','search=a&search=b','state=ADMIN']) {
  const response=await request.get('/auth/users?'+query)
  expect(response.status()).toBe(400)
  expect(response.headers()['set-cookie']).toBeUndefined()
 }
})
