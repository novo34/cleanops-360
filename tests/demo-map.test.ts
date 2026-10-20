import { describe, expect, it } from 'vitest'
import { demoSnapshot } from '../lib/demo/model'
import { operationPoints } from '../lib/demo/map-model'

describe('synthetic operations map shares the demo source', () => {
  it('keeps the same service IDs and coverage warnings as the agenda and planning', () => {
    const snapshot = demoSnapshot('leman')
    expect(operationPoints(snapshot, 'today', 'all').map(p => p.job.id)).toEqual(snapshot.jobs.filter(j => j.day === 0).map(j => j.id))
    expect(operationPoints(snapshot, 'week', 'all')).toHaveLength(7)
    expect(operationPoints(snapshot, 'week', 'issues')).toHaveLength(3)
  })
  it('never mixes scenarios and uses fictional coordinates around each scenario city', () => {
    const leman = operationPoints(demoSnapshot('leman'), 'today', 'all')
    const alpes = operationPoints(demoSnapshot('alpes'), 'today', 'all')
    expect(alpes.every(p => p.job.id.startsWith('demo-alpes-'))).toBe(true)
    expect(alpes.map(p => p.company)).not.toEqual(leman.map(p => p.company))
    expect(alpes.every(p => p.coordinates[0] > 6.5)).toBe(true)
    expect(leman.every(p => p.coordinates[0] < 6.5)).toBe(true)
    expect(operationPoints(demoSnapshot('alpes'), 'week', 'issues')).toHaveLength(1)
  })
})
