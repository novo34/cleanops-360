'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createTranslator, isLocale, locales, languageNames, type Locale, type MessageKey } from '../lib/i18n'
import { formatTimestamp } from '../lib/i18n/resolve'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { operations, valid } from '../lib/b1/contracts'
import { contactRoles, type Contact, type ContactFields, type CrmCompany, type CrmPage, type CompanyFields, type ContactRole } from '../lib/crm/model'
import { CompanyRow } from './company-row'

const errorKeys: Record<number, MessageKey> = { 401: 'crm.errorAuth', 403: 'crm.errorDenied', 404: 'crm.errorNotFound', 409: 'crm.errorConflict', 422: 'crm.errorValidation', 429: 'crm.errorRate', 503: 'crm.errorUnavailable' }
const roleKeys: Record<ContactRole, MessageKey> = { BAULEITER: 'crm.roleBauleiter', PROJEKTLEITER: 'crm.roleProjektleiter', FACILITY_MANAGER: 'crm.roleFacility', OBJEKTLEITER: 'crm.roleObjektleiter', EINKAUF: 'crm.roleEinkauf', BAUMANAGEMENT: 'crm.roleBaumanagement', ADMINISTRATION: 'crm.roleAdministration', MANAGEMENT: 'crm.roleManagement' }
const relationKeys: Record<CompanyFields['relation'], MessageKey> = { PROSPECT: 'crm.prospect', CUSTOMER: 'crm.customer' }
class CrmError extends Error { constructor(readonly status: number) { super('CRM_REQUEST_FAILED') } }
function errorKey(failure: unknown): MessageKey { return failure instanceof CrmError ? errorKeys[failure.status] ?? 'crm.errorUnknown' : 'crm.errorUnavailable' }
async function request<T>(operation: string, query: Record<string, string> = {}, body?: object, key?: string, signal?: AbortSignal): Promise<T> {
  const op = operations.find(o => o.operationId === operation)!
  const csrf = document.cookie.split('; ').find(c => c.startsWith('__Host-cleanops_csrf='))?.split('=')[1]
  const response = await fetch(op.path + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''), {
    method: op.method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '', 'Idempotency-Key': key! } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new CrmError(response.status)
  if (!response.headers.get('content-type')?.startsWith('application/json')) throw new CrmError(503)
  const result: unknown = await response.json()
  if (!valid(op.responses['200'].content['application/json'].schema, result)) throw new CrmError(503)
  return (result as { data: T }).data
}
export function CrmWorkspace({ clientsOnly, locale, formatLocale }: { clientsOnly: boolean; locale: Locale; formatLocale: string }) {
  const t = createTranslator(locale), router = useRouter()
  const date = (value: string) => formatTimestamp(value, formatLocale, 'UTC')
  const href = (view: string) => '/crm/' + view + '?' + new URLSearchParams({ lang: locale, format: formatLocale })
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [after, setAfter] = useState<string | null>(null)
  const [page, setPage] = useState<CrmPage | null>(null), [detail, setDetail] = useState<CrmCompany | null>(null)
  const [busy, setBusy] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState<MessageKey | ''>(''), [notice, setNotice] = useState<MessageKey | ''>('')
  const [revision, setRevision] = useState(0), [editor, setEditor] = useState<'company' | 'contact' | null>(null), [contact, setContact] = useState<Contact | null>(null)
  const pending = useRef<{ bytes: string; key: string } | null>(null)
  const detailRequest = useRef<AbortController | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return
      setBusy(true); setError(''); setPage(null)
      return request<CrmPage>('listCrmCompanies', { search: query, ...(clientsOnly ? { clients_only: 'true' } : {}), ...(after ? { after } : {}) }, undefined, undefined, controller.signal)
    })
      .then(value => { if (!controller.signal.aborted && value) setPage(value) })
      .catch(failure => { if (!controller.signal.aborted) setError(errorKey(failure)) })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [query, clientsOnly, after, revision])
  useEffect(() => () => detailRequest.current?.abort(), [])
  async function open(id: string) {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller
    setBusy(true); setDetail(null); setEditor(null); setError('')
    try { const value = await request<CrmCompany>('getCrmCompany', { company_id: id }, undefined, undefined, controller.signal); if (!controller.signal.aborted) { setDetail(value); heading.current?.focus() } }
    catch (failure) { if (!controller.signal.aborted) setError(errorKey(failure)) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  async function save(fields: CompanyFields | ContactFields, reason: string) {
    if (saving) return
    const body = editor === 'company' ? detail ? { operation: 'EDIT_COMPANY', company_id: detail.id, expected_version: detail.version, reason, company: fields } : { operation: 'CREATE_COMPANY', company: fields }
      : { operation: contact ? 'EDIT_CONTACT' : 'CREATE_CONTACT', company_id: detail!.id, expected_version: detail!.version, reason, ...(contact ? { contact_id: contact.id } : {}), contact: fields }
    const op = operations.find(o => o.operationId === 'changeCrmRecord')!
    if (!valid(op.requestBody!.content['application/json'].schema, body)) { setError('crm.errorValidation'); return }
    const bytes = JSON.stringify(body)
    if (pending.current?.bytes !== bytes) pending.current = { bytes, key: crypto.randomUUID() }
    setSaving(true); setError(''); setNotice('')
    try {
      const result = await request<{ id: string }>('changeCrmRecord', {}, body, pending.current.key)
      pending.current = null; setEditor(null); setNotice('crm.saved'); setRevision(n => n + 1); await open(result.id)
    } catch (failure) { setError(failure instanceof CrmError ? errorKey(failure) : 'crm.errorUncertain') }
    finally { setSaving(false) }
  }
  return <div className="demo-workspace crm-workspace" lang={locale}><a className="demo-skip" href="#crm-main">{t('common.skip')}</a><nav aria-label={t('crm.navigation')}><Link href={href('empresas')} aria-current={!clientsOnly ? 'page' : undefined}>{t('crm.companies')}</Link><Link href={href('clientes')} aria-current={clientsOnly ? 'page' : undefined}>{t('crm.clients')}</Link><Link href="/login">{t('crm.access')}</Link><label>{t('common.language')}<select value={locale} onChange={event => { if (isLocale(event.target.value)) router.replace('/crm/' + (clientsOnly ? 'clientes' : 'empresas') + '?' + new URLSearchParams({ lang: event.target.value, format: formatLocale })) }}>{locales.map(language => <option key={language} value={language} lang={language}>{languageNames[language]}</option>)}</select></label></nav>
    <main id="crm-main" className="demo-main"><div className="demo-page-heading"><div><span className="demo-eyebrow">CLEANOPS 360</span><h1 ref={heading} tabIndex={-1}>{t(clientsOnly ? 'crm.clients' : 'crm.companies')}</h1><p>{t('crm.tagline')}</p></div><button className="demo-button demo-primary" disabled={busy || !page || saving} onClick={() => { setDetail(null); setEditor('company'); setError('') }}>{t('crm.newCompany')}</button></div>
      {busy && <p role="status">{t('crm.loading')}</p>}{error && <p role="alert" className="crm-message">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
      {!editor && <form role="search" onSubmit={event => { event.preventDefault(); setQuery(search); setAfter(null); setDetail(null); setRevision(n => n + 1) }}><label>{t('crm.searchLabel')}<input type="search" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} /></label><button className="demo-button" disabled={saving}>{t('common.search')}</button></form>}
      {!busy && !page && !editor && <button className="demo-button" onClick={() => setRevision(n => n + 1)}>{t('crm.retry')}</button>}
      {editor ? <RecordForm key={editor + (contact?.id ?? '') + (detail?.id ?? '')} locale={locale} kind={editor} company={detail} contact={contact} saving={saving} onSave={save} onCancel={() => { if (!saving) { setEditor(null); setError('') } }} /> : detail ? <section className="demo-card"><div className="demo-directory-heading"><h2>{detail.name}</h2><button className="demo-button" onClick={() => setDetail(null)}>{t('crm.back')}</button></div><p>{detail.city} · {detail.sector} · {t(relationKeys[detail.relation])}</p><div className="crm-actions"><button className="demo-button" disabled={!detail.can_edit} onClick={() => setEditor('company')}>{t('crm.editCompany')}</button><button className="demo-button" disabled={!detail.can_edit} onClick={() => { setContact(null); setEditor('contact') }}>{t('crm.addContact')}</button><button className="demo-button" onClick={() => void open(detail.id)}>{t('crm.reload')}</button></div><h3>{t('crm.contacts')}</h3>{detail.contacts.length === 0 && <p>{t('crm.noContacts')}</p>}{detail.contacts.map(item => <article key={item.id}><h4>{item.name}</h4><p>{item.email} · {item.roles.map(role => t(roleKeys[role])).join(', ')}</p><p>{item.do_not_contact && item.do_not_contact_at ? t('crm.suppressedAt', { at: date(item.do_not_contact_at) }) : t('crm.noSuppression')}</p><dl><dt>{t('crm.source')}</dt><dd>{item.data_source}</dd><dt>{t('crm.sourceUrl')}</dt><dd>{item.source_url ?? t('common.notRecorded')}</dd><dt>{t('crm.firstSeen')}</dt><dd>{date(item.first_seen_at)}</dd><dt>{t('crm.lastVerified')}</dt><dd>{item.last_verified_at ? date(item.last_verified_at) : t('common.pending')}</dd><dt>{t('crm.basis')}</dt><dd>{item.communication_basis ?? t('common.notRecorded')}</dd><dt>{t('crm.privacy')}</dt><dd>{item.privacy_request_status ?? t('common.notRecorded')}</dd><dt>{t('crm.retention')}</dt><dd>{item.retention_review_at ? date(item.retention_review_at) : t('common.pending')}</dd></dl><button className="demo-button" disabled={!detail.can_edit} onClick={() => { setContact(item); setEditor('contact') }}>{t('crm.editNamedContact', { name: item.name })}</button></article>)}</section> : !busy && page && <section className="demo-card demo-directory"><div className="demo-directory-heading"><h2>{t('crm.directory')}</h2></div>{page.items.length ? <div className="demo-company-list">{page.items.map(item => <CompanyRow key={item.id} {...item} relation={t(relationKeys[item.relation])} contact={item.contact_name ?? t('crm.noContacts')} role={t('crm.contactCount', { count: item.contact_count })} onOpen={() => void open(item.id)} />)}</div> : <p role="status">{t('crm.empty')}</p>}{page.next_after && <button className="demo-button" onClick={() => setAfter(page.next_after)}>{t('crm.next')}</button>}{after && <button className="demo-button" onClick={() => setAfter(null)}>{t('crm.first')}</button>}</section>}
    </main></div>
}
export function RecordForm({ locale, kind, company, contact, saving, onSave, onCancel }: { locale: Locale; kind: 'company' | 'contact'; company: CrmCompany | null; contact: Contact | null; saving: boolean; onSave: (fields: CompanyFields | ContactFields, reason: string) => Promise<void>; onCancel: () => void }) {
  const t = createTranslator(locale)
  const [validation, setValidation] = useState<MessageKey | ''>(''), [invalidField, setInvalidField] = useState('')
  const fieldError = (name: string) => ({ 'aria-invalid': validation && invalidField === name ? true : undefined, 'aria-describedby': validation && invalidField === name ? 'crm-form-validation' : undefined })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidation(''); setInvalidField('')
    const form = event.currentTarget
    for (const field of Array.from(form.elements)) {
      if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) continue
      if (field.disabled) continue
      let key: MessageKey | null = null
      if (field.required && !field.value.trim()) key = 'crm.validationRequired'
      else if (field instanceof HTMLInputElement) {
        if (field.validity.tooLong) key = 'crm.validationLength'
        else if (field.type === 'email' && field.validity.typeMismatch) key = 'crm.validationEmail'
        else if (field.type === 'url' && field.value && (field.validity.typeMismatch || !/^https:\/\//.test(field.value))) key = 'crm.validationUrl'
        else if (field.type === 'datetime-local' && (field.validity.badInput || field.value && !Number.isFinite(Date.parse(field.value + 'Z')))) key = 'crm.validationDate'
        else if (!field.validity.valid) key = 'crm.errorValidation'
      }
      if (key) { setValidation(key); setInvalidField(field.name); field.focus(); return }
    }
    const data = new FormData(form)
    if (kind === 'contact' && data.getAll('roles').length === 0) {
      setValidation('crm.roles'); setInvalidField('roles'); form.querySelector<HTMLInputElement>('[name="roles"]')?.focus(); return
    }
    const text = (name: string) => String(data.get(name) ?? '').trim()
    const timestamp = (name: string) => text(name) ? new Date(text(name) + 'Z').toISOString() : null
    const fields = kind === 'company' ? { name: text('name'), city: text('city'), sector: text('sector'), relation: text('relation') as CompanyFields['relation'] } : {
      name: text('name'), email: text('email'), roles: data.getAll('roles').map(String) as ContactRole[], data_source: text('data_source'), source_url: text('source_url') || null,
      first_seen_at: timestamp('first_seen_at')!, last_verified_at: timestamp('last_verified_at'), communication_basis: text('communication_basis') || null,
      do_not_contact: contact?.do_not_contact === true || data.has('do_not_contact'), privacy_request_status: text('privacy_request_status') || null, retention_review_at: timestamp('retention_review_at'),
    }
    void onSave(fields, text('reason'))
  }
  const dateValue = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 23) : ''
  return <form className="demo-card" noValidate onSubmit={submit}><h2>{t(kind === 'company' ? company ? 'crm.editCompany' : 'crm.newCompany' : contact ? 'crm.editContact' : 'crm.newContact')}</h2>{validation && <p role="alert" id="crm-form-validation">{t(validation)}</p>}<fieldset disabled={saving}><legend>{t(kind === 'company' ? 'crm.companyData' : 'crm.contactData')}</legend><label>{t('crm.name')}<input {...fieldError('name')} name="name" required maxLength={160} defaultValue={kind === 'company' ? company?.name : contact?.name} /></label>{kind === 'company' ? <><label>{t('crm.city')}<input {...fieldError('city')} name="city" required maxLength={120} defaultValue={company?.city} /></label><label>{t('crm.sector')}<input {...fieldError('sector')} name="sector" required maxLength={120} defaultValue={company?.sector} /></label><label>{t('crm.relation')}<select name="relation" defaultValue={company?.relation ?? 'PROSPECT'}><option value="PROSPECT">{t('crm.prospect')}</option><option value="CUSTOMER">{t('crm.customer')}</option></select></label></> : <><label>{t('crm.email')}<input type="email" {...fieldError('email')} name="email" required maxLength={254} defaultValue={contact?.email} /></label><fieldset><legend>{t('crm.roles')}</legend>{contactRoles.map(role => <label key={role}><input type="checkbox" {...fieldError('roles')} name="roles" value={role} defaultChecked={contact?.roles.includes(role)} />{t(roleKeys[role])}</label>)}</fieldset><label>{t('crm.source')}<input {...fieldError('data_source')} name="data_source" required maxLength={200} defaultValue={contact?.data_source} /></label><label>{t('crm.sourceUrl')}<input type="url" {...fieldError('source_url')} name="source_url" maxLength={2048} pattern="https://.*" defaultValue={contact?.source_url ?? ''} /></label><label>{t('crm.firstSeen')}<input type="datetime-local" step="0.001" {...fieldError('first_seen_at')} name="first_seen_at" required defaultValue={dateValue(contact?.first_seen_at)} /></label><label>{t('crm.lastVerified')}<input type="datetime-local" step="0.001" {...fieldError('last_verified_at')} name="last_verified_at" defaultValue={dateValue(contact?.last_verified_at)} /></label><label>{t('crm.basis')}<input {...fieldError('communication_basis')} name="communication_basis" maxLength={500} defaultValue={contact?.communication_basis ?? ''} /></label><label><input type="checkbox" {...fieldError('do_not_contact')} name="do_not_contact" disabled={contact?.do_not_contact} defaultChecked={contact?.do_not_contact} />{t('crm.doNotContact')}</label>{contact?.do_not_contact && <p>{t('crm.suppressionRetained')}</p>}<label>{t('crm.privacy')}<input {...fieldError('privacy_request_status')} name="privacy_request_status" maxLength={120} defaultValue={contact?.privacy_request_status ?? ''} /></label><label>{t('crm.retention')}<input type="datetime-local" step="0.001" {...fieldError('retention_review_at')} name="retention_review_at" defaultValue={dateValue(contact?.retention_review_at)} /></label></>}{company && <label>{t('crm.reason')}<input {...fieldError('reason')} name="reason" required maxLength={500} /></label>}</fieldset><div className="crm-actions"><button className="demo-button demo-primary" disabled={saving}>{t(saving ? 'crm.saving' : 'common.save')}</button><button type="button" className="demo-button" disabled={saving} onClick={onCancel}>{t('common.cancel')}</button></div></form>
}
