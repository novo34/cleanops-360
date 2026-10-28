import ts from 'typescript'
import { messageParameters } from '../lib/i18n/parameters.ts'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const supportedLocales = ['de', 'es', 'en', 'it', 'pt', 'sq']
// Scope is the entire new CRM UI; historical demo/AuthPanel/B2 debt is documented.
/** Discover CRM roots plus their transitive local imports/re-exports (including
 * shared components with arbitrary names). No hardcoded component exclusion list. */
export function discoverCrmUi(root) {
  const pending = [], seen = new Set(), ui = []
  function walk(directory) {
    if (!existsSync(directory)) return
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name)
      if (item.isDirectory()) walk(path)
      else if (/\.tsx$/.test(item.name)) pending.push(path)
    }
  }
  walk(resolve(root, 'app/crm')); walk(resolve(root, 'components/crm'))
  for (const item of readdirSync(resolve(root, 'components'), { withFileTypes: true })) if (item.isFile() && /^crm.*\.tsx$/.test(item.name)) pending.push(resolve(root, 'components', item.name))
  while (pending.length) {
    const file = pending.pop()
    if (seen.has(file)) continue
    seen.add(file)
    if (file.endsWith('.tsx')) ui.push(relative(root, file))
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    function visit(node) {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null
      if (specifier && ts.isStringLiteral(specifier) && /^(\.|@\/)/.test(specifier.text)) {
        const base = specifier.text.startsWith('@/') ? resolve(root, specifier.text.slice(2)) : resolve(dirname(file), specifier.text)
        const target = [base, base+'.tsx', base+'.ts', resolve(base, 'index.tsx'), resolve(base, 'index.ts')].find(path => /\.tsx?$/.test(path) && existsSync(path))
        if (target && !relative(root, target).startsWith('..')) pending.push(target)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return ui.sort()
}
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
    if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer)
    ts.forEachChild(node, collect)
  }
  collect(source)
  function literalText(node, seen = new Set()) {
    if (ts.isIdentifier(node) && declarations.has(node.text) && !seen.has(node.text)) { seen.add(node.text); literalText(declarations.get(node.text), seen); return }
    if (ts.isCallExpression(node)) {
      // t() is the typed catalog channel; regional formatting operates on data.
      if (ts.isIdentifier(node.expression) && ['t', 'formatTimestamp'].includes(node.expression.text)) return
      literalText(node.expression, seen)
      for (const argument of node.arguments) literalText(argument, new Set(seen))
      return
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
      if (!node.body) return
      if (!ts.isBlock(node.body)) { literalText(node.body, seen); return }
      const returns = part => {
        if (ts.isReturnStatement(part) && part.expression) literalText(part.expression, new Set(seen))
        else if (!ts.isFunctionLike(part)) ts.forEachChild(part, returns)
      }
      ts.forEachChild(node.body, returns)
      return
    }
    if (ts.isParenthesizedExpression(node)) { literalText(node.expression, seen); return }
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
  report.uiFiles = discoverCrmUi(root)
  for (const file of report.uiFiles) validateUi(readFileSync(resolve(root, file), 'utf8'), file, new Set(report.keys))
  return report
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify({ status: 'PASS', ...((report) => ({ messages: report.messages, locales: report.locales }))(checkI18n()) }) + '\n') }
  catch (error) { process.stderr.write(String(error) + '\n'); process.exitCode = 1 }
}
