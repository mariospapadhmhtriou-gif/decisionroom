import { describe, expect, it } from 'vitest'
import { rankOptions, weightShares, type ScoringInput } from './scoring'

const watches: ScoringInput = {
  criteria: [
    { name: 'Affordability', weight: 7 },
    { name: 'Battery life', weight: 5 },
    { name: 'Training tools', weight: 4 },
  ],
  options: [
    { name: 'Pace Lite', scores: [5, 2, 3] },
    { name: 'Trail Endure', scores: [3, 5, 3] },
    { name: 'Tempo Pro', scores: [2, 3, 5] },
  ],
}

describe('rankOptions', () => {
  it('computes the known weighted average', () => {
    const r = rankOptions(watches)
    if (!r.valid) throw new Error('expected a valid ranking')
    // Pace Lite: (5*7 + 2*5 + 3*4) / 16 = 57/16
    expect(r.totals[0]).toBeCloseTo(57 / 16, 12)
    // Trail Endure: (21 + 25 + 12) / 16 = 58/16
    expect(r.totals[1]).toBeCloseTo(58 / 16, 12)
    // Tempo Pro: (14 + 15 + 20) / 16 = 49/16
    expect(r.totals[2]).toBeCloseTo(49 / 16, 12)
    expect(r.order).toEqual([1, 0, 2])
    expect(r.leaders).toEqual([1])
    expect(r.tie).toBe(false)
    expect(r.totalWeight).toBe(16)
  })

  it('changes the winner when priorities change', () => {
    const trainingFirst: ScoringInput = {
      ...watches,
      criteria: [
        { name: 'Affordability', weight: 1 },
        { name: 'Battery life', weight: 1 },
        { name: 'Training tools', weight: 10 },
      ],
    }
    const r = rankOptions(trainingFirst)
    if (!r.valid) throw new Error('expected a valid ranking')
    expect(r.leaders).toEqual([2])
  })

  it('returns no ranking when all weights are zero', () => {
    const r = rankOptions({
      ...watches,
      criteria: watches.criteria.map((c) => ({ ...c, weight: 0 })),
    })
    expect(r).toEqual({ valid: false, reason: 'all-zero-weights' })
  })

  it('reports equal scores as an explicit tie', () => {
    const r = rankOptions({
      criteria: [
        { name: 'A', weight: 5 },
        { name: 'B', weight: 5 },
        { name: 'C', weight: 0 },
      ],
      options: [
        { name: 'X', scores: [4, 2, 1] },
        { name: 'Y', scores: [2, 4, 5] },
        { name: 'Z', scores: [1, 1, 1] },
      ],
    })
    if (!r.valid) throw new Error('expected a valid ranking')
    expect(r.tie).toBe(true)
    expect(r.leaders).toEqual([0, 1])
    expect(r.order).toEqual([0, 1, 2])
  })

  it('ties when different score profiles produce equal totals', () => {
    const r = rankOptions({
      criteria: [
        { name: 'A', weight: 1 },
        { name: 'B', weight: 2 },
        { name: 'C', weight: 7 },
      ],
      options: [
        { name: 'X', scores: [3, 3, 3] },
        { name: 'Y', scores: [5, 2, 3] },
        { name: 'Z', scores: [1, 1, 1] },
      ],
    })
    if (!r.valid) throw new Error('expected a valid ranking')
    expect(r.tie).toBe(true)
  })

  it('excludes a zero-weight criterion entirely', () => {
    const base = {
      criteria: [
        { name: 'A', weight: 3 },
        { name: 'B', weight: 3 },
        { name: 'Excluded', weight: 0 },
      ],
      options: [
        { name: 'X', scores: [4, 4, 1] },
        { name: 'Y', scores: [3, 3, 5] },
        { name: 'Z', scores: [2, 2, 5] },
      ],
    }
    const r = rankOptions(base)
    if (!r.valid) throw new Error('expected a valid ranking')
    expect(r.totals).toEqual([4, 3, 2])
    const changed = rankOptions({
      ...base,
      options: base.options.map((o) => ({ ...o, scores: [o.scores[0], o.scores[1], 1] })),
    })
    if (!changed.valid) throw new Error('expected a valid ranking')
    expect(changed.totals).toEqual(r.totals)
  })

  it('does not mutate its inputs', () => {
    const input = structuredClone(watches)
    const frozen = JSON.stringify(input)
    rankOptions(input)
    weightShares(input.criteria)
    expect(JSON.stringify(input)).toBe(frozen)
  })
})

describe('weightShares', () => {
  it('returns each criterion share of the total weight', () => {
    expect(weightShares(watches.criteria)).toEqual([7 / 16, 5 / 16, 4 / 16])
  })
  it('returns zeros when nothing has weight', () => {
    expect(weightShares([{ name: 'A', weight: 0 }])).toEqual([0])
  })
})
