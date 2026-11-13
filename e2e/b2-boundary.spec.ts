import { test, expect } from '@playwright/test'

test('invitation ceremony clears the fragment, remains closed and emits no B1 session',async({page,context})=>{
 const token='a'.repeat(43)
 await page.goto('/invitation#id=11111111-1111-4111-8111-111111111111&token='+token)
 await expect(page).toHaveURL(/\/invitation$/)
 await expect(page.getByRole('heading',{name:'Aceptar invitación'})).toBeVisible()
 await page.getByLabel('Contraseña',{exact:true}).fill('Synthetic invitation password 123!')
 const response=page.waitForResponse(r=>r.url().endsWith('/auth/invitations/prepare'))
 await page.getByRole('button',{name:'Verificar',exact:true}).click()
 expect((await response).status()).toBe(503)
 await expect(page.getByRole('main').getByRole('alert')).toContainText('no está disponible')
 await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('')
 // A dependency failure must leave the in-memory link usable for another try.
 await page.getByLabel('Contraseña',{exact:true}).fill('Synthetic retry password 456!')
 const retry=page.waitForResponse(r=>r.url().endsWith('/auth/invitations/prepare'))
 await page.getByRole('button',{name:'Verificar',exact:true}).click()
 const retried=await retry
 expect(retried.status()).toBe(503)
 expect(retried.request().postDataJSON()).toEqual({invitation_id:'11111111-1111-4111-8111-111111111111',token,password:'Synthetic retry password 456!'})
 await expect(page).toHaveURL(/\/invitation$/)
 await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('')
 expect((await context.cookies()).filter(c=>/__Host-cleanops_(session|preauth)/.test(c.name))).toEqual([])
 for(const path of ['factor','accept']){
  const result=await page.request.post('/auth/invitations/'+path,{data:{}})
  expect(result.status()).toBe(503);expect(result.headers()['set-cookie']).toBeUndefined()
 }
})

test('reloading the cleared invitation cannot recover or submit its token',async({page})=>{
 await page.goto('/invitation#id=11111111-1111-4111-8111-111111111111&token='+'a'.repeat(43))
 await expect(page).toHaveURL(/\/invitation$/)
 await page.reload()
 let submissions=0
 page.on('request',request=>{if(new URL(request.url()).pathname==='/auth/invitations/prepare')submissions++})
 await page.getByLabel('Contraseña',{exact:true}).fill('Synthetic invitation password 123!')
 await page.getByRole('button',{name:'Verificar',exact:true}).click()
 await expect(page.getByRole('main').getByRole('alert')).toContainText('Solicita una nueva invitación')
 expect(submissions).toBe(0)
 expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0})
})

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
