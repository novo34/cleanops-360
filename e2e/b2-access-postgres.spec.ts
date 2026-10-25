import {test,expect} from '@playwright/test'
const fixture=JSON.parse(process.env.B2_BROWSER_FIXTURE??'{}')
test('real Manage Access projects role names, queries target authority and persists an audited explicit deny',async({page,context})=>{
 await context.addCookies([
  {name:'__Host-cleanops_session',value:'a'.repeat(43),url:'https://127.0.0.1:3443',httpOnly:true,secure:true,sameSite:'Lax'},
  {name:'__Host-cleanops_csrf',value:'e'.repeat(43),url:'https://127.0.0.1:3443',secure:true,sameSite:'Lax'},
 ])
 await page.goto('/administration/users');await page.getByRole('button',{name:'Continuar con mi sesión'}).click()
 await page.getByRole('button',{name:'Ver ficha de Synthetic A2'}).click()
 await page.getByRole('dialog').getByRole('button',{name:'Manage Access',exact:true}).click()
 const panel=page.getByRole('region',{name:'Manage Access',exact:true})
 await expect(panel.getByText('B2 synthetic scoped reader',{exact:true})).toBeVisible()
 await panel.getByRole('button',{name:'Consultar roles disponibles'}).click()
 await expect(panel.getByText(/roles consultados/)).toBeVisible()
 await expect(panel.locator('datalist option[value="'+fixture.role+'"]')).toHaveAttribute('label',/B2 synthetic scoped reader/)
 async function checkTarget(){
  await panel.getByLabel('Tipo de recurso del usuario',{exact:true}).fill('documents')
  await panel.getByLabel('Recurso del usuario',{exact:true}).fill(fixture.document)
  await panel.getByRole('button',{name:'Consultar permiso del usuario'}).click()
 }
 await checkTarget();await expect(panel.getByText('El usuario tiene este permiso en el ámbito consultado.')).toBeVisible()
 await panel.getByLabel('Tipo de recurso',{exact:true}).fill('documents')
 await panel.getByLabel('Recurso concreto',{exact:true}).fill(fixture.document)
 await panel.getByLabel('Efecto',{exact:true}).selectOption('DENY')
 await panel.getByLabel('Inicio de vigencia',{exact:true}).fill(new Date(Date.now()-60000).toISOString().slice(0,19))
 await panel.getByLabel('Motivo del cambio',{exact:true}).fill('B2 browser explicit deny')
 await panel.getByRole('button',{name:'Guardar cambio de acceso'}).click()
 await expect(page.getByRole('status').filter({hasText:'Permisos actualizados.'})).toBeVisible()
 await checkTarget();await expect(panel.getByText('El usuario no tiene este permiso en el ámbito consultado.')).toBeVisible()
 await panel.getByLabel('Tipo de recurso a comprobar',{exact:true}).fill('documents')
 await panel.getByLabel('Recurso a comprobar',{exact:true}).fill(fixture.document)
 await panel.getByRole('button',{name:'Comprobar permiso en servidor'}).click()
 await expect(panel.getByText('Permitido por el servidor.',{exact:true})).toBeVisible()
 await page.screenshot({path:'artifacts/b2-access/manage-access.png'})
})
