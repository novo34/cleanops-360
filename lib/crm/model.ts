/** CRM company is a business record inside a server-resolved organization/tenant. */
export const contactRoles = ['BAULEITER', 'PROJEKTLEITER', 'FACILITY_MANAGER', 'OBJEKTLEITER', 'EINKAUF', 'BAUMANAGEMENT', 'ADMINISTRATION', 'MANAGEMENT'] as const
export type ContactRole = typeof contactRoles[number]
export type CompanyFields = { name: string; city: string; sector: string; relation: 'CUSTOMER' | 'PROSPECT' }
export type ContactFields = {
  name: string; email: string; roles: ContactRole[]; data_source: string; source_url: string | null
  first_seen_at: string; last_verified_at: string | null; communication_basis: string | null
  do_not_contact: boolean; privacy_request_status: string | null; retention_review_at: string | null
}
export type Contact = ContactFields & { id: string; do_not_contact_at: string | null }
export type CrmCompany = CompanyFields & { id: string; version: string; contacts: Contact[]; can_edit: boolean }
export type CompanySummary = CompanyFields & { id: string; contact_name: string | null; contact_count: number }
export type CrmPage = { items: CompanySummary[]; next_after: string | null }
