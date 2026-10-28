import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RecordForm } from '../components/crm-workspace'
import { createTranslator, locales } from '../lib/i18n'
import { type CrmCompany, type Contact } from '../lib/crm/model'
const contact: Contact = { id: '11111111-1111-4111-8111-111111111111', name: 'María Cliente', email: 'client@example.invalid', roles: ['EINKAUF'], data_source: 'Dato original del cliente', source_url: null, first_seen_at: '2026-10-28T12:34:56.123Z', last_verified_at: null, communication_basis: 'Texto jurídico registrado', do_not_contact: true, can_suppress: false, do_not_contact_at: '2026-10-28T12:34:56.123Z', privacy_request_status: 'Dato libre', retention_review_at: null }
const company: CrmCompany = { id: contact.id, name: 'Empresa Original', city: 'Genève', sector: 'Oficinas', relation: 'CUSTOMER', version: '2', contacts: [contact], contacts_next_after: null, can_edit: true }
describe('CRM localized forms are real presentation components, without API or identity fixtures', () => {
  for (const locale of locales) it(`renders company/contact copy in ${locale} and preserves business codes and customer values`, () => {
    const t = createTranslator(locale)
    const render = (kind: 'company' | 'contact') => renderToStaticMarkup(createElement(RecordForm, { kind, locale, company, contact: kind === 'contact' ? contact : null, saving: false, onSave: async () => {}, onCancel: () => {} }))
    const companyHtml = render('company'), contactHtml = render('contact')
    expect(companyHtml).toContain(t('crm.editCompany'))
    expect(companyHtml).toContain('value="CUSTOMER"')
    expect(companyHtml).toContain(company.name)
    expect(contactHtml).toContain(t('crm.source'))
    expect(contactHtml).toContain(t('crm.doNotContact'))
    expect(contactHtml).toContain('value="EINKAUF"')
    for (const value of [contact.name, contact.email, contact.data_source, contact.communication_basis!]) expect(contactHtml).toContain(value)
    expect(contactHtml).toContain('2026-10-28T12:34:56.123')
    expect(contactHtml).toContain('noValidate=""')
  })
})
