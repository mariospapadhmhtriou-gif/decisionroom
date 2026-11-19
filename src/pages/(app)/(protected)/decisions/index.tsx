/** Your decisions: list, create (sample or blank), open. */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useQuery } from 'deepspace'
import { callAction } from '@/lib/api'
import { parseDecisionDoc, rankDecision, optionLabel, type DecisionRecordData } from '@/lib/decision'
import { Button } from '@/components/ui'
import { Chip } from '@/components/decision/controls'

export default function DecisionsPage() {
  const { records, status } = useQuery<DecisionRecordData>('decisions', { orderBy: 'updatedAt', orderDir: 'desc' })
  const navigate = useNavigate()
  const [creating, setCreating] = useState<null | 'sample' | 'blank'>(null)
  const [error, setError] = useState<string | null>(null)

  async function create(template: 'sample' | 'blank') {
    setCreating(template)
    setError(null)
    const res = await callAction<{ id: string }>('createDecision', { template })
    setCreating(null)
    if (res.success) navigate(`/decisions/${res.data.id}`)
    else setError(res.error)
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Your decisions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Private to your account. Saved automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void create('sample')} loading={creating === 'sample'} disabled={!!creating}>
            Try the sample
          </Button>
          <Button onClick={() => void create('blank')} loading={creating === 'blank'} disabled={!!creating}>
            {creating !== 'blank' && <Plus aria-hidden />}
            New decision
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6">
        {status === 'loading' ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">Loading your decisions…</p>
        ) : status === 'error' ? (
          <p role="alert" className="text-sm text-destructive">Could not load your decisions. Refresh to try again.</p>
        ) : records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <p className="font-display text-lg text-foreground">No decisions yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Start blank, or open the sample (fictional running watches with made-up scores) to see how it works.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {records.map((r) => {
              const doc = parseDecisionDoc(r.data.doc)
              const ranking = doc ? rankDecision(doc) : null
              const leader =
                doc && ranking?.valid
                  ? ranking.tie
                    ? 'Tie'
                    : optionLabel(doc, ranking.leaders[0])
                  : null
              return (
                <li key={r.recordId}>
                  <Link
                    to={`/decisions/${r.recordId}`}
                    className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {r.data.title?.trim() || 'Untitled decision'}
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {!doc && <Chip tone="bad">Unreadable</Chip>}
                      {doc?.sample && <Chip>Sample</Chip>}
                      {leader && <span>Leading: <span className="text-foreground">{leader}</span></span>}
                      {doc && <span>{doc.evidence.length} sources</span>}
                      <span>Updated {new Date(r.updatedAt).toLocaleDateString()}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
