import test from 'node:test'
import { URL } from 'node:url'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator, locales, messageParameters } from '../lib/i18n/index.ts'
import { resolveLanguage, resolveFormatLocale, formatTimestamp } from '../lib/i18n/resolve.ts'
import { checkI18n, discoverCrmUi, parseCatalog, validateCatalogs, validateUi } from '../scripts/check-i18n.mjs'
const raw = () => Object.fromEntries(locales.map(locale => [locale, readFileSync(new URL(`../lib/i18n/catalogs/${locale}.json`, import.meta.url), 'utf8')]))
const mutate = change => { const data = raw(); const es = JSON.parse(data.es); change(es); data.es = JSON.stringify(es); return data }
test('six UI languages have exactly the same 76 nonempty messages, valid references and no uncatalogued CRM copy', () => {
  const report = checkI18n()
  assert.equal(report.messages, 76)
  assert.deepEqual(report.locales, ['de', 'es', 'en', 'it', 'pt', 'sq'])
  for (const locale of locales) for (const key of report.keys) {
    const params = Object.fromEntries(Object.entries(messageParameters[key] ?? {}).map(([name, type]) => [name, type === 'number' ? 2 : 'Synthetic <b>customer</b>']))
    assert.ok(createTranslator(locale)(key, ...(Object.keys(params).length ? [params] : [])).trim())
  }
})
test('missing language, missing keys and empty translations fail; another language cannot hide omissions', () => {
  const data=raw(); delete data.sq; assert.throws(() => validateCatalogs(data), /missing language/)
  assert.throws(() => validateCatalogs(mutate(es => { delete es.crm.newCompany })), /missing or unknown keys/)
  assert.throws(() => validateCatalogs(mutate(es => { es.crm.newCompany='   ' })), /empty translation/)
})
test('raw duplicate keys are rejected before JSON.parse can overwrite either namespace or message', () => {
  for (const value of ['{"crm":{"name":"A","name":"B"}}', '{"crm":{"name":"A"},"crm":{"name":"B"}}', '{"crm":{"na\\u006de":"A","name":"B"}}']) assert.throws(() => parseCatalog(value), /duplicate key/)
})
test('incompatible placeholders, invalid plural forms and nonnumeric plural declarations fail', () => {
  assert.throws(() => validateCatalogs(mutate(es => { es.crm.contactCount.one='{total} contacto' })), /incompatible variables/)
  assert.throws(() => validateCatalogs(mutate(es => { delete es.crm.contactCount.other })), /invalid plural/)
  assert.throws(() => validateCatalogs(mutate(es => { es.crm.contactCount='{count} contactos' })), /incompatible message\/plural/)
  assert.throws(() => validateCatalogs(mutate(es => { es.crm.newCompany={one:'Empresa',other:'Empresas'} })), /plural count/)
  assert.throws(() => validateCatalogs(mutate(es => { es.crm.editNamedContact='{name' })), /invalid interpolation/)
})
test('checker rejects unknown key references and catalog bypasses including aria, conditional copy and message maps', () => {
  const keys=new Set(checkI18n().keys)
  for (const text of ["const x=t('crm.missing')", '<button>Save</button>', '<input aria-label="Search"/>', '<input title={"Find"}/>', 'const label="Oops"; <p>{label}</p>', 'const messages={503:"Oops"}; <p>{messages[status]}</p>', '<p>{ok ? "Ready" : "Failed"}</p>', 'const messages={503:"Service is unavailable"}', '<p>{count + " contacts"}</p>']) assert.throws(() => validateUi(text, 'test.tsx', keys), /unknown key|uncatalogued/)
  validateUi('<h1>CleanOps 360</h1><p>{contact.name}</p><p>{t("crm.companies")}</p>', 'test.tsx', keys)
})
test('language negotiation has no implicit global fallback and explicit unsupported choices are not replaced', () => {
  assert.equal(resolveLanguage('sq', 'de-CH'), 'sq')
  assert.equal(resolveLanguage(undefined, 'fr-CH,de-CH;q=0.8,en;q=0.5'), 'de')
  assert.equal(resolveLanguage(undefined, 'pt-BR;q=0.9,es;q=0.4'), 'pt')
  assert.equal(resolveLanguage(undefined, 'en;q=0,de;q=0.3'), 'de')
  for (const explicit of ['fr', 'unknown', '', ['es','de']]) assert.equal(resolveLanguage(explicit, 'es'), null)
  for (const header of [null, 'fr', '*', 'de;q=invalid', 'de;q=0']) assert.equal(resolveLanguage(undefined, header), null)
})
test('plurals and safe interpolation preserve customer input without interpreting HTML or recursively translating it', () => {
  const name='<img src=x onerror=alert(1)> {name} María'
  for (const locale of locales) {
    const t=createTranslator(locale)
    assert.notEqual(t('crm.contactCount', {count:1}), t('crm.contactCount', {count:2}))
    const message=t('crm.editNamedContact', {name})
    assert.ok(message.includes(name))
    const html=renderToStaticMarkup(createElement('p', null, message))
    assert.equal(html.includes('<img'),false)
    assert.ok(html.includes('&lt;img'))
    assert.throws(()=>t('crm.contactCount',{count:'2'}),/I18N_INVALID_PARAMETER_TYPE/)
    assert.throws(()=>t('crm.editNamedContact',{name:2}),/I18N_INVALID_PARAMETER_TYPE/)
    assert.throws(()=>t('crm.contactCount',{count:NaN}),/I18N_INVALID_COUNT/)
    assert.throws(()=>t('crm.companies',{extra:'x'}),/I18N_INVALID_PARAMETERS/)
    assert.throws(()=>t('crm.doesNotExist'),/I18N_MISSING_MESSAGE/)
  }
})
test('regional date format and timezone are explicit and independent from UI translation or currency', () => {
  assert.equal(resolveFormatLocale('de-CH', 'sq'), 'de-CH')
  assert.equal(resolveFormatLocale('en-US', 'de'), 'en-US')
  const value='2026-01-20T12:00:00Z'
  assert.notEqual(formatTimestamp(value,'de-CH','UTC'),formatTimestamp(value,'de-CH','Europe/Madrid'))
  assert.notEqual(formatTimestamp(value,'de-CH','UTC'),formatTimestamp(value,'en-US','UTC'))
  assert.equal(createTranslator('sq')('crm.companies'),'Kompanitë')
})

