import {test,expect} from '@playwright/test'
test('real invitation request and revocation persist through B1 owned API without granting a session',async({page,context})=>{
 await context.addCookies([
  {name:'__Host-cleanops_session',value:'a'.repeat(43),url:'https://127.0.0.1:3443',httpOnly:true,secure:true,sameSite:'Lax'},
  {name:'__Host-cleanops_csrf',value:'e'.repeat(43),url:'https://127.0.0.1:3443',secure:true,sameSite:'Lax'},
 ])
 await page.goto('/administration/users');await page.getByRole('button',{name:'Continuar con mi sesión'}).click()
 await page.getByRole('button',{name:'Invitaciones de usuarios',exact:true}).click()
 const panel=page.getByRole('region',{name:'Invitaciones',exact:true})
 await expect(panel.getByRole('table')).toBeVisible()
 await panel.getByLabel('Nombre de la persona').fill('B2 browser invitee')
 await panel.getByLabel('Email de la invitación').fill('browser-invitee@fixture.invalid')
 await panel.getByLabel('Motivo de la invitación').fill('B2 browser issue invitation')
 await panel.getByRole('button',{name:'Enviar invitación',exact:true}).click()
 const row=panel.getByRole('row').filter({hasText:'B2 browser invitee'})
 await expect(row.getByText('Pendiente',{exact:true})).toBeVisible()
 await row.getByRole('button',{name:'Revocar invitación de B2 browser invitee',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Revocar invitación',exact:true})
 await dialog.getByLabel('Motivo de la modificación').fill('B2 browser revoke invitation')
 await dialog.getByRole('button',{name:'Confirmar revocación',exact:true}).click()
 await expect(dialog).not.toBeVisible();await expect(row.getByText('Revocada',{exact:true})).toBeVisible()
 expect((await context.cookies()).find(cookie=>cookie.name==='__Host-cleanops_session')?.value).toBe('a'.repeat(43))
 await page.screenshot({path:'artifacts/b2-invitations/administration.png'})
})
