import { messageParameters, type MessageParameters } from './parameters.ts'
import en from './catalogs/en.json' with { type: 'json' }
import de from './catalogs/de.json' with { type: 'json' }
import es from './catalogs/es.json' with { type: 'json' }
import it from './catalogs/it.json' with { type: 'json' }
import pt from './catalogs/pt.json' with { type: 'json' }
import sq from './catalogs/sq.json' with { type: 'json' }

export const locales = ['de', 'es', 'en', 'it', 'pt', 'sq'] as const
export type Locale = typeof locales[number]
/** Autonyms are proper language names, never a fallback translation. */
export const languageNames: Record<Locale, string> = { de: 'Deutsch', es: 'Español', en: 'English', it: 'Italiano', pt: 'Português', sq: 'Shqip' }
export type MessageKey = { [N in keyof typeof en]: `${N}.${keyof typeof en[N] & string}` }[keyof typeof en]
export { messageParameters, type MessageParameters } from './parameters.ts'
type Arguments<K extends MessageKey> = K extends keyof MessageParameters ? [parameters: MessageParameters[K]] : []
export type Translator = <K extends MessageKey>(key: K, ...args: Arguments<K>) => string
const catalogs = { de, es, en, it, pt, sq }
export function isLocale(value: unknown): value is Locale { return typeof value === 'string' && locales.some(locale => locale === value) }

/** Restricted, versioned text syntax: {name}, plus one/other count messages.
 * React consumers render plain strings; never HTML, expressions or translation URLs.
 * Missing translations are errors. There is no cross-language fallback. */
export function createTranslator(locale: Locale): Translator {
  if (!isLocale(locale)) throw new Error('I18N_UNSUPPORTED_LOCALE')
  return <K extends MessageKey>(key: K, ...args: Arguments<K>): string => {
    const [namespace, name] = key.split('.')
    const catalog = catalogs[locale] as Record<string, Record<string, string | { one: string; other: string }>>
    const entry = catalog[namespace]?.[name]
    if (!entry) throw new Error('I18N_MISSING_MESSAGE')
    const parameters = (args[0] ?? {}) as Record<string, string | number>
    const expected = (messageParameters as Record<string, Record<string, string>>)[key] ?? {}
    if (Object.keys(expected).some(name => typeof parameters[name] !== expected[name])) throw new Error('I18N_INVALID_PARAMETER_TYPE')
    const plural = typeof entry !== 'string'
    if (plural && (typeof parameters.count !== 'number' || !Number.isFinite(parameters.count))) throw new Error('I18N_INVALID_COUNT')
    const text = plural ? new Intl.PluralRules(locale).select(parameters.count as number) === 'one' ? entry.one : entry.other : entry
    if (!text?.trim()) throw new Error('I18N_EMPTY_MESSAGE')
    const variables = [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match => match[1])
    if (Object.keys(parameters).sort().join(',') !== [...new Set(variables)].sort().join(',')) throw new Error('I18N_INVALID_PARAMETERS')
    return text.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_, variable: string) => {
      const value = parameters[variable]
      if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('I18N_INVALID_PARAMETER_TYPE')
      return typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : value
    })
  }
}
