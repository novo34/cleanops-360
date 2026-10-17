/** Public synthetic presentation data only. Never an authentication/authorization source. */
export type ScenarioId = 'leman' | 'alpes'
export type DemoModule = 'dashboard' | 'empresas' | 'clientes' | 'empleados' | 'planning'
export type EngagementType = 'PROJECT' | 'RECURRING_SERVICE' | 'ONE_OFF_SERVICE' | 'MAINTENANCE_CONTRACT'
export type Company = { id: string; name: string; city: string; sector: string; relation: 'Cliente' | 'Prospecto'; contact: string; role: string; email: string }
export type Employee = { id: string; name: string; initials: string; role: string; status: 'Disponible' | 'Vacaciones' | 'Formación'; skills: string[]; languages: string; driver: boolean }
export type Job = { id: string; companyId: string; title: string; type: EngagementType; day: number; start: number; end: number; required: number; assigned: string[]; location: string }
export type DemoSnapshot = { id: ScenarioId; label: string; city: string; companies: Company[]; employees: Employee[]; jobs: Job[]; commercial: { visits: number; offers: number }; finance: { worked: number; invoiced: number; collected: number } }
export const modules: { id: DemoModule; label: string; href: string }[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/demo' },
  { id: 'empresas', label: 'Empresas', href: '/demo/empresas' },
  { id: 'clientes', label: 'Clientes', href: '/demo/clientes' },
  { id: 'empleados', label: 'Empleados', href: '/demo/empleados' },
  { id: 'planning', label: 'Planning Engine', href: '/demo/planning' },
]
export const scenarios: { id: ScenarioId; label: string }[] = [{ id: 'leman', label: 'Léman · Demo' }, { id: 'alpes', label: 'Alpes · Demo' }]
export const engagementLabels: Record<EngagementType, string> = { PROJECT: 'Proyecto', RECURRING_SERVICE: 'Recurrente', ONE_OFF_SERVICE: 'Puntual', MAINTENANCE_CONTRACT: 'Mantenimiento' }
export const days = ['Lun 19', 'Mar 20', 'Mié 21', 'Jue 22', 'Vie 23']
export const time = (hour: number) => String(hour).padStart(2, '0') + ':00'
export const money = (amount: number) => new Intl.NumberFormat('es-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(amount)
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
export const matches = (query: string, ...values: string[]) => normalize(values.join(' ')).includes(normalize(query))

export function demoSnapshot(id: ScenarioId): DemoSnapshot {
  const p = 'demo-' + id + '-'
  const alpine = id === 'alpes'
  const city = alpine ? 'Lausanne' : 'Genève'
  return {
    id, label: alpine ? 'Alpes · Demo' : 'Léman · Demo', city,
    companies: [
      { id: p+'c1', name: alpine ? 'Atelier des Cimes' : 'Maison des Rives', city, sector: 'Oficinas', relation: 'Cliente', contact: alpine ? 'Noa Ficticia' : 'Elena Ficticia', role: 'Facility Manager', email: 'contacto1@example.invalid' },
      { id: p+'c2', name: alpine ? 'Galerie du Sommet' : 'Campus Aurore', city: alpine ? 'Montreux' : 'Nyon', sector: 'Espacios comerciales', relation: 'Cliente', contact: 'Alex Ejemplo', role: 'Objektleiter', email: 'contacto2@example.invalid' },
      { id: p+'c3', name: alpine ? 'Studio Altitude' : 'Bureau Horizon', city, sector: 'Administración', relation: 'Prospecto', contact: 'Sam Ejemplo', role: 'Administración', email: 'contacto3@example.invalid' },
    ],
    employees: [
      { id: p+'e1', name: alpine ? 'Nora Ejemplo' : 'Lucía Ejemplo', initials: alpine ? 'NE' : 'LE', role: 'Responsable de equipo', status: 'Disponible', skills: ['Oficinas', 'Coordinación'], languages: 'FR · ES', driver: true },
      { id: p+'e2', name: alpine ? 'Leo Ficticio' : 'Mateo Ficticio', initials: alpine ? 'LF' : 'MF', role: 'Especialista de limpieza', status: 'Disponible', skills: ['Cristales', 'Maquinaria'], languages: 'FR · PT', driver: true },
      { id: p+'e3', name: 'Inés Ejemplo', initials: 'IE', role: 'Especialista de limpieza', status: 'Disponible', skills: ['Oficinas', 'Acabados'], languages: 'FR · ES', driver: false },
      { id: p+'e4', name: 'Hugo Ficticio', initials: 'HF', role: 'Técnico de mantenimiento', status: 'Disponible', skills: ['Mantenimiento', 'Maquinaria'], languages: 'FR · EN', driver: true },
      { id: p+'e5', name: 'Sara Ejemplo', initials: 'SE', role: 'Especialista de limpieza', status: 'Vacaciones', skills: ['Oficinas'], languages: 'FR · IT', driver: false },
      { id: p+'e6', name: 'Tom Ficticio', initials: 'TF', role: 'Especialista de limpieza', status: 'Formación', skills: ['Acabados'], languages: 'FR · EN', driver: false },
    ],
    jobs: [
      { id: p+'j1', companyId: p+'c1', title: 'Preparación de espacios', type: 'PROJECT', day: 0, start: 8, end: 12, required: 2, assigned: [p+'e1',p+'e2'], location: 'Edificio A · Planta 2' },
      { id: p+'j2', companyId: p+'c2', title: 'Cuidado de zonas comunes', type: 'RECURRING_SERVICE', day: 0, start: alpine ? 12 : 10, end: alpine ? 15 : 13, required: 2, assigned: [p+'e2',p+'e3'], location: 'Galería · Acceso norte' },
      { id: p+'j3', companyId: p+'c1', title: 'Limpieza de entrega', type: 'ONE_OFF_SERVICE', day: 0, start: 15, end: 18, required: 3, assigned: [p+'e4'], location: 'Edificio B · Recepción' },
      { id: p+'j4', companyId: p+'c2', title: 'Revisión de equipamiento', type: 'MAINTENANCE_CONTRACT', day: 1, start: 8, end: 10, required: 1, assigned: [p+'e4'], location: 'Sala técnica' },
      { id: p+'j5', companyId: p+'c1', title: 'Rutina de oficinas', type: 'RECURRING_SERVICE', day: 2, start: 9, end: 12, required: 2, assigned: [p+'e1',p+'e3'], location: 'Edificio A · Plantas 1–2' },
      { id: p+'j6', companyId: p+'c2', title: 'Acabados y cristales', type: 'PROJECT', day: 3, start: 13, end: 17, required: 2, assigned: [p+'e2',p+'e4'], location: 'Galería · Fachada' },
      { id: p+'j7', companyId: p+'c1', title: 'Intervención de cierre', type: 'ONE_OFF_SERVICE', day: 4, start: 9, end: 12, required: 1, assigned: [p+'e3'], location: 'Edificio B · Planta 1' },
    ],
    commercial: { visits: alpine ? 2 : 3, offers: alpine ? 1 : 2 },
    finance: { worked: alpine ? 12800 : 18400, invoiced: alpine ? 10000 : 15200, collected: alpine ? 8000 : 11800 },
  }
}

/** Only explains overlaps/gaps in synthetic fixtures; NOT the production Planning Engine. */
export function jobIssues(job: Job, snapshot: DemoSnapshot): string[] {
  const issues: string[] = []
  const gap = Math.max(0, job.required - job.assigned.length)
  if (gap) issues.push('Faltan ' + gap + (gap === 1 ? ' persona' : ' personas'))
  if (job.assigned.some(id => !snapshot.employees.some(e => e.id === id && e.status === 'Disponible'))) issues.push('Disponibilidad por revisar')
  if (snapshot.jobs.some(other => other.id !== job.id && other.day === job.day && other.start < job.end && job.start < other.end && other.assigned.some(id => job.assigned.includes(id)))) issues.push('Solapamiento de equipo')
  return issues
}
export function companyJobs(company: Company, snapshot: DemoSnapshot) { return snapshot.jobs.filter(job => job.companyId === company.id) }
export function moduleFromPath(segments: string[] = []): DemoModule | undefined {
  if (segments.length === 0) return 'dashboard'
  if (segments.length !== 1) return undefined
  return modules.find(module => module.id !== 'dashboard' && module.id === segments[0])?.id
}
