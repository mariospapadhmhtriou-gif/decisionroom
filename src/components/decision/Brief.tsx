/**
 * The decision brief: AI draft (anthropic/chat-completion via a server
 * action), editable text, stale detection, and an explicit email preview.
 */

import { useState } from 'react'
import { Mail, RefreshCw, Sparkles } from 'lucide-react'
import { useUser } from 'deepspace'
import { callAction } from '@/lib/api'
import { LIMITS, composeEmail, fingerprint, inputsKey, type Brief as BriefData, type DecisionDoc } from '@/lib/decision'
import type { Ranking } from '@/lib/scoring'
import { Button, ConfirmModal, Modal } from '@/components/ui'
import { Chip, Panel } from './controls'

type Update = (fn: (d: DecisionDoc) => DecisionDoc) => void

export function Brief({
  id,
  doc,
  ranking,
  update,
  flush,
  hasUnsaved,
}: {
  id: string
  doc: DecisionDoc
  ranking: Ranking
  update: Update
  flush: () => Promise<boolean>
  hasUnsaved: boolean
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

  const brief = doc.brief
  const currentKey = inputsKey(doc)
  const stale = !!brief && brief.inputsKey !== currentKey
  const blocker = !doc.question.trim()
    ? 'Add a decision question first.'
    : !ranking.valid
      ? 'Give at least one criterion a weight first.'
      : null

  async function generate() {
    setConfirmReplace(false)
    if (generating || blocker) return
    setGenerating(true)
    setError(null)
    setNotice(null)
    const saved = await flush()
    if (!saved) {
      setGenerating(false)
      setError('Your latest changes are not saved yet, so the brief cannot use them. Resolve the save problem above and try again.')
      return
    }
    const startedKey = inputsKey(doc)
    const res = await callAction<{ brief: BriefData; droppedReferences: number }>('generateBrief', { id })
    setGenerating(false)
    if (!res.success) {
      setError(`${res.error}${brief ? ' Your existing brief was kept.' : ''}`)
      return
    }
    update((d) => ({ ...d, brief: res.data.brief }))
    const notes: string[] = []
    if (res.data.droppedReferences > 0) notes.push(`${res.data.droppedReferences} citation(s) to unknown sources were removed.`)
    if (res.data.brief.inputsKey !== startedKey) notes.push('Inputs changed while the brief was being written, so it is already marked out of date.')
    setNotice(notes.join(' ') || null)
  }

  function onGenerateClick() {
    if (brief?.edited) setConfirmReplace(true)
    else void generate()
  }

  function onEdit(text: string) {
    update((d) => ({
      ...d,
      brief: d.brief
        ? { ...d.brief, text, edited: true }
        : { text, inputsKey: inputsKey(d), generatedAt: '', model: 'manual', referenceIds: [], edited: true },
    }))
  }

  const status = !brief ? (
    <Chip>No brief yet</Chip>
  ) : stale ? (
    <Chip tone="warn">Out of date · inputs changed</Chip>
  ) : brief.edited ? (
    <Chip tone="neutral">Edited by you</Chip>
  ) : (
    <Chip tone="good">Up to date</Chip>
  )

  return (
    <Panel
      id="brief"
      title="Decision brief"
      description="AI drafts the prose from your saved inputs and evidence, and the app adds the ranking itself. Edit it freely."
      actions={status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onGenerateClick} disabled={generating || !!blocker} loading={generating}>
          {!generating && (brief ? <RefreshCw aria-hidden /> : <Sparkles aria-hidden />)}
          {generating ? 'Drafting brief…' : brief ? 'Regenerate with AI' : 'Draft brief with AI'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEmailOpen(true)}
          disabled={!brief?.text.trim() || generating}
        >
          <Mail aria-hidden />
          Preview &amp; email
        </Button>
        {blocker && <span className="text-xs text-muted-foreground">{blocker}</span>}
        {brief?.generatedAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            Drafted {new Date(brief.generatedAt).toLocaleString()} · {brief.model}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm text-amber-200">
          {notice}
        </p>
      )}
      {stale && !generating && (
        <p className="mt-3 text-sm text-amber-200/90">
          Scores, weights, options, constraints or evidence changed after this brief was drafted. Regenerate or review it before sending.
        </p>
      )}

      <label htmlFor="brief-text" className="sr-only">Brief text</label>
      <textarea
        id="brief-text"
        value={brief?.text ?? ''}
        onChange={(e) => onEdit(e.target.value)}
        readOnly={generating}
        maxLength={LIMITS.brief}
        placeholder={'Draft the brief with AI, or write your own.\n\nIt will include the calculated ranking, a recommendation (or an explicit tie), tradeoffs, cited saved sources, missing evidence, and open questions.'}
        className="font-display mt-4 min-h-[26rem] w-full resize-y rounded-lg border border-input bg-background/60 px-5 py-4 text-[15px] leading-[1.75] text-foreground placeholder:text-muted-foreground/70 read-only:opacity-60"
      />
      <p className="mt-1 text-right text-xs text-muted-foreground tabular">
        {(brief?.text.length ?? 0).toLocaleString()} / {LIMITS.brief.toLocaleString()}
      </p>

      <ConfirmModal
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        onConfirm={() => void generate()}
        title="Replace your edited brief?"
        description="Regenerating replaces the current text, including your edits."
        confirmText="Replace"
      />
      {emailOpen && (
        <EmailDialog id={id} doc={doc} stale={stale} hasUnsaved={hasUnsaved} flush={flush} onClose={() => setEmailOpen(false)} />
      )}
    </Panel>
  )
}

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; to: string; at: string }
  | { kind: 'error'; message: string; duplicate: boolean }

