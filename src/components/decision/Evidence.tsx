/**
 * Evidence: explicit web search (exa/search via a server action), user picks
 * which result to save and to which option, plus notes and removal.
 */

import { useState, type FormEvent } from 'react'
import { ExternalLink, Search, Trash2 } from 'lucide-react'
import { callAction } from '@/lib/api'
import {
  LIMITS,
  nextEvidenceId,
  optionLabel,
  type DecisionDoc,
  type Evidence as EvidenceItem,
} from '@/lib/decision'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Chip, Panel, fieldClass, hostOf } from './controls'

type Update = (fn: (d: DecisionDoc) => DecisionDoc) => void
interface SearchResult {
  title: string
  url: string
  snippet: string
  publishedDate: string | null
}

export function Evidence({ id, doc, update }: { id: string; doc: DecisionDoc; update: Update }) {
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState(0)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [lastQuery, setLastQuery] = useState('')

  const full = doc.evidence.length >= LIMITS.evidence
  const savedUrls = new Set(doc.evidence.map((e) => `${e.optionIndex}|${e.url}`))

  async function onSearch(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q.length < 2 || searching) return
    setSearching(true)
    setError(null)
    const res = await callAction<{ query: string; results: SearchResult[] }>('searchEvidence', { id, query: q })
    setSearching(false)
    if (!res.success) {
      setError(res.error)
      return
    }
    setLastQuery(res.data.query)
    setResults(res.data.results)
  }

  function save(r: SearchResult) {
    update((d) => {
      if (d.evidence.length >= LIMITS.evidence) return d
      const item: EvidenceItem = {
        id: nextEvidenceId(d.evidence),
        optionIndex: target,
        title: r.title.slice(0, LIMITS.evidenceTitle),
        url: r.url,
        snippet: r.snippet.slice(0, LIMITS.evidenceSnippet),
        note: '',
        savedAt: new Date().toISOString(),
      }
      return { ...d, evidence: [...d.evidence, item] }
    })
  }

  const setNote = (eid: string, note: string) =>
    update((d) => ({ ...d, evidence: d.evidence.map((x) => (x.id === eid ? { ...x, note } : x)) }))
  const remove = (eid: string) => update((d) => ({ ...d, evidence: d.evidence.filter((x) => x.id !== eid) }))

  return (
    <Panel
      id="evidence"
      title="Evidence"
      description="Search the web, then save the results you trust to an option. Snippets are excerpts from search results, not verified sources."
      actions={<Chip>{doc.evidence.length}/{LIMITS.evidence} saved</Chip>}
    >
      <form onSubmit={onSearch} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]" role="search">
        <label className="sr-only" htmlFor="evidence-query">Search query</label>
        <input
          id="evidence-query"
          value={query}
          maxLength={LIMITS.searchQuery}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`e.g. ${optionLabel(doc, target)} review`}
          className={fieldClass}
        />
        <label className="sr-only" htmlFor="evidence-target">Save results to option</label>
        <select
          id="evidence-target"
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className={cn(fieldClass, 'cursor-pointer sm:w-48')}
        >
          {doc.options.map((_, i) => (
            <option key={i} value={i}>
              Save to: {optionLabel(doc, i)}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={searching || query.trim().length < 2} loading={searching} variant="secondary">
          {!searching && <Search aria-hidden />}
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {results && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {results.length} result{results.length === 1 ? '' : 's'} for “{lastQuery}”
            </p>
            <button type="button" onClick={() => setResults(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Clear results
            </button>
          </div>
          {results.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No results. Try a more specific query.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {results.map((r) => {
                const already = savedUrls.has(`${target}|${r.url}`)
                return (
                  <li key={r.url} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {r.title}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {hostOf(r.url)}
                        {r.publishedDate && ` · ${r.publishedDate}`}
                      </p>
                      {r.snippet && <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{r.snippet}</p>}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={already || full}
                      onClick={() => save(r)}
                      className="shrink-0"
                    >
                      {already ? 'Saved' : `Save to ${optionLabel(doc, target)}`}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          {full && <p className="mt-2 text-xs text-amber-300">Evidence limit reached. Remove an item to save more.</p>}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {doc.options.map((_, i) => {
          const items = doc.evidence.filter((e) => e.optionIndex === i)
          return (
            <div key={i} className="min-w-0">
              <h3 className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                <span className="truncate">{optionLabel(doc, i)}</span>
                <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
              </h3>
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-[13px] text-muted-foreground">
                  No evidence saved yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {items.map((e) => (
                    <li key={e.id} className="rounded-lg border border-border bg-background/40 p-3">
                      <div className="flex items-start gap-2">
                        <Chip tone="gold">{e.id}</Chip>
                        <div className="min-w-0 flex-1">
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="line-clamp-2 text-[13px] font-medium text-foreground underline-offset-2 hover:underline"
                          >
                            {e.title || e.url}
                            <ExternalLink className="ml-1 inline size-3 text-muted-foreground" aria-hidden />
                          </a>
                          <p className="text-xs text-muted-foreground">{hostOf(e.url)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(e.id)}
                          aria-label={`Remove source ${e.id}`}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                      {e.snippet && (
                        <p className="mt-2 line-clamp-4 border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
                          {e.snippet}
                        </p>
                      )}
                      <label className="mt-2 block text-xs text-muted-foreground" htmlFor={`note-${e.id}`}>
                        Your note
                      </label>
                      <textarea
                        id={`note-${e.id}`}
                        value={e.note}
                        maxLength={LIMITS.evidenceNote}
                        onChange={(ev) => setNote(e.id, ev.target.value)}
                        rows={2}
                        placeholder="What does this tell you?"
                        className={cn(fieldClass, 'mt-1 resize-y text-[13px]')}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
