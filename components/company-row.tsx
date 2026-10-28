import { ChevronRight, MapPin } from 'lucide-react'

/** Shared presentation only: no fixtures, identity, persistence or authorization. */
export function CompanyRow({ name, sector, city, contact, role, relation, onOpen }: {
  name: string; sector: string; city: string; contact: string; role: string; relation: string; onOpen: () => void
}) {
  return <button className="demo-company-row" onClick={onOpen}><span className="demo-company-monogram">{name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span><span className="demo-company-name"><strong>{name}</strong><small>{sector}</small></span><span className="demo-company-city"><MapPin aria-hidden="true" />{city}</span><span className="demo-company-contact">{contact}<small>{role}</small></span><span className="demo-badge">{relation}</span><ChevronRight aria-hidden="true" /></button>
}
