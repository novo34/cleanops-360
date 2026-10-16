import { contract, type Schema } from '../../lib/b1/contracts.ts'
export const id = '11111111-1111-4111-8111-111111111111'
export const tenantB = '22222222-2222-4222-8222-222222222222'
export function sample(schema: Schema): unknown {
  if (schema.$ref) return sample(contract.components.schemas[schema.$ref.split('/').at(-1)!])
  if (Object.hasOwn(schema, 'const')) return schema.const
  if (schema.enum) return schema.enum[0]
  if (schema.oneOf) return sample(schema.oneOf[0])
  if (schema.type === 'object') return Object.fromEntries((schema.required ?? []).map(k => [k, sample(schema.properties![k])]))
  if (schema.type === 'array') return Array.from({ length: schema.minItems ?? 0 }, (_, i) => {
    const item = sample(schema.items!)
    return schema.uniqueItems && i && typeof item === 'string' ? item.slice(0, -1) + 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[i] : item
  })
  if (schema.type === 'null') return null
  if (schema.type === 'integer') return schema.minimum ?? 0
  if (schema.type === 'boolean') return false
  if (schema.format === 'uuid') return id
  if (schema.format === 'date-time') return '2026-10-16T12:00:00Z'
  if (schema.format === 'email') return 'synthetic@example.test'
  if (schema.pattern?.includes('A-Z2-7')) return 'A'.repeat(26)
  if (schema.pattern?.includes('0-9')) return '1'.repeat(schema.minLength ?? 6)
  return 'a'.repeat(schema.minLength ?? 1)
}
