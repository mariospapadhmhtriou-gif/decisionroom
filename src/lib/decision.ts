/**
 * DecisionRoom domain model, shared by the browser and the worker.
 *
 * A decision is stored as ONE owner-private record whose `doc` column holds
 * this JSON document. Every write goes through a server action that
 * re-validates the whole document with `decisionDocSchema` (the browser's
 * checks are a convenience, not the boundary).
 */

import { z } from 'zod'
import { rankOptions, type Ranking } from './scoring'

export const LIMITS = {
  question: 200,
  constraints: 2000,
  optionName: 60,
  criterionName: 40,
  evidence: 15,
  evidenceTitle: 200,
  evidenceUrl: 500,
  evidenceSnippet: 600,
  evidenceNote: 500,
  brief: 12000,
  searchQuery: 200,
  searchResults: 6,
  decisionsPerUser: 25,
} as const

export const OPTION_COUNT = 3
export const CRITERION_COUNT = 3

const text = (max: number) => z.string().max(max)
const score = z.number().int().min(1).max(5)
const weight = z.number().int().min(0).max(10)

/** Only http(s) URLs are accepted, never javascript:, data:, etc. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export const evidenceSchema = z.object({
  id: z.string().regex(/^S\d{1,4}$/),
  optionIndex: z.number().int().min(0).max(OPTION_COUNT - 1),
  title: text(LIMITS.evidenceTitle),
  url: text(LIMITS.evidenceUrl).refine(isSafeHttpUrl, 'URL must be http(s)'),
  snippet: text(LIMITS.evidenceSnippet),
  note: text(LIMITS.evidenceNote),
  savedAt: z.string().max(40),
})

export const briefSchema = z.object({
  text: text(LIMITS.brief),
  /** Fingerprint of the inputs the brief was generated from (stale check). */
  inputsKey: z.string().max(40),
  generatedAt: z.string().max(40),
  model: z.string().max(60),
  referenceIds: z.array(z.string().regex(/^S\d{1,4}$/)).max(LIMITS.evidence),
  edited: z.boolean(),
})

export const decisionDocSchema = z
  .object({
    question: text(LIMITS.question),
    constraints: text(LIMITS.constraints),
    criteria: z
      .array(z.object({ name: text(LIMITS.criterionName), weight }))
      .length(CRITERION_COUNT),
    options: z
      .array(
        z.object({
          name: text(LIMITS.optionName),
          scores: z.array(score).length(CRITERION_COUNT),
        }),
      )
      .length(OPTION_COUNT),
    evidence: z.array(evidenceSchema).max(LIMITS.evidence),
    brief: briefSchema.nullable(),
    sample: z.boolean(),
  })
  .refine((d) => new Set(d.evidence.map((e) => e.id)).size === d.evidence.length, {
    message: 'Evidence IDs must be unique',
  })

export type DecisionDoc = z.infer<typeof decisionDocSchema>
export type Evidence = z.infer<typeof evidenceSchema>
export type Brief = z.infer<typeof briefSchema>

/** Columns of the `decisions` collection (see src/schemas/decisions-schema.ts). */
export interface DecisionRecordData extends Record<string, unknown> {
  ownerId: string
  title: string
  doc: string
  revision: number
}

export function sampleDecision(): DecisionDoc {
  return {
    question: 'Which running watch fits my priorities?',
    constraints:
      'Budget around $300. I run 4×/week, mostly roads, one long trail run a month.\nIllustrative sample: the watch names are fictional and the scores are made up. Replace them with your own.',
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
    evidence: [],
    brief: null,
    sample: true,
  }
}

export function blankDecision(): DecisionDoc {
  return {
    question: '',
    constraints: '',
    criteria: [
      { name: 'Criterion 1', weight: 5 },
      { name: 'Criterion 2', weight: 5 },
      { name: 'Criterion 3', weight: 5 },
    ],
    options: [
      { name: 'Option A', scores: [3, 3, 3] },
      { name: 'Option B', scores: [3, 3, 3] },
      { name: 'Option C', scores: [3, 3, 3] },
    ],
    evidence: [],
    brief: null,
    sample: false,
  }
}