test('local render helpers cannot hide literal UI copy behind arrow functions, blocks, declarations or wrappers', () => {
  const keys=new Set(checkI18n().keys)
  for (const text of [
    'const label=()=>"Guardar"; <button>{label()}</button>',
    'const label=()=>{return "Guardar"}; <button>{label()}</button>',
    'function label(){return "Guardar"}; <button>{label()}</button>',
    'const raw=()=>"Guardar"; const label=()=>raw(); <button>{label()}</button>',
    'const label=(x)=>x; <button>{label("Guardar")}</button>',
  ]) assert.throws(()=>validateUi(text,'components/crm/new.tsx',keys),/uncatalogued/)
  validateUi('const label=()=>t("common.save"); <button>{label()}</button>', 'safe.tsx', keys)
  validateUi('const label=()=>customer.name; <button>{label()}</button><span>CleanOps 360</span>', 'safe.tsx', keys)
})


test('CRM inventory discovers new roots, nested components and arbitrarily named shared import consumers', () => {
  const root=mkdtempSync(join(tmpdir(),'crm-i18n-'))
  try {
    for (const directory of ['app/crm','components/crm/nested','components/shared']) mkdirSync(join(root,directory),{recursive:true})
    writeFileSync(join(root,'app/crm/page.tsx'),'import Widget from "../../components/shared/widget"; export default Widget')
    writeFileSync(join(root,'components/shared/widget.tsx'),'const label=()=>"Guardar"; export default ()=> <button>{label()}</button>')
    writeFileSync(join(root,'components/crm/nested/unlinked.tsx'),'<button>Guardar</button>')
    writeFileSync(join(root,'components/crm-new.tsx'),'<button>Guardar</button>')
    const files=discoverCrmUi(root)
    assert.deepEqual(files,['app/crm/page.tsx','components/crm-new.tsx','components/crm/nested/unlinked.tsx','components/shared/widget.tsx'])
    const keys=new Set(checkI18n().keys)
    for (const file of files.filter(file=>file!=='app/crm/page.tsx')) assert.throws(()=>validateUi(readFileSync(join(root,file),'utf8'),file,keys),/uncatalogued/)
  } finally { rmSync(root,{recursive:true,force:true}) }
})
