/** One decision: question → comparison → result → evidence → brief. */

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { callAction } from '@/lib/api'
import { LIMITS, rankDecision } from '@/lib/decision'
import { useDecision, type SaveStatus } from '@/lib/useDecision'
import { Button, ConfirmModal } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Comparison } from '@/components/decision/Comparison'
import { Result } from '@/components/decision/Result'
import { Evidence } from '@/components/decision/Evidence'
import { Brief } from '@/components/decision/Brief'
import { OptionFinder } from '@/components/decision/OptionFinder'
import { CriteriaBar, useAutoCriteria } from '@/components/decision/AutoCriteria'
import { ScoresBar, useAutoScores } from '@/components/decision/AutoScores'
import { needsAutoCriteria } from '@/lib/criteria'
import { Chip, fieldClass } from '@/components/decision/controls'

export default function DecisionPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { doc, status, error, savedAt, update, flush, retry, resolveConflict, docRef } = useDecision(id)
  const autoCriteria = useAutoCriteria(id, doc, docRef, update, flush)
  // Score only after criteria have settled, so scores match the final criteria.
  const autoScores = useAutoScores(id, doc, docRef, update, flush, autoCriteria.working || (!!doc && needsAutoCriteria(doc)))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function onDelete() {
    setDeleting(true)
    const res = await callAction('deleteDecision', { id })
    setDeleting(false)
    setConfirmDelete(false)
    if (res.success) navigate('/decisions', { replace: true })
    else setDeleteError(res.error)
  }

  if (status === 'missing' || status === 'corrupt' || (!doc && status === 'error')) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-xl text-foreground">
          {status === 'corrupt' ? 'This decision could not be read' : status === 'missing' ? 'Decision not found' : 'Could not load'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status === 'corrupt'
            ? 'Its stored data is invalid, so it was not opened (nothing was overwritten).'
            : status === 'missing'
              ? 'It may have been deleted, or it belongs to another account.'
              : error}
        </p>
        <Link to="/decisions" className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline">
          Back to your decisions
        </Link>
      </div>
    )
  }

  if (!doc) {
    return <p className="px-6 py-16 text-center text-sm text-muted-foreground" aria-busy="true">Loading decision…</p>
  }

  const ranking = rankDecision(doc)
  const hasUnsaved = status === 'dirty' || status === 'saving' || status === 'error' || status === 'conflict'

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/decisions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Decisions
        </Link>
        <div className="flex items-center gap-2">
          <SaveIndicator status={status} savedAt={savedAt} />
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
            aria-label="Delete this decision"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {(status === 'error' || status === 'conflict' || deleteError) && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <span className="min-w-0 flex-1 text-destructive">
            {deleteError ?? error}
            {status === 'conflict' && ' Choose which version to keep.'}
            {status === 'error' && ' Your edits are kept in this tab.'}
          </span>
          {status === 'error' && (
            <Button size="sm" variant="outline" onClick={() => void retry()}>Retry save</Button>
          )}
          {status === 'conflict' && (
            <>
              <Button size="sm" variant="outline" onClick={() => resolveConflict('saved')}>Load saved version</Button>
              <Button size="sm" onClick={() => resolveConflict('mine')}>Keep this tab’s version</Button>
            </>
          )}
        </div>
      )}

      {/* Question + constraints */}
      <section aria-label="Decision" className="mt-4">
        <div className="flex items-center gap-2">
          <label htmlFor="question" className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Decision question
          </label>
          {doc.sample && <Chip>Sample · fictional data</Chip>}
        </div>
        <textarea
          id="question"
          rows={1}
          value={doc.question}
          maxLength={LIMITS.question}
          placeholder="What are you deciding?"
          ref={autoGrow}
          onChange={(e) => {
            autoGrow(e.target)
            update((d) => ({ ...d, question: e.target.value.replace(/\s*\n\s*/g, ' ') }))
          }}
          className="font-display mt-1 block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-0 py-1 text-[24px] leading-tight text-foreground placeholder:text-muted-foreground/60 hover:border-input focus:border-input focus:px-2 sm:text-[30px]"
        />
        <label htmlFor="constraints" className="mt-3 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Constraints &amp; budget
        </label>
        <textarea
          id="constraints"
          value={doc.constraints}
          maxLength={LIMITS.constraints}
          rows={2}
          placeholder="For example: budget under $300, must work with iPhone, needed by March."
          onChange={(e) => update((d) => ({ ...d, constraints: e.target.value }))}
          className={cn(fieldClass, 'mt-1 resize-y')}
        />
      </section>

      <div className="mt-5">
        <OptionFinder id={id} doc={doc} update={update} flush={flush} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Comparison doc={doc} ranking={ranking} update={update} criteriaBar={
            <>
              <CriteriaBar doc={doc} {...autoCriteria} />
              <ScoresBar doc={doc} {...autoScores} />
            </>
          }
        />
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Result doc={doc} ranking={ranking} />
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <Evidence id={id} doc={doc} update={update} />
        <Brief id={id} doc={doc} ranking={ranking} update={update} flush={flush} hasUnsaved={hasUnsaved} />
      </div>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void onDelete()}
        title="Delete this decision?"
        description="This permanently deletes the decision, its evidence and its brief. It cannot be undone."
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
      />
    </div>
  )
}

/** Grow a textarea to fit its content (long questions wrap instead of clipping). */
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function SaveIndicator({ status, savedAt }: { status: SaveStatus; savedAt: Date | null }) {
  const map: Record<SaveStatus, { text: string; tone: 'neutral' | 'gold' | 'warn' | 'bad' | 'good' }> = {
    loading: { text: 'Loading…', tone: 'neutral' },
    saved: { text: savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Saved', tone: 'neutral' },
    dirty: { text: 'Unsaved changes', tone: 'warn' },
    saving: { text: 'Saving…', tone: 'neutral' },
    error: { text: 'Not saved', tone: 'bad' },
    conflict: { text: 'Save conflict', tone: 'bad' },
    missing: { text: 'Not found', tone: 'bad' },
    corrupt: { text: 'Unreadable', tone: 'bad' },
  }
  const { text, tone } = map[status]
  return (
    <span role="status" aria-live="polite">
      <Chip tone={tone}>{text}</Chip>
    </span>
  )
}
