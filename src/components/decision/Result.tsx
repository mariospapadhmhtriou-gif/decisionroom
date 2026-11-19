/** Read-only summary of the deterministic ranking. */

import { formatScore, optionLabel, type DecisionDoc } from '@/lib/decision'
import type { Ranking } from '@/lib/scoring'
import { cn } from '@/lib/utils'

export function Result({ doc, ranking }: { doc: DecisionDoc; ranking: Ranking }) {
  return (
    <section
      aria-labelledby="result-heading"
      aria-live="polite"
      className="rounded-xl border border-border bg-[color:var(--color-shell)] p-5"
    >
      <p id="result-heading" className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Result · calculated from your inputs
      </p>
      {!ranking.valid ? (
        <>
          <p className="font-display mt-2 text-2xl text-foreground">No ranking yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every criterion has weight 0. Give at least one criterion a weight to rank the options.
          </p>
        </>
      ) : (
        <>
          <p className="font-display mt-2 text-2xl leading-snug text-primary">
            {ranking.tie
              ? `Tie: ${ranking.leaders.map((i) => optionLabel(doc, i)).join(' & ')}`
              : optionLabel(doc, ranking.leaders[0])}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {ranking.tie
              ? 'These options score the same. Add evidence or revisit your weights — the app will not pick for you.'
              : 'Highest weighted score. This reflects your scores and priorities, not a verified rating.'}
          </p>
          <ol className="mt-4 space-y-2.5">
            {ranking.order.map((i) => {
              const lead = ranking.leaders.includes(i)
              return (
                <li key={i}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={cn('min-w-0 truncate', lead ? 'text-foreground' : 'text-muted-foreground')}>
                      {optionLabel(doc, i)}
                    </span>
                    <span className="tabular shrink-0 text-foreground">
                      {formatScore(ranking.totals[i])}
                      <span className="text-muted-foreground"> / 5</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className={cn('h-full rounded-full', lead ? 'bg-primary' : 'bg-muted-foreground/40')}
                      style={{ width: `${(ranking.totals[i] / 5) * 100}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      )}
      <details className="mt-4 border-t border-border pt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">How this is calculated</summary>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          For each option: sum of (score × weight) ÷ sum of weights. A weight of 0 leaves that criterion out.
          The result is a 1–5 preference score — not a probability or an objective rating. The AI never changes it.
        </p>
      </details>
    </section>
  )
}
