import canonicalSpecification from './openapi.json' with { type: 'json' }
import emailExtension from './email-http.json' with { type: 'json' }
import resetExtension from './reset-http.json' with { type: 'json' }
import trustedExtension from './trusted-http.json' with { type: 'json' }
import mfaAdminExtension from './mfa-admin-http.json' with { type: 'json' }
import accessExtension from './access-http.json' with { type: 'json' }
import recoveryExtension from './recovery-http.json' with { type: 'json' }
import usersExtension from '../b2/users-http.json' with { type: 'json' }
import b2AccessExtension from '../b2/access-http.json' with { type: 'json' }
// Additive E1 EMAIL endpoints; canonical V4 bytes and existing operations unchanged.
const specification = { ...canonicalSpecification, paths: { ...canonicalSpecification.paths, ...emailExtension.paths, ...recoveryExtension.paths, ...resetExtension.paths, ...trustedExtension.paths, ...accessExtension.paths, ...mfaAdminExtension.paths, ...usersExtension.paths, ...b2AccessExtension.paths },
  components: { ...canonicalSpecification.components, schemas: { ...canonicalSpecification.components.schemas, ...emailExtension.schemas, ...recoveryExtension.schemas, ...resetExtension.schemas, ...trustedExtension.schemas, ...accessExtension.schemas, ...mfaAdminExtension.schemas, ...usersExtension.schemas, ...b2AccessExtension.schemas } } }

export interface Schema {
  $ref?: string; type?: string; const?: unknown; enum?: unknown[]; properties?: Record<string, Schema>
  required?: string[]; additionalProperties?: boolean; oneOf?: Schema[]; allOf?: Schema[]
  if?: Schema; then?: Schema; else?: Schema; not?: Schema; items?: Schema
  minLength?: number; maxLength?: number; pattern?: string; format?: string
  minimum?: number; maximum?: number; minItems?: number; maxItems?: number; uniqueItems?: boolean
}
export interface Operation {
  operationId: string; parameters: { in: string; name: string; required?: boolean; schema: Schema }[]
  requestBody?: { content: { 'application/json': { schema: Schema } } }
  responses: Record<string, { content: { 'application/json': { schema: Schema } } }>
  'x-authentication-state': string; 'x-rule'?: string
}
export const contract = specification as unknown as {
  paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> }
}
export const operations = Object.entries(contract.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => ({ path, method: method.toUpperCase(), ...operation })))
export type OperationId = typeof operations[number]['operationId']
const own = (x: object, k: string) => Object.prototype.hasOwnProperty.call(x, k)
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b)
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}'
  return JSON.stringify(value)
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const formats: Record<string, (s: string) => boolean> = {
  uuid: s => uuid.test(s),
  email: s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(s),
  'date-time': s => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(s) && Number.isFinite(Date.parse(s)),
}
/** Validator for the closed V4 JSON Schema vocabulary; no coercion or field removal. */
export function valid(schema: Schema, value: unknown): boolean {
  if (schema.$ref) {
    const prefix = '#/components/schemas/'
    if (!schema.$ref.startsWith(prefix)) throw new Error('UNSUPPORTED_SCHEMA_REF')
    const target = contract.components.schemas[schema.$ref.slice(prefix.length)]
    if (!target) throw new Error('UNRESOLVED_SCHEMA_REF')
    return valid(target, value)
  }
  if (own(schema, 'const') && !equal(schema.const, value)) return false
  if (schema.enum && !schema.enum.some(e => equal(e, value))) return false
  if (schema.oneOf && schema.oneOf.filter(s => valid(s, value)).length !== 1) return false
  if (schema.allOf && !schema.allOf.every(s => valid(s, value))) return false
  if (schema.not && valid(schema.not, value)) return false
  if (schema.if && !valid(valid(schema.if, value) ? schema.then ?? {} : schema.else ?? {}, value)) return false
  if (schema.type === 'null' && value !== null) return false
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false
    const length = [...value].length
    if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity)) return false
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) return false
    if (schema.format && (!formats[schema.format] || !formats[schema.format](value))) return false
  }
  if (schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) return false
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) return false
    if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) return false
    if (schema.items && !value.every(v => valid(schema.items!, v))) return false
  }
  if (schema.type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) return false
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (schema.required?.some(k => !own(value, k))) return false
    const object = value as Record<string, unknown>
    if (schema.additionalProperties === false && Object.keys(object).some(k => !own(schema.properties ?? {}, k))) return false
    for (const [k, s] of Object.entries(schema.properties ?? {})) if (own(value, k) && !valid(s, object[k])) return false
  }
  return true
}
export function assertVocabulary(schema: Schema): void {
  const supported = new Set(['$ref','type','const','enum','properties','required','additionalProperties','oneOf','allOf','if','then','else','not','items','minLength','maxLength','pattern','format','minimum','maximum','minItems','maxItems','uniqueItems','writeOnly'])
  for (const key of Object.keys(schema)) if (!supported.has(key)) throw new Error('UNSUPPORTED_SCHEMA_KEYWORD:' + key)
  for (const child of Object.values(schema.properties ?? {})) assertVocabulary(child)
  for (const child of [...schema.oneOf ?? [], ...schema.allOf ?? [], ...[schema.if,schema.then,schema.else,schema.not,schema.items].filter(Boolean) as Schema[]]) assertVocabulary(child)
}
for (const s of Object.values(contract.components.schemas)) assertVocabulary(s)
