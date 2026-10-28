import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { CrmWorkspace } from '../../../components/crm-workspace'
import { languageNames, locales } from '../../../lib/i18n'
import { resolveLanguage, resolveFormatLocale } from '../../../lib/i18n/resolve'
import '../../demo/demo.css'
import '../../demo/themes.css'
import './crm.css'
export const dynamic = 'force-dynamic'
// Brand only; a localized document title is resolved below from the same server locale.
export const metadata = { title: 'CleanOps 360 · CRM', robots: { index: false, follow: false } }
export default async function CrmPage({ params, searchParams }: {
  params: Promise<{ view: string }>; searchParams: Promise<{ lang?: string | string[]; format?: string | string[] }>
}) {
  const { view } = await params
  if (view !== 'empresas' && view !== 'clientes') notFound()
  const query = await searchParams
  const locale = resolveLanguage(query.lang, (await headers()).get('accept-language'))
  // No global fallback decision: unsupported language leads to explicit selection.
  if (!locale) return <main className="demo-workspace crm-workspace"><h1>CleanOps 360</h1><nav>{locales.map(language => <Link key={language} href={`/crm/${view}?lang=${language}`} lang={language} hrefLang={language}>{languageNames[language]}</Link>)}</nav></main>
  return <CrmWorkspace key={view} clientsOnly={view === 'clientes'} locale={locale} formatLocale={resolveFormatLocale(query.format, locale)} />
}