function EmailDialog({
  id,
  doc,
  stale,
  hasUnsaved,
  flush,
  onClose,
}: {
  id: string
  doc: DecisionDoc
  stale: boolean
  hasUnsaved: boolean
  flush: () => Promise<boolean>
  onClose: () => void
}) {
  const { user } = useUser()
  const [state, setState] = useState<SendState>({ kind: 'idle' })
  const email = composeEmail(doc)

  async function send(allowRepeat = false) {
    if (!email || state.kind === 'sending') return
    setState({ kind: 'sending' })
    if (!(await flush())) {
      setState({ kind: 'error', message: 'Your latest edits are not saved, so they cannot be sent. Fix the save problem first.', duplicate: false })
      return
    }
    const res = await callAction<{ to: string; sentAt: string }>('emailBrief', {
      id,
      expectedHash: fingerprint(email.text),
      allowRepeat,
    })
    if (res.success) setState({ kind: 'sent', to: res.data.to, at: res.data.sentAt })
    else setState({ kind: 'error', message: res.error, duplicate: res.code === 'duplicate' })
  }

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="flex min-h-0 flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Email this brief to yourself</h2>
          <p className="text-sm text-muted-foreground">This is exactly what will be sent. Nothing is sent until you press Send.</p>
        </div>
        {!email ? (
          <p className="text-sm text-muted-foreground">There is no brief to send.</p>
        ) : (
          <>
            <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">To</dt>
              <dd className="min-w-0 truncate text-foreground">
                {user?.email ?? 'your account email'}{' '}
                <span className="text-xs text-muted-foreground">(your sign-in address)</span>
              </dd>
              <dt className="text-muted-foreground">From</dt>
              <dd className="text-foreground">DeepSpace Apps &lt;notifications@updates.app.space&gt;</dd>
              <dt className="text-muted-foreground">Subject</dt>
              <dd className="min-w-0 break-words text-foreground">{email.subject}</dd>
            </dl>
            {(stale || hasUnsaved) && (
              <p className="rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm text-amber-200">
                {stale ? 'This brief is out of date: your inputs changed after it was drafted. ' : ''}
                {hasUnsaved ? 'Unsaved edits will be saved before sending.' : ''}
              </p>
            )}
            <pre className="font-display max-h-[45vh] min-h-0 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background/60 p-4 text-[14px] leading-relaxed text-foreground">
              {email.text}
            </pre>
          </>
        )}
        {state.kind === 'sent' && (
          <p role="status" className="rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">
            Accepted for delivery to {state.to} at {new Date(state.at).toLocaleTimeString()}. Check your inbox (and spam folder).
          </p>
        )}
        {state.kind === 'error' && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {state.kind === 'sent' ? 'Close' : 'Cancel'}
          </Button>
          {state.kind === 'error' && state.duplicate ? (
            <Button type="button" variant="outline" onClick={() => void send(true)}>
              Send again anyway
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void send()}
              disabled={!email || state.kind === 'sending' || state.kind === 'sent'}
              loading={state.kind === 'sending'}
            >
              {state.kind === 'sent' ? 'Sent' : state.kind === 'sending' ? 'Sending…' : 'Send to me'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
