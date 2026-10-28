/** Single variable/type contract. No catalog imports: raw duplicate validation runs first. */
export const messageParameters = {
  'crm.contactCount': { count: 'number' },
  'crm.editNamedContact': { name: 'string' },
  'crm.suppressedAt': { at: 'string' },
} as const
export type MessageParameters = { [K in keyof typeof messageParameters]: {
  [P in keyof typeof messageParameters[K]]: typeof messageParameters[K][P] extends 'number' ? number : string
} }
