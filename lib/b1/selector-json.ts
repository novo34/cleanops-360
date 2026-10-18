import { AuthError } from './service.ts'

/** Native JSON grammar validation, then bounded lexical duplicate-key detection.
 * Used for the approved selector and additive EMAIL inputs; other V4 inputs remain unchanged.
 * Decoded keys are compared, so Unicode escapes cannot bypass duplicate rejection.
 * Body byte limit is enforced by the existing HTTP reader before this function. */
export function parseSelectorJson(text: string): unknown {
  const invalid = () => new AuthError(400, 'INVALID_JSON')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw invalid() }
  const stack: ({ kind: 'object'; keys: Set<string>; key: boolean } | { kind: 'array' })[] = []
  for (const token of text.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]:,]/g)) {
    const value = token[0], top = stack.at(-1)
    if (value === '{') stack.push({ kind: 'object', keys: new Set(), key: true })
    else if (value === '[') stack.push({ kind: 'array' })
    else if (value === '}' || value === ']') stack.pop()
    else if (value === ',' && top?.kind === 'object') top.key = true
    else if (value.startsWith('"') && top?.kind === 'object' && top.key) {
      const key = JSON.parse(value) as string
      if (top.keys.has(key)) throw invalid()
      top.keys.add(key); top.key = false
    }
  }
  return parsed
}