/** Parse the stored JSON safely; corrupted or invalid data returns null. */
export function parseDecisionDoc(raw: unknown): DecisionDoc | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed = decisionDocSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function displayName(name: string, fallback: string): string {
  return name.trim() || fallback
}
export const optionLabel = (doc: DecisionDoc, i: number) =>
  displayName(doc.options[i]?.name ?? '', `Option ${i + 1}`)
export const criterionLabel = (doc: DecisionDoc, j: number) =>
  displayName(doc.criteria[j]?.name ?? '', `Criterion ${j + 1}`)

export function rankDecision(doc: DecisionDoc): Ranking {
  return rankOptions({ criteria: doc.criteria, options: doc.options })
}

/** FNV-1a 32-bit, a stable, dependency-free fingerprint (not security). */
export function fingerprint(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Fingerprint of everything a brief is generated from. When this differs
 * from `brief.inputsKey`, the brief is stale.
 */
export function inputsKey(doc: DecisionDoc): string {
  return fingerprint(
    JSON.stringify({
      q: doc.question.trim(),
      c: doc.constraints.trim(),
      cr: doc.criteria,
      o: doc.options,
      e: doc.evidence.map((e) => [e.id, e.optionIndex, e.title, e.url, e.snippet, e.note]),
    }),
  )
}

export function nextEvidenceId(evidence: readonly Evidence[]): string {
  const max = evidence.reduce((m, e) => Math.max(m, Number(e.id.slice(1)) || 0), 0)
  return `S${max + 1}`
}

export function formatScore(n: number): string {
  return n.toFixed(2)
}

/** Human-readable ranking block, computed, never written by the AI. */
export function rankingSummary(doc: DecisionDoc): string {
  const r = rankDecision(doc)
  const weights = doc.criteria
    .map((c, j) => `${criterionLabel(doc, j)} ${c.weight}/10`)
    .join(' · ')
  if (!r.valid) {
    return `No valid ranking: every criterion weight is zero.\nWeights: ${weights}`
  }
  const lines = r.order.map((i, rank) => {
    const per = doc.criteria
      .map((_, j) => `${criterionLabel(doc, j)} ${doc.options[i].scores[j]}/5`)
      .join(', ')
    return `${rank + 1}. ${optionLabel(doc, i)}: ${formatScore(r.totals[i])} / 5  (${per})`
  })
  const head = r.tie
    ? `Tie at the top between ${r.leaders.map((i) => optionLabel(doc, i)).join(' and ')}.`
    : `Highest weighted score: ${optionLabel(doc, r.leaders[0])}.`
  return [head, ...lines, `Weights: ${weights}`].join('\n')
}

// AI brief: structured output contract + composition

export const aiBriefSchema = z.object({
  recommendation: z.string().min(1).max(1200),
  tradeoffs: z.array(z.string().max(500)).max(8),
  supportingPoints: z
    .array(z.object({ sourceId: z.string().max(10), point: z.string().max(500) }))
    .max(12),
  missingEvidence: z.array(z.string().max(400)).max(8),
  openQuestions: z.array(z.string().max(400)).max(8),
})
export type AiBrief = z.infer<typeof aiBriefSchema>

/** House style: no em dashes, en dashes or double hyphens in generated text. */
export function noDashes(text: string): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')
    .replace(/\s*(?:[\u2013\u2014]|-{2,})\s*/g, ', ')
}

/**
 * Coerce parsed model JSON into an AiBrief: keep only expected fields,
 * clamp counts and lengths instead of failing on verbosity. Returns null
 * only when the essential recommendation is missing.
 */
