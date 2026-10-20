import { jobIssues, type DemoSnapshot, type Job, type EngagementType } from './model'

export type DemoMapFilter = 'all' | 'issues' | EngagementType
export type DemoMapPeriod = 'today' | 'week'
export type OperationPoint = { job: Job; coordinates: [number, number]; city: string; company: string; issues: string[] }

/** Fictional site coordinates around each scenario city, never employee positions or geocoding. */
const locations: Record<string, [number, number]> = {
  'Genève': [6.1432, 46.2044], 'Nyon': [6.238, 46.3833],
  'Lausanne': [6.6323, 46.5197], 'Montreux': [6.9107, 46.4312],
}
export function operationPoints(snapshot: DemoSnapshot, period: DemoMapPeriod, filter: DemoMapFilter): OperationPoint[] {
  return snapshot.jobs.flatMap((job, index) => {
    const company = snapshot.companies.find(value => value.id === job.companyId)
    if (!company || (period === 'today' && job.day !== 0)) return []
    const issues = jobIssues(job, snapshot)
    if (filter === 'issues' && !issues.length) return []
    if (filter !== 'all' && filter !== 'issues' && job.type !== filter) return []
    const center = locations[company.city]
    if (!center) return []
    return [{ job, issues, company: company.name, city: company.city, coordinates: [center[0] + (index % 3 - 1) * 0.024, center[1] + Math.floor(index / 3) * 0.016] as [number, number] }]
  })
}
