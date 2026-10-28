import { isLocale, type Locale } from './index.ts'

/** Presentation preference only, never identity, tenant, role or entitlement.
 * Explicit invalid/unsupported choices do not silently fall back to another UI language. */
export function resolveLanguage(explicit: unknown, acceptLanguage: string | null): Locale | null {
  if (explicit !== undefined) return isLocale(explicit) ? explicit : null
  const candidates = (acceptLanguage ?? '').slice(0, 2048).split(',').map((entry, index) => {
    const [tag, ...parts] = entry.trim().split(';')
    const quality = parts.length === 0 ? 1 : /^q=(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/.test(parts[0].trim()) ? Number(parts[0].trim().slice(2)) : 0
    return { locale: tag.toLowerCase().split('-')[0], quality, index }
  }).filter(candidate => candidate.quality > 0).sort((a, b) => b.quality - a.quality || a.index - b.index)
  return candidates.find(candidate => isLocale(candidate.locale))?.locale as Locale | undefined ?? null
}
/** Regional formatting is separate from UI language and from timezone/currency.
 * An explicit format locale is retained when the UI language changes. */
export function resolveFormatLocale(explicit: unknown, uiLocale: Locale): string {
  if (typeof explicit !== 'string' || explicit.length > 64) return uiLocale
  try {
    const locale = Intl.getCanonicalLocales(explicit)[0]
    return locale && Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0 ? locale : uiLocale
  } catch { return uiLocale }
}
export function formatTimestamp(value: string, regionalLocale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(regionalLocale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
}
