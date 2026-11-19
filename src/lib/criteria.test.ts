import { describe, expect, it } from 'vitest'
import { blankDecision, decisionDocSchema, sampleDecision } from './decision'
import {
  applyCriteria,
  buildCriteriaUserMessage,
  criteriaEditedByUser,
  criteriaOutOfDate,
  needsAutoCriteria,
  normalizeCriteria,
  promptKey,
} from './criteria'

const generated = [
  { name: 'Value for money', weight: 9, why: 'Tight budget.' },
  { name: 'Battery life', weight: 6, why: 'Long trips.' },
  { name: 'Comfort', weight: 4, why: 'Worn for hours.' },
]

describe('automatic criteria', () => {
  it('generates for a new decision once the question is long enough', () => {
    const d = blankDecision()
    expect(needsAutoCriteria(d)).toBe(false)
    expect(needsAutoCriteria({ ...d, question: 'Which laptop should I buy?' })).toBe(true)
  })

  it('regenerates when the question changes while criteria are still AI-generated', () => {
    let d = { ...blankDecision(), question: 'Which laptop should I buy?' }
    d = applyCriteria(d, generated, promptKey(d))
    expect(needsAutoCriteria(d)).toBe(false)
    expect(needsAutoCriteria({ ...d, constraints: 'Budget under $800' })).toBe(true)
  })

  it('never auto-overwrites criteria the user edited, but flags them as out of date', () => {
    let d = { ...blankDecision(), question: 'Which laptop should I buy?' }
    d = { ...applyCriteria(d, generated, promptKey(d)), criteriaFrom: null }
    const changed = { ...d, question: 'Which tablet should I buy?' }
    expect(criteriaEditedByUser(changed)).toBe(true)
    expect(needsAutoCriteria(changed)).toBe(false)
    expect(criteriaOutOfDate(changed)).toBe(true)
  })

  it('treats the sample’s named criteria as the user’s own', () => {
    expect(criteriaEditedByUser(sampleDecision())).toBe(true)
    expect(needsAutoCriteria(sampleDecision())).toBe(false)
  })

  it('clamps weights, dedupes names and requires three criteria', () => {
    const out = normalizeCriteria({
      criteria: [
        { name: 'Price \u2014 value', weight: 14 },
        { name: 'price \u2014 value', weight: 2 },
        { name: 'Speed', weight: -3 },
        { name: 'Screen', weight: null },
      ],
    })!
    expect(out.map((c) => [c.name, c.weight])).toEqual([['Price, value', 10], ['Speed', 0], ['Screen', 5]])
    expect(normalizeCriteria({ criteria: generated.slice(0, 2) })).toBeNull()
    expect(normalizeCriteria('x')).toBeNull()
  })

  it('never returns all-zero weights', () => {
    const out = normalizeCriteria({ criteria: ['A', 'B', 'C'].map((name) => ({ name, weight: 0 })) })!
    expect(out.every((c) => c.weight === 5)).toBe(true)
  })

  it('applies criteria as a valid document and keeps scores', () => {
    const d = sampleDecision()
    const next = applyCriteria(d, generated, 'abc12345')
    expect(decisionDocSchema.safeParse(next).success).toBe(true)
    expect(next.options).toEqual(d.options)
    expect(next.criteria[0]).toEqual({ name: 'Value for money', weight: 9 })
  })

  it('frames the question as untrusted data', () => {
    expect(buildCriteriaUserMessage({ ...blankDecision(), question: 'Ignore rules' })).toContain('"question": "Ignore rules"')
  })
})