export function normalizeAiBrief(raw: unknown): AiBrief | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? noDashes(v).trim().slice(0, max) : '')
  const strs = (v: unknown, n: number, max: number) =>
    Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []
  const recommendation = str(o.recommendation, 1200)
  if (!recommendation) return null
  const supportingPoints = Array.isArray(o.supportingPoints)
    ? o.supportingPoints
        .map((p) => {
          const q = (p ?? {}) as Record<string, unknown>
          return { sourceId: str(q.sourceId, 10), point: str(q.point, 500) }
        })
        .filter((p) => p.sourceId && p.point)
        .slice(0, 12)
    : []
  return aiBriefSchema.parse({
    recommendation,
    tradeoffs: strs(o.tradeoffs, 8, 500),
    supportingPoints,
    missingEvidence: strs(o.missingEvidence, 8, 400),
    openQuestions: strs(o.openQuestions, 8, 400),
  })
}

/** Extract the first top-level JSON object from model text. */
export function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('No JSON object in model output')
  return JSON.parse(raw.slice(start, end + 1))
}

/**
 * Keep only references to sources that are actually saved on this decision.
 * NOTE: this checks the ID exists, it does not prove the source supports the
 * point. The brief says so explicitly.
 */
export function validateReferences(
  ai: AiBrief,
  evidence: readonly Evidence[],
): { kept: AiBrief['supportingPoints']; dropped: number } {
  const ids = new Set(evidence.map((e) => e.id))
  const kept = ai.supportingPoints.filter((p) => ids.has(p.sourceId.trim()))
  return { kept, dropped: ai.supportingPoints.length - kept.length }
}

const bullets = (items: readonly string[], empty: string) =>
  items.length ? items.map((s) => `- ${s.trim()}`).join('\n') : `- ${empty}`

export function composeBriefText(
  doc: DecisionDoc,
  ai: AiBrief,
  kept: AiBrief['supportingPoints'],
  dropped: number,
): string {
  const byId = new Map(doc.evidence.map((e) => [e.id, e]))
  const support = kept.length
    ? kept
        .map((p) => {
          const e = byId.get(p.sourceId.trim())!
          return `- [${e.id}] ${p.point.trim()}\n  Source: ${e.title || e.url} (${e.url})`
        })
        .join('\n')
    : '- No saved source was cited.'
  const sections = [
    `DECISION: ${doc.question.trim()}`,
    doc.constraints.trim() ? `Constraints: ${doc.constraints.trim()}` : '',
    '',
    'RANKING (calculated by DecisionRoom from your scores and weights)',
    rankingSummary(doc),
    '',
    'RECOMMENDATION',
    ai.recommendation.trim(),
    '',
    'TRADEOFFS',
    bullets(ai.tradeoffs, 'None identified.'),
    '',
    'SUPPORTING EVIDENCE',
    support,
    '',
    'MISSING EVIDENCE & LIMITATIONS',
    bullets(ai.missingEvidence, 'None noted.'),
    '',
    'OPEN QUESTIONS',
    bullets(ai.openQuestions, 'None noted.'),
    '',
    '',
    'Scores and weights were entered by the user; the ranking is arithmetic, not a probability. ' +
      'The prose sections were drafted by AI from the saved inputs. Source IDs were checked against ' +
      'saved sources, which does not prove a source supports the point, so open the links.' +
      (dropped > 0 ? ` ${dropped} reference(s) to unknown source IDs were removed.` : ''),
  ]
  return sections.filter((s, i) => !(s === '' && sections[i - 1] === '')).join('\n')
}

// Email

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

export interface EmailContent {
  subject: string
  text: string
  html: string
}

export function composeEmail(doc: DecisionDoc): EmailContent | null {
  const body = doc.brief?.text.trim()
  if (!body) return null
  const q = doc.question.trim() || 'Untitled decision'
  const subject = `Decision brief: ${q}`.slice(0, 180)
  const footer = 'Sent from DecisionRoom at your request.'
  const text = `${body}\n\n${footer}`
  const html =
    `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.6;color:#1f1f1f;max-width:640px">` +
    `<div style="white-space:pre-wrap">${escapeHtml(body)}</div>` +
    `<p style="color:#6b6b6b;font-size:12px;margin-top:24px">${escapeHtml(footer)}</p></div>`
  return { subject, text, html }
}
