/**
 * Deterministic weighted scoring — pure, no I/O, shared by browser and worker.
 *
 * weighted score = Σ(score × weight) / Σ(weight)
 *
 * - Scores are integers 1–5 (higher is always better).
 * - Weights are integers 0–10; a zero weight excludes that criterion.
 * - All weights zero → no valid ranking (we never invent one).
 * - Ties are reported explicitly; no hidden tie-breaker picks a winner.
 *
 * The result is a preference score on the same 1–5 scale. It is not a
 * probability, a confidence estimate, or an objective product rating.
 */

export interface ScoringCriterion {
  name: string
  weight: number
}

export interface ScoringOption {
  name: string
  scores: readonly number[]
}

export interface ScoringInput {
  criteria: readonly ScoringCriterion[]
  options: readonly ScoringOption[]
}

export type Ranking =
  | { valid: false; reason: 'all-zero-weights' | 'no-options' }
  | {
      valid: true
      /** Weighted score per option, same order as input.options. */
      totals: number[]
      /** Option indexes sorted best → worst (ties keep input order). */
      order: number[]
      /** Every option index sharing the top score. */
      leaders: number[]
      tie: boolean
      totalWeight: number
    }

/** Scores closer than this are treated as equal (floating-point safety). */
export const TIE_EPSILON = 1e-9

export function rankOptions(input: ScoringInput): Ranking {
  if (input.options.length === 0) return { valid: false, reason: 'no-options' }
  const totalWeight = input.criteria.reduce((sum, c) => sum + c.weight, 0)
  if (totalWeight <= 0) return { valid: false, reason: 'all-zero-weights' }

  const totals = input.options.map(
    (option) =>
      input.criteria.reduce((sum, c, j) => sum + (option.scores[j] ?? 0) * c.weight, 0) /
      totalWeight,
  )
  const max = Math.max(...totals)
  const leaders = totals.flatMap((t, i) => (Math.abs(t - max) < TIE_EPSILON ? [i] : []))
  const order = totals
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (Math.abs(b.t - a.t) < TIE_EPSILON ? a.i - b.i : b.t - a.t))
    .map((x) => x.i)

  return { valid: true, totals, order, leaders, tie: leaders.length > 1, totalWeight }
}

/** Share of the decision each criterion carries, 0–1 (all zero when no weight). */
export function weightShares(criteria: readonly ScoringCriterion[]): number[] {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0)
  return criteria.map((c) => (total > 0 ? c.weight / total : 0))
}
