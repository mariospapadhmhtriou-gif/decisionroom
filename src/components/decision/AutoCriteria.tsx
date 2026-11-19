/**
 * Keeps criteria and weights in step with the question and constraints.
 *
 * - While the criteria are AI-generated (or still placeholders), a pause in
 *   typing the question or constraints regenerates them automatically.
 * - Once the user edits a criterion or weight, automatic updates stop; the
 *   bar offers a one-click update instead, so the user's choices are never
 *   silently replaced.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { callAction } from '@/lib/api'
import type { DecisionDoc } from '@/lib/decision'
import {
  applyCriteria,
  criteriaEditedByUser,
  criteriaOutOfDate,
  needsAutoCriteria,
  promptKey,
  type SuggestedCriterion,
} from '@/lib/criteria'
import { Button } from '@/components/ui'

type Update = (fn: (d: DecisionDoc) => DecisionDoc) => void
const AUTO_DELAY_MS = 1500

export function useAutoCriteria(
  id: string,
  doc: DecisionDoc | null,
  docRef: MutableRefObject<DecisionDoc | null>,
  update: Update,
  flush: () => Promise<boolean>,
) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reasons, setReasons] = useState<string[]>([])
  const inFlight = useRef(false)
  const failedKey = useRef<string | null>(null)

  const run = useCallback(
    async (manual: boolean) => {
      if (inFlight.current) return
      inFlight.current = true
      setWorking(true)
      setError(null)
      const saved = await flush()
      const res = saved
        ? await callAction<{ criteria: SuggestedCriterion[]; key: string }>('suggestCriteria', { id })
        : ({ success: false, error: 'Your latest changes are not saved yet.' } as const)
      inFlight.current = false
      setWorking(false)
      const current = docRef.current
      if (!current) return
      if (!res.success) {
        failedKey.current = promptKey(current)
        setError(res.error)
        return
      }
      failedKey.current = null
      // Typed more while waiting? Skip; the next pause triggers a fresh run.
      if (res.data.key !== promptKey(current)) return
      if (!manual && criteriaEditedByUser(current)) return
      update((d) => applyCriteria(d, res.data.criteria, res.data.key))
      setReasons(res.data.criteria.map((c) => (c.why ? `${c.name}: ${c.why}` : '')).filter(Boolean))
    },
    [id, flush, update, docRef],
  )

  const auto = doc ? needsAutoCriteria(doc) : false
  const key = doc ? promptKey(doc) : ''
  useEffect(() => {
    if (!auto || working || failedKey.current === key) return
    const t = setTimeout(() => void run(false), AUTO_DELAY_MS)
    return () => clearTimeout(t)
  }, [auto, key, working, run])

  return { working, error, reasons, regenerate: () => void run(true) }
}

export function CriteriaBar({
  doc,
  working,
  error,
  reasons,
  regenerate,
}: {
  doc: DecisionDoc
  working: boolean
  error: string | null
  reasons: string[]
  regenerate: () => void
}) {
  const fromAi = !!doc.criteriaFrom && doc.criteriaFrom === promptKey(doc)
  const outOfDate = criteriaOutOfDate(doc)
  const tooShort = doc.question.trim().length < 8

  let message: string
  if (working) message = 'Updating criteria and weights from your question…'
  else if (error) message = error
  else if (fromAi) message = 'Criteria and weights were set by AI from your question and constraints. Change anything you like; your edits are kept.'
  else if (outOfDate) message = 'Your question or constraints changed since you set these criteria.'
  else if (tooShort) message = 'Write your question and the criteria and weights will fill in automatically.'
  else message = 'Criteria and weights set by you.'

  return (
    <div className="mb-4 rounded-lg border border-border bg-background/40 px-3 py-2.5" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Sparkles className={`size-4 shrink-0 ${working ? 'animate-pulse text-primary' : 'text-muted-foreground'}`} aria-hidden />
        <p className={`min-w-0 flex-1 text-[13px] ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p>
        {!working && !tooShort && (
          <Button type="button" size="sm" variant={outOfDate || error ? 'default' : 'outline'} onClick={regenerate}>
            <RefreshCw aria-hidden />
            {outOfDate ? 'Update from question' : error ? 'Try again' : fromAi ? 'Regenerate' : 'Suggest from question'}
          </Button>
        )}
      </div>
      {fromAi && reasons.length > 0 && !working && (
        <details className="mt-1.5 pl-7 text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Why these criteria</summary>
          <ul className="mt-1 space-y-0.5">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
