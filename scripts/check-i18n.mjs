import ts from 'typescript'
import { messageParameters } from '../lib/i18n/index.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const supportedLocales = ['de', 'es', 'en', 'it', 'pt', 'sq']
// Scope is the entire new CRM UI; historical demo/AuthPanel/B2 debt is documented.
export const crmUiFiles = ['components/crm-workspace.tsx', 'components/company-row.tsx', 'app/crm/[view]/page.tsx']
const properNames = new Set(['CLEANOPS 360', 'CleanOps 360', 'CleanOps 360 · CRM'])
const variablesFor = messageParameters
/** Validate raw object keys BEFORE JSON.parse can overwrite duplicate properties. */
export function parseCatalog(raw, label = 'catalog') {
  const source = ts.createSourceFile(label + '.json', raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSON)
  const errors = []
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set()
      for (const property of node.properties) {
        const key = property.name && (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name)) ? property.name.text : null
        if (key !== null && seen.has(key)) errors.push(`${label}: duplicate key ${key}`)
        seen.add(key)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (errors.length) throw new Error(errors.join('\n'))
  return JSON.parse(raw)
}
function flatten(catalog, label) {
  const result = new Map()
  for (const [namespace, entries] of Object.entries(catalog)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(namespace) || !entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error(`${label}: invalid namespace`)
    for (const [key, message] of Object.entries(entries)) {
      if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) throw new Error(`${label}: unstable message key`)
      result.set(`${namespace}.${key}`, message)
    }
  }
  return result
}
function signature(message, key, label) {
  const plural = typeof message !== 'string'
  if (plural && (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).sort().join(',') !== 'one,other')) throw new Error(`${label}: invalid plural ${key}`)
  const forms = plural ? Object.values(message) : [message]
  const signatures = forms.map(text => {
    if (typeof text !== 'string' || !text.trim()) throw new Error(`${label}: empty translation ${key}`)
    if (/[<>]/.test(text)) throw new Error(`${label}: markup is forbidden ${key}`)
    const placeholders = [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match => match[1])
    if (/[{}]/.test(text.replace(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g, ''))) throw new Error(`${label}: invalid interpolation ${key}`)
    return [...new Set(placeholders)].sort().join(',')
  })
  if (new Set(signatures).size !== 1 || signatures[0] !== Object.keys(variablesFor[key] ?? {}).sort().join(',')) throw new Error(`${label}: incompatible variables ${key}`)
  if (plural && variablesFor[key]?.count !== 'number') throw new Error(`${label}: plural count must be numeric ${key}`)
  return `${plural}:${signatures[0]}`
}
export function validateCatalogs(rawByLocale) {
  const maps = new Map(supportedLocales.map(locale => {
    if (typeof rawByLocale[locale] !== 'string') throw new Error(`${locale}: missing language`)
    return [locale, flatten(parseCatalog(rawByLocale[locale], locale), locale)]
  }))
  const reference = maps.get('en')
  const keys = [...reference.keys()].sort()
  for (const [locale, entries] of maps) {
    if ([...entries.keys()].sort().join(',') !== keys.join(',')) throw new Error(`${locale}: missing or unknown keys`)
    for (const [key, message] of entries) if (signature(message, key, locale) !== signature(reference.get(key), key, 'en')) throw new Error(`${locale}: incompatible message/plural ${key}`)
  }
  return { keys, locales: supportedLocales, messages: keys.length }
}
export function validateUi(sourceText, file, knownKeys) {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const errors = []
  const allowed = value => !/[\p{L}\p{N}]/u.test(value) || properNames.has(value)
  const declarations = new Map()
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer)
    ts.forEachChild(node, collect)
  }
  collect(source)
  function literalText(node, seen = new Set()) {
    if (ts.isIdentifier(node) && declarations.has(node.text) && !seen.has(node.text)) { seen.add(node.text); literalText(declarations.get(node.text), seen); return }
    if (ts.isElementAccessExpression(node)) { literalText(node.expression, seen); return }
    if (ts.isObjectLiteralExpression(node)) { for (const property of node.properties) if (ts.isPropertyAssignment(property)) literalText(property.initializer, seen); return }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'message') errors.push(`${file}: uncatalogued error message`)
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { if (!allowed(node.text)) errors.push(`${file}: uncatalogued UI text ${node.text}`) }
    else if (ts.isConditionalExpression(node)) { literalText(node.whenTrue); literalText(node.whenFalse) }
    else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) { literalText(node.left); literalText(node.right) }
    else if (ts.isTemplateExpression(node)) { if (!allowed(node.head.text) || node.templateSpans.some(span => !allowed(span.literal.text))) errors.push(`${file}: uncatalogued UI template`) }
  }
  function visit(node) {
    if (ts.isJsxText(node) && !allowed(node.text.trim())) errors.push(`${file}: uncatalogued JSX text ${node.text.trim()}`)
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) literalText(node.expression)
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'dangerouslySetInnerHTML') errors.push(`${file}: unsafe HTML translation channel`)
    if (ts.isJsxAttribute(node) && /^(aria-label|title|placeholder|alt)$/.test(node.name.getText(source)) && node.initializer) {
      if (ts.isStringLiteral(node.initializer) && !allowed(node.initializer.text)) errors.push(`${file}: uncatalogued accessibility text`)
      if (ts.isJsxExpression(node.initializer) && node.initializer.expression) literalText(node.initializer.expression)
    }
    if (ts.isStringLiteral(node)) {
      // Also catches stale literal message maps outside JSX and missing key references.
      if (/^(common|crm)\.[a-zA-Z]/.test(node.text) && !knownKeys.has(node.text)) errors.push(`${file}: unknown key ${node.text}`)
      const structural = ts.isJsxAttribute(node.parent) && node.parent.name.getText(source) === 'className' || node.text === 'use client' && ts.isExpressionStatement(node.parent)
      if (!structural && /\p{L}[^\n]*\s+[^\n]*\p{L}/u.test(node.text) && !allowed(node.text)) errors.push(`${file}: uncatalogued string ${node.text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (errors.length) throw new Error([...new Set(errors)].join('\n'))
}
export function checkI18n(root = resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  const raw = Object.fromEntries(supportedLocales.map(locale => [locale, readFileSync(resolve(root, `lib/i18n/catalogs/${locale}.json`), 'utf8')]))
  const report = validateCatalogs(raw)
  for (const file of crmUiFiles) validateUi(readFileSync(resolve(root, file), 'utf8'), file, new Set(report.keys))
  return report
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify({ status: 'PASS', ...((report) => ({ messages: report.messages, locales: report.locales }))(checkI18n()) }) + '\n') }
  catch (error) { process.stderr.write(String(error) + '\n'); process.exitCode = 1 }
}
