/**
 * Load one decision over the realtime record subscription and save edits
 * through the `saveDecision` action with optimistic concurrency.
 *
 * - Reads come from `useQuery('decisions')`; the record room only sends
 *   records the caller owns (schema `read: 'own'`).
 * - Edits apply locally at once, then save after a short debounce. Only one
 *   save is in flight at a time; edits made meanwhile are saved right after.
 * - If another tab saved first, the server answers `conflict` and the user
 *   chooses which version to keep. Nothing is overwritten silently.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from 'deepspace'
import { callAction } from './api'
import { parseDecisionDoc, type DecisionDoc, type DecisionRecordData } from './decision'

export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'missing' | 'corrupt'

const SAVE_DEBOUNCE_MS = 700

export function useDecision(id: string) {
  const { records, status: queryStatus } = useQuery<DecisionRecordData>('decisions')
  const record = records.find((r) => r.recordId === id)

  const [doc, setDocState] = useState<DecisionDoc | null>(null)
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const docRef = useRef<DecisionDoc | null>(null)
  const revisionRef = useRef(0)
  const conflictRevisionRef = useRef<number | null>(null)
  const dirtyRef = useRef(false)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const remoteRevision = record ? Number(record.data.revision) : null
  const remoteDoc = record?.data.doc

  // Adopt the server copy on first load, or when another tab saved and we
  // have nothing unsaved locally.
  useEffect(() => {
    if (remoteRevision === null || remoteDoc === undefined) return
    const first = docRef.current === null
    const newerRemote = remoteRevision > revisionRef.current
    if (!first && !(newerRemote && !dirtyRef.current && !inFlightRef.current)) return
    const parsed = parseDecisionDoc(remoteDoc)
    if (!parsed) {
      setStatus('corrupt')
      return
    }
    docRef.current = parsed
    revisionRef.current = remoteRevision
    setDocState(parsed)
    setStatus('saved')
  }, [remoteRevision, remoteDoc])

  useEffect(() => {
    if (queryStatus === 'ready' && !record && docRef.current === null) setStatus('missing')
    if (queryStatus === 'error' && docRef.current === null) {
      setStatus('error')
      setError('Could not load your decisions.')
    }
  }, [queryStatus, record])

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (inFlightRef.current) {
      await inFlightRef.current
      return dirtyRef.current ? flush() : true
    }
    if (!dirtyRef.current) return true
    if (conflictRevisionRef.current !== null) return false

    const run = (async () => {
      const sending = docRef.current
      dirtyRef.current = false
      setStatus('saving')
      const res = await callAction<{ revision: number }>('saveDecision', {
        id,
        baseRevision: revisionRef.current,
        doc: sending,
      })
      if (res.success) {
        revisionRef.current = res.data.revision
        setError(null)
        setSavedAt(new Date())
        setStatus(dirtyRef.current ? 'dirty' : 'saved')
        return true
      }
      dirtyRef.current = true
      if (res.code === 'conflict') {
        conflictRevisionRef.current = Number(res.details?.revision ?? NaN)
        setStatus('conflict')
      } else {
        setStatus('error')
      }
      setError(res.error)
      return false
    })()
    inFlightRef.current = run
    const ok = await run
    inFlightRef.current = null
    if (ok && dirtyRef.current) return flush()
    return ok
  }, [id])

  const update = useCallback(
    (fn: (current: DecisionDoc) => DecisionDoc) => {
      const current = docRef.current
      if (!current) return
      const next = fn(current)
      docRef.current = next
      setDocState(next)
      dirtyRef.current = true
      if (conflictRevisionRef.current === null) {
        setStatus((s) => (s === 'saving' ? s : 'dirty'))
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
      }
    },
    [flush],
  )

  /** Conflict resolution: keep this tab's version (overwrite) or load the saved one. */
  const resolveConflict = useCallback(
    (keep: 'mine' | 'saved') => {
      const conflictRevision = conflictRevisionRef.current
      conflictRevisionRef.current = null
      if (keep === 'mine' && conflictRevision !== null && Number.isFinite(conflictRevision)) {
        revisionRef.current = conflictRevision
        dirtyRef.current = true
        void flush()
        return
      }
      dirtyRef.current = false
      const parsed = remoteDoc ? parseDecisionDoc(remoteDoc) : null
      if (parsed && remoteRevision !== null) {
        docRef.current = parsed
        revisionRef.current = remoteRevision
        setDocState(parsed)
        setStatus('saved')
        setError(null)
      }
    },
    [flush, remoteDoc, remoteRevision],
  )

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || inFlightRef.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { doc, status, error, savedAt, update, flush, retry: flush, resolveConflict, docRef }
}
