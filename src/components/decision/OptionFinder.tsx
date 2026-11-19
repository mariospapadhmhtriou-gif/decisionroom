/**
 * AI option finder: uses the question, constraints (for example a budget)
 * and criteria weights to search the web and propose three options with
 * suggested scores. Nothing changes until the user accepts the proposal.
 */

import { useState } from 'react'
import { ExternalLink, Sparkles } from 'lucide-react'
import { callAction } from '@/lib/api'
import { criterionLabel, formatScore, type DecisionDoc } from '@/lib/decision'
import { rankOptions } from '@/lib/scoring'
import { applySuggestion, buildSuggestQuery, type Suggestion } from '@/lib/suggest'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Chip, Panel, hostOf } from './controls'

type Update = (fn: (d: DecisionDoc) => DecisionDoc) => void

export function OptionFinder({
  id,
  doc,
  update,
  flush,
}: {
  id: string
  doc: DecisionDoc
  update: Update
  flush: () => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Suggestion | null>(null)
  const [applied, setApplied] = useState(false)

  const hasWeight = doc.criteria.some((c) => c.weight > 0)
  const blocker =
    doc.question.trim().length < 5
      ? 'Write your decision question first.'
      : !hasWeight
        ? 'Give at least one criterion a weight first.'
        : null
  const priorities = doc.criteria
    .map((c, j) => ({ name: criterionLabel(doc, j), weight: c.weight }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight)

  async function find() {
    if (busy || blocker) return
    setBusy(true)
    setError(null)
    setApplied(false)
    if (!(await flush())) {
      setBusy(false)
      setError('Your latest changes are not saved yet. Fix the save problem above, then try again.')
      return
    }
    const res = await callAction<{ suggestion: Suggestion }>('suggestOptions', { id })
    setBusy(false)
    if (res.success) setProposal(res.data.suggestion)
    else setError(res.error)
  }

  function accept() {
    if (!proposal) return
    update((d) => applySuggestion(d, proposal))
    setProposal(null)
    setApplied(true)
  }

  const preview = proposal ? rankOptions({ criteria: doc.criteria, options: proposal.options }) : null
  const replacing = doc.evidence.length

  return (
    <Panel
      id="finder"
      title="Find options with AI"
      description="Describe what you need: your question, your budget and limits under Constraints, and how much each criterion matters. AI searches the web and suggests three options with starting scores."
      actions={doc.aiSuggestedAt ? <Chip tone="gold">Current options came from AI</Chip> : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void find()} disabled={busy || !!blocker} loading={busy}>
          {!busy && <Sparkles aria-hidden />}
          {busy ? 'Searching and scoring…' : proposal ? 'Search again' : 'Find options with AI'}
        </Button>
        {blocker ? (
          <span className="text-xs text-muted-foreground">{blocker}</span>
        ) : (
          <span className="min-w-0 text-xs text-muted-foreground">
            Searches for “{buildSuggestQuery(doc)}” and prioritises{' '}
            {priorities.map((p, k) => (
              <span key={p.name}>
                {k > 0 && ', '}
                <span className="text-foreground">{p.name}</span> ({p.weight}/10)
              </span>
            ))}
            .
          </span>
        )}
      </div>
      {busy && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Searching the web and asking AI to score the best matches. This usually takes 15 to 30 seconds.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {applied && !proposal && (
        <p role="status" className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">
          Options and scores applied. They are AI suggestions from web results: check them in the comparison below and adjust anything you disagree with.
        </p>
      )}

      {proposal && preview && (
        <div className="mt-5">
          <div className="grid gap-3 lg:grid-cols-3">
            {proposal.options.map((o, i) => {
              const lead = preview.valid && preview.leaders.includes(i)
              return (
                <article key={o.name} className={cn('min-w-0 rounded-lg border p-4', lead ? 'border-primary/50' : 'border-border')}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 font-medium text-foreground">{o.name}</h3>
                    {preview.valid && (
                      <span className={cn('font-display tabular shrink-0 text-lg', lead ? 'text-primary' : 'text-foreground/80')}>
                        {formatScore(preview.totals[i])}
                      </span>
                    )}
                  </div>
                  {o.summary && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{o.summary}</p>}
                  <dl className="mt-3 space-y-2">
                    {doc.criteria.map((c, j) => (
                      <div key={j} className={cn(c.weight === 0 && 'opacity-50')}>
                        <dt className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="truncate text-muted-foreground">{criterionLabel(doc, j)}</span>
                          <span className="tabular shrink-0 text-foreground">{o.scores[j]}/5</span>
                        </dt>
                        {o.reasons[j] && <dd className="text-xs leading-snug text-muted-foreground/90">{o.reasons[j]}</dd>}
                      </div>
                    ))}
                  </dl>
                  {o.sources.length > 0 ? (
                    <ul className="mt-3 space-y-1 border-t border-border pt-2">
                      {o.sources.map((s) => (
                        <li key={s.url} className="min-w-0 truncate text-xs">
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                            {hostOf(s.url)}
                            <ExternalLink className="ml-1 inline size-3" aria-hidden />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 border-t border-border pt-2 text-xs text-amber-200/90">No search result cited for this option.</p>
                  )}
                </article>
              )
            })}
          </div>
          {proposal.notes && <p className="mt-3 text-[13px] text-muted-foreground">AI note: {proposal.notes}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={accept}>
              Use these options
            </Button>
            <Button type="button" variant="ghost" onClick={() => setProposal(null)}>
              Discard
            </Button>
            <span className="text-xs text-muted-foreground">
              Replaces your three options and their scores{replacing > 0 ? `, and your ${replacing} saved source${replacing === 1 ? '' : 's'}` : ''}. Cited results become evidence. Your question, constraints and weights stay.
            </span>
          </div>
        </div>
      )}
    </Panel>
  )
}
