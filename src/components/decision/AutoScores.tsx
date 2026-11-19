/**
 * Keeps the 1-5 option scores in step with the decision.
 *
 * Once the question, three options and three criteria have real names, AI
 * scores every option automatically, and re-scores after a pause whenever any
 * of them change. If the user changes a score, automatic scoring stops and the
 * bar offers a one-click rescore instead.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { callAction } from '@/lib/api'
import { criterionLabel, optionLabel, type DecisionDoc } from '@/lib/decision'
import {
  applyScores,
  needsAutoScores,
  readyToScore,
  scoresEditedByUser,
  scoresKey,
  scoresOutOfDate,
  type AutoScores,
} from '@/lib/autoscore'
import { Button } from '@/components/ui'

type Update = (fn: (d: DecisionDoc) => DecisionDoc) => void
const AUTO_DELAY_MS = 1500

export function useAutoScores(
  id: string,
  doc: DecisionDoc | null,
  docRef: MutableRefObject<DecisionDoc | null>,
  update: Update,
  flush: () => Promise<boolean>,
  blocked: boolean,
) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reasons, setReasons] = useState<string[][]>([])
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
        ? await callAction<AutoScores & { key: string }>('suggestScores', { id })
        : ({ success: false, error: 'Your latest changes are not saved yet.' } as const)
      inFlight.current = false
      setWorking(false)
      const current = docRef.current
      if (!current) return
      if (!res.success) {
        failedKey.current = scoresKey(current)
        setError(res.error)
        return
      }
      failedKey.current = null
      // Something changed while scoring? Skip; the next pause re-scores.
      if (res.data.key !== scoresKey(current)) return
      if (!manual && scoresEditedByUser(current)) return
      update((d) => applyScores(d, res.data, res.data.key))
      setReasons(res.data.reasons)
    },
    [id, flush, update, docRef],
  )

  const auto = doc ? needsAutoScores(doc) : false
  const key = doc ? scoresKey(doc) : ''
  useEffect(() => {
    if (!auto || blocked || working || failedKey.current === key) return
    const t = setTimeout(() => void run(false), AUTO_DELAY_MS)
    return () => clearTimeout(t)
  }, [auto, blocked, key, working, run])

  return { working, error, reasons, rescore: () => void run(true) }
}

export function ScoresBar({
  doc,
  working,
  error,
  reasons,
  rescore,
}: {
  doc: DecisionDoc
  working: boolean
  error: string | null
  reasons: string[][]
  rescore: () => void
}) {
  const ready = readyToScore(doc)
  const manual = scoresEditedByUser(doc)
  const current = !!doc.scoresFrom && doc.scoresFrom === scoresKey(doc)
  const outOfDate = scoresOutOfDate(doc)

  let message: string
  if (working) message = 'Scoring your options…'
  else if (error) message = error
  else if (!ready) message = 'Name your three options and AI will score them automatically.'
  else if (!manual && current) message = 'Scores were estimated by AI from general knowledge, not live research. Change any score; your edits are kept.'
  else if (!manual) message = 'Scores will update in a moment.'
  else if (outOfDate) message = 'Your options or criteria changed since these scores were set.'
  else message = 'Scores set by you.'

  const lines = reasons.flatMap((row, i) =>
    row.map((r, j) => (r ? `${optionLabel(doc, i)}, ${criterionLabel(doc, j)}: ${r}` : '')).filter(Boolean),
  )

  return (
    <div className="mb-4 rounded-lg border border-border bg-background/40 px-3 py-2.5" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Sparkles className={`size-4 shrink-0 ${working ? 'animate-pulse text-primary' : 'text-muted-foreground'}`} aria-hidden />
        <p className={`min-w-0 flex-1 text-[13px] ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p>
        {!working && ready && (manual || error || current) && (
          <Button type="button" size="sm" variant={outOfDate || error ? 'default' : 'outline'} onClick={rescore}>
            <RefreshCw aria-hidden />
            {error ? 'Try again' : manual ? 'Rescore with AI' : 'Rescore'}
          </Button>
        )}
      </div>
      {!manual && current && lines.length > 0 && !working && (
        <details className="mt-1.5 pl-7 text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Why these scores</summary>
          <ul className="mt-1 space-y-0.5">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
