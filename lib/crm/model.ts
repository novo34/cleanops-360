/** CRM company is a business record inside a server-resolved organization/tenant. */
export const contactRoles = ['Bauleiter', 'Projektleiter', 'Facility Manager', 'Objektleiter', 'Einkauf', 'Baumanagement', 'administración', 'dirección'] as const
export type CompanyFields = { name: string; city: string; sector: string; relation: 'Cliente' | 'Prospecto' }
export type ContactFields = {
  name: string; email: string; roles: string[]; data_source: string; source_url: string | null
  first_seen_at: string; last_verified_at: string | null; communication_basis: string | null
  do_not_contact: boolean; privacy_request_status: string | null; retention_review_at: string | null
}
export type Contact = ContactFields & { id: string; do_not_contact_at: string | null }
export type CrmCompany = CompanyFields & { id: string; version: string; contacts: Contact[]; can_edit: boolean }
export type CrmPage = { items: CrmCompany[]; next_after: string | null }
