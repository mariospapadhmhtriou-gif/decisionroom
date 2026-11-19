import { describe, expect, it } from 'vitest'
import { blankDecision, decisionDocSchema, sampleDecision, type DecisionDoc } from './decision'
import {
  applyScores,
  buildScoresUserMessage,
  needsAutoScores,
  normalizeScores,
  readyToScore,
  scoresEditedByUser,
  scoresKey,
  scoresOutOfDate,
} from './autoscore'
import { applySuggestion } from './suggest'

function named(): DecisionDoc {
  const d = blankDecision()
  return {
    ...d,
    question: 'Which used car should I buy?',
    criteria: [
      { name: 'Affordability', weight: 9 },
      { name: 'Reliability', weight: 7 },
      { name: 'Safety', weight: 6 },
    ],
    options: [
      { name: 'Toyota Corolla 2015', scores: [3, 3, 3] },
      { name: 'Honda Civic 2014', scores: [3, 3, 3] },
      { name: 'Mazda 3 2016', scores: [3, 3, 3] },
    ],
  }
}

const grid = { scores: [[4, 5, 4], [4, 4, 4], [3, 4, 5]], reasons: [['a', 'b', 'c'], [], ['x']] }

describe('automatic scores', () => {
  it('waits until the question, options and criteria all have real names', () => {
    expect(readyToScore(blankDecision())).toBe(false)
    const d = named()
    expect(readyToScore({ ...d, options: [d.options[0], d.options[1], { name: 'Option C', scores: [3, 3, 3] }] })).toBe(false)
    expect(readyToScore(d)).toBe(true)
    expect(needsAutoScores(d)).toBe(true)
  })

  it('re-scores when options or criteria change, but not for weight changes', () => {
    const scored = applyScores(named(), normalizeScores(grid)!, scoresKey(named()))
    expect(needsAutoScores(scored)).toBe(false)
    const reweighted = { ...scored, criteria: scored.criteria.map((c) => ({ ...c, weight: 2 })) }
    expect(needsAutoScores(reweighted)).toBe(false)
    const renamed = { ...scored, options: [{ ...scored.options[0], name: 'Ford Focus 2015' }, scored.options[1], scored.options[2]] }
    expect(needsAutoScores(renamed)).toBe(true)
  })

  it('never auto-overwrites scores the user set, but flags when inputs changed', () => {
    const scored = applyScores(named(), normalizeScores(grid)!, scoresKey(named()))
    const edited = { ...scored, scoresManual: true }
    expect(needsAutoScores(edited)).toBe(false)
    expect(scoresOutOfDate(edited)).toBe(false)
    const changed = { ...edited, criteria: [{ name: 'Fuel economy', weight: 5 }, edited.criteria[1], edited.criteria[2]] }
    expect(needsAutoScores(changed)).toBe(false)
    expect(scoresOutOfDate(changed)).toBe(true)
  })

  it('leaves the fictional sample and older hand-scored decisions alone', () => {
    expect(scoresEditedByUser(sampleDecision())).toBe(true)
    const older = { ...named(), options: named().options.map((o, i) => ({ ...o, scores: i === 0 ? [5, 2, 3] : o.scores })) }
    expect(scoresEditedByUser(older)).toBe(true)
  })

  it('clamps model scores into a full 3x3 grid of integers 1 to 5', () => {
    const out = normalizeScores({ scores: [[9, 0, '4'], [2.6], null], reasons: [['ok \u2014 fine']] })!
    expect(out.scores).toEqual([[5, 1, 4], [3, 3, 3], [3, 3, 3]])
    expect(out.reasons[0][0]).toBe('ok, fine')
    expect(normalizeScores({ scores: [[1, 2, 3]] })).toBeNull()
  })

  it('applies scores as a valid document and keeps names', () => {
    const next = applyScores(named(), normalizeScores(grid)!, 'k')
    expect(decisionDocSchema.safeParse(next).success).toBe(true)
    expect(next.options.map((o) => o.name)).toEqual(named().options.map((o) => o.name))
    expect(next.options[2].scores).toEqual([3, 4, 5])
    expect(next.scoresManual).toBe(false)
  })

  it('treats finder results as current AI scores (no immediate rescore)', () => {
    const d = named()
    const next = applySuggestion(d, {
      query: 'q',
      notes: '',
      options: ['A', 'B', 'C'].map((name) => ({ name, summary: '', scores: [4, 4, 4], reasons: ['', '', ''], sources: [] })),
    })
    expect(needsAutoScores(next)).toBe(false)
  })

  it('frames names as untrusted data', () => {
    expect(buildScoresUserMessage(named())).toContain('"name": "Toyota Corolla 2015"')
  })
})
