/**
 * The editable comparison: option names, criteria + weights, and 1-5 scores,
 * with the computed weighted score as a read-only footer.
 * Desktop: a table. Narrow screens: priorities list + one card per option.
 */

import type { ReactNode } from 'react'
import { LIMITS, criterionLabel, formatScore, optionLabel, type DecisionDoc } from '@/lib/decision'
import type { Ranking } from '@/lib/scoring'
import { weightShares } from '@/lib/scoring'
import { cn } from '@/lib/utils'
import { Panel, ScoreSelect, WeightControl } from './controls'

type Update = (fn: (d: DecisionDoc) => DecisionDoc) => void

const setOptionName = (i: number, name: string) => (d: DecisionDoc) => ({
  ...d,
  options: d.options.map((o, k) => (k === i ? { ...o, name } : o)),
})
const setCriterion = (j: number, patch: Partial<DecisionDoc['criteria'][number]>) => (d: DecisionDoc) => ({
  ...d,
  criteriaFrom: null,
  criteria: d.criteria.map((c, k) => (k === j ? { ...c, ...patch } : c)),
})
const setScore = (i: number, j: number, n: number) => (d: DecisionDoc) => ({
  ...d,
  scoresManual: true,
  options: d.options.map((o, k) =>
    k === i ? { ...o, scores: o.scores.map((s, m) => (m === j ? n : s)) } : o,
  ),
})

const nameInput =
  'w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold text-foreground hover:border-input focus:border-input focus:bg-background/60'

export function Comparison({
  doc,
  ranking,
  update,
  criteriaBar,
}: {
  doc: DecisionDoc
  ranking: Ranking
  update: Update
  criteriaBar?: ReactNode
}) {
  const shares = weightShares(doc.criteria)
  const isLeader = (i: number) => ranking.valid && ranking.leaders.includes(i)
  const rankOf = (i: number) => (ranking.valid ? ranking.order.indexOf(i) + 1 : null)

  return (
    <Panel
      id="comparison"
      title="Comparison"
      description="Score each option 1 (weak) to 5 (strong). Weights set how much each criterion counts."
    >
      {criteriaBar}
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">Options scored against weighted criteria</caption>
          <colgroup>
            <col className="w-[40%]" />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Criterion &amp; weight
              </th>
              {doc.options.map((o, i) => (
                <th key={i} scope="col" className={cn('px-1.5 pb-2 text-left align-bottom', isLeader(i) && 'bg-primary/[0.06]')}>
                  <input
                    aria-label={`Option ${i + 1} name`}
                    maxLength={LIMITS.optionName}
                    value={o.name}
                    placeholder={`Option ${i + 1}`}
                    onChange={(e) => update(setOptionName(i, e.target.value))}
                    className={nameInput}
                    title={o.name}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.criteria.map((c, j) => (
              <tr key={j} className="border-b border-border/70">
                <th scope="row" className="py-3 pr-4 text-left align-top font-normal">
                  <input
                    aria-label={`Criterion ${j + 1} name`}
                    maxLength={LIMITS.criterionName}
                    value={c.name}
                    placeholder={`Criterion ${j + 1}`}
                    onChange={(e) => update(setCriterion(j, { name: e.target.value }))}
                    className={cn(nameInput, 'mb-1 font-medium')}
                  />
                  <div className="px-2">
                    <WeightControl
                      id={`weight-d-${j}`}
                      value={c.weight}
                      share={shares[j]}
                      label={`Weight for ${criterionLabel(doc, j)}`}
                      onChange={(n) => update(setCriterion(j, { weight: n }))}
                    />
                  </div>
                </th>
                {doc.options.map((o, i) => (
                  <td key={i} className={cn('px-3 py-3 align-middle', isLeader(i) && 'bg-primary/[0.06]', c.weight === 0 && 'opacity-50')}>
                    <ScoreSelect
                      value={o.scores[j]}
                      label={`${optionLabel(doc, i)} score for ${criterionLabel(doc, j)}`}
                      onChange={(n) => update(setScore(i, j, n))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-4 pr-4 text-left align-top">
                <span className="block text-sm font-medium text-foreground">Weighted score</span>
                <span className="block text-xs font-normal text-muted-foreground">Calculated · out of 5</span>
              </th>
              {doc.options.map((_, i) => (
                <td
                  key={i}
                  className={cn('px-3 pt-4 align-top', isLeader(i) && 'bg-primary/[0.06] shadow-[inset_0_2px_0_var(--color-primary)]')}
                >
                  <div className={cn('font-display tabular text-2xl', isLeader(i) ? 'text-primary' : 'text-foreground/85')}>
                    {ranking.valid ? formatScore(ranking.totals[i]) : 'n/a'}
                  </div>
                  {ranking.valid && (
                    <div className="text-xs text-muted-foreground">
                      {isLeader(i) ? (ranking.tie ? 'Tied for 1st' : 'Highest') : `#${rankOf(i)}`}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Narrow screens */}
      <div className="space-y-6 md:hidden">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Criteria &amp; weights</h3>
          <ul className="space-y-4">
            {doc.criteria.map((c, j) => (
              <li key={j}>
                <input
                  aria-label={`Criterion ${j + 1} name`}
                  maxLength={LIMITS.criterionName}
                  value={c.name}
                  placeholder={`Criterion ${j + 1}`}
                  onChange={(e) => update(setCriterion(j, { name: e.target.value }))}
                  className={cn(nameInput, 'mb-1 px-0 font-medium')}
                />
                <WeightControl
                  id={`weight-m-${j}`}
                  value={c.weight}
                  share={shares[j]}
                  label={`Weight for ${criterionLabel(doc, j)}`}
                  onChange={(n) => update(setCriterion(j, { weight: n }))}
                />
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Options &amp; scores</h3>
          {doc.options.map((o, i) => (
            <div key={i} className={cn('rounded-lg border p-3', isLeader(i) ? 'border-primary/50' : 'border-border')}>
              <div className="mb-2 flex items-center gap-2">
                <input
                  aria-label={`Option ${i + 1} name`}
                  maxLength={LIMITS.optionName}
                  value={o.name}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) => update(setOptionName(i, e.target.value))}
                  className={cn(nameInput, 'flex-1 px-1')}
                />
                <div className="shrink-0 text-right">
                  <div className={cn('font-display tabular text-xl', isLeader(i) ? 'text-primary' : 'text-foreground/85')}>
                    {ranking.valid ? formatScore(ranking.totals[i]) : 'n/a'}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {doc.criteria.map((_, j) => (
                  <label key={j} className="min-w-0 text-xs text-muted-foreground">
                    <span className="mb-1 block truncate">{criterionLabel(doc, j)}</span>
                    <ScoreSelect
                      value={o.scores[j]}
                      label={`${optionLabel(doc, i)} score for ${criterionLabel(doc, j)}`}
                      onChange={(n) => update(setScore(i, j, n))}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
