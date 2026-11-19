/**
 * DecisionRoom server actions, the only write path for decisions.
 *
 * Every action receives a VERIFIED `userId` from the action route
 * (src/server/action-routes.ts). Action tools bypass record RBAC, so each
 * action below re-checks that the target decision belongs to the caller
 * before reading or writing it. Client-supplied IDs are never trusted alone.
 *
 * Integrations (all billed to the app owner, all sign-in required):
 *   exa/search, evidence search (explicit user action)
 *   anthropic/chat-completion, brief drafting
 *   email/send, send the brief to the caller's own address
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import { decodeJwtPayload } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  LIMITS,
  normalizeAiBrief,
  noDashes,
  blankDecision,
  composeBriefText,
  composeEmail,
  decisionDocSchema,
  extractJsonObject,
  fingerprint,
  inputsKey,
  isSafeHttpUrl,
  parseDecisionDoc,
  rankDecision,
  sampleDecision,
  validateReferences,
  type AiBrief,
  type Brief,
  type DecisionDoc,
  type DecisionRecordData,
} from '../lib/decision'
import { BRIEF_MODEL, BRIEF_SYSTEM_PROMPT, buildBriefUserMessage } from '../lib/brief-prompt'
import {
  SUGGEST_SEARCH_RESULTS,
  SUGGEST_SYSTEM_PROMPT,
  buildSuggestQuery,
  buildSuggestUserMessage,
  normalizeSuggestion,
  type SearchHit,
} from '../lib/suggest'
import { CRITERIA_SYSTEM_PROMPT, MIN_QUESTION_FOR_CRITERIA, buildCriteriaUserMessage, normalizeCriteria, promptKey } from '../lib/criteria'

type Result = ActionResult<unknown>
const fail = (error: string, code?: string): Result => ({ success: false, error, code })

const MAX_DOC_BYTES = 64_000
const RATE_LIMITS = {
  search: { max: 30, windowMs: 60 * 60 * 1000, label: '30 searches per hour' },
  brief: { max: 10, windowMs: 60 * 60 * 1000, label: '10 brief generations per hour' },
  suggest: { max: 10, windowMs: 60 * 60 * 1000, label: '10 option searches per hour' },
  criteria: { max: 40, windowMs: 60 * 60 * 1000, label: '40 criteria suggestions per hour' },
  email: { max: 5, windowMs: 24 * 60 * 60 * 1000, label: '5 emails per day' },
} as const
const EMAIL_DUPLICATE_WINDOW_MS = 10 * 60 * 1000

function asId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null
}

/** Load a decision and prove the caller owns it. */
async function loadOwned(
  tools: ActionTools,
  userId: string,
  rawId: unknown,
): Promise<{ ok: true; id: string; data: DecisionRecordData; doc: DecisionDoc } | { ok: false; res: Result }> {
  const id = asId(rawId)
  if (!id) return { ok: false, res: fail('Invalid decision id.', 'invalid_id') }
  const got = await tools.get<DecisionRecordData>('decisions', id)
  // Same answer for "missing" and "someone else's" so IDs can't be probed.
  if (!got.success || got.data.record.data.ownerId !== userId || got.data.record.createdBy !== userId) {
    return { ok: false, res: fail('Decision not found.', 'not_found') }
  }
  const doc = parseDecisionDoc(got.data.record.data.doc)
  if (!doc) return { ok: false, res: fail('This decision could not be read (stored data is invalid).', 'corrupt') }
  return { ok: true, id, data: got.data.record.data, doc }
}

async function recentEvents(tools: ActionTools, userId: string, kind: string, windowMs: number) {
  const q = await tools.query<{ ownerId: string; kind: string; detail: string; atMs: number }>(
    'usage_events',
    { where: { ownerId: userId, kind }, orderBy: 'createdAt', orderDir: 'desc', limit: 60 },
  )
  if (!q.success) return null
  const since = Date.now() - windowMs
  return q.data.records.filter((r) => Number(r.data.atMs) >= since)
}

async function checkRate(tools: ActionTools, userId: string, kind: keyof typeof RATE_LIMITS) {
  const limit = RATE_LIMITS[kind]
  const events = await recentEvents(tools, userId, kind, limit.windowMs)
  if (!events) return fail('Could not check usage limits. Try again.', 'rate_check_failed')
  if (events.length >= limit.max) return fail(`Limit reached (${limit.label}). Try again later.`, 'rate_limited')
  return null
}

function logEvent(tools: ActionTools, userId: string, kind: string, detail = '') {
  return tools.create('usage_events', { ownerId: userId, kind, detail: detail.slice(0, 200), atMs: Date.now() })
}

/** Search highlights arrive as markdown fragments; keep plain prose. */
function plainSnippet(value: unknown): string {
  if (typeof value !== 'string') return ''
  return noDashes(value)
    .replace(/^\s*\.{3}\s*$/gm, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/#{2,6}\s*/g, '')
    .replace(/[*_`]{1,3}/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export const actions: Record<string, ActionHandler<Env>> = {
  /** Create a decision owned by the caller (sample or blank). */
  createDecision: async ({ userId, params, tools }) => {
    const existing = await tools.query('decisions', { where: { ownerId: userId }, limit: LIMITS.decisionsPerUser + 1 })
    if (!existing.success) return fail('Could not check your decisions. Try again.')
    if (existing.data.records.length >= LIMITS.decisionsPerUser) {
      return fail(`You can keep up to ${LIMITS.decisionsPerUser} decisions. Delete one first.`, 'limit')
    }
    const doc = params.template === 'blank' ? blankDecision() : sampleDecision()
    const created = await tools.create<DecisionRecordData>('decisions', {
      ownerId: userId,
      title: doc.question,
      doc: JSON.stringify(doc),
      revision: 1,
    })
    if (!created.success) return fail('Could not create the decision.')
    return { success: true, data: { id: created.data.recordId } }
  },

  /**
   * Save the full document with optimistic concurrency: the write succeeds
   * only if `baseRevision` matches the stored revision.
   */
  saveDecision: async ({ userId, params, tools }) => {
    const owned = await loadOwned(tools, userId, params.id)
    if (!owned.ok) return owned.res
    const baseRevision = params.baseRevision
    if (typeof baseRevision !== 'number' || !Number.isInteger(baseRevision)) {
      return fail('Missing base revision.', 'invalid')
    }
    if (baseRevision !== owned.data.revision) {
      return {
        success: false,
        error: 'This decision was changed in another tab or window.',
        code: 'conflict',
        details: { revision: owned.data.revision },
      }
    }
    const raw = JSON.stringify(params.doc ?? null)
    if (raw.length > MAX_DOC_BYTES) return fail('Decision is too large to save.', 'too_large')
    const parsed = decisionDocSchema.safeParse(params.doc)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return fail(`Invalid input at ${issue?.path.join('.') || 'document'}: ${issue?.message ?? 'rejected'}`, 'invalid')
    }
    const revision = owned.data.revision + 1
    const updated = await tools.update<DecisionRecordData>('decisions', owned.id, {
      title: parsed.data.question.slice(0, LIMITS.question),
      doc: JSON.stringify(parsed.data),
      revision,
    })
    if (!updated.success) return fail('Save failed on the server. Your changes are still in this tab.')
    return { success: true, data: { revision } }
  },

  deleteDecision: async ({ userId, params, tools }) => {
    const owned = await loadOwned(tools, userId, params.id)
    if (!owned.ok) return owned.res
    const removed = await tools.remove('decisions', owned.id)
    if (!removed.success) return fail('Could not delete the decision.')
    return { success: true, data: { id: owned.id } }
  },

  /**
   * Suggest three criteria and weights from the SAVED question and constraints.
   * Returns them with the prompt fingerprint they were based on; the client
   * applies them only if the question has not changed and the user has not
   * edited criteria in the meantime.
   */
  suggestCriteria: async ({ userId, params, tools }) => {
    const owned = await loadOwned(tools, userId, params.id)
    if (!owned.ok) return owned.res
    const doc = owned.doc
    if (doc.question.trim().length < MIN_QUESTION_FOR_CRITERIA) return fail('Write a little more of your question first.', 'invalid')
    const limited = await checkRate(tools, userId, 'criteria')
    if (limited) return limited
    const res = await tools.integration<Record<string, unknown>>('anthropic/chat-completion', {
      model: BRIEF_MODEL,
      max_tokens: 3000,
      temperature: 0.2,
      system: CRITERIA_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildCriteriaUserMessage(doc) }],
    })
    await logEvent(tools, userId, 'criteria', owned.id)
    if (!res.success) {
      return fail(res.code === 'insufficient_credits' ? 'AI is unavailable: the app is out of credits.' : `AI request failed: ${res.error}`, res.code)
    }
    const body = res.data as { content?: Array<{ type?: string; text?: string }>; stop_reason?: string }
    const text = (Array.isArray(body.content) ? body.content : []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
    let criteria = null
    try {
      criteria = normalizeCriteria(extractJsonObject(text))
    } catch {
      criteria = null
    }
    if (!criteria) {
      console.warn(`[suggestCriteria] unusable model output stop=${body.stop_reason} textLen=${text.length}`)
      return fail('The AI could not suggest criteria this time. Your criteria were not changed.', 'bad_output')
    }
    return { success: true, data: { criteria, key: promptKey(doc) } }
  },

  /**
   * AI option finder: search the web from the SAVED question and constraints,
   * then ask the model for three options with suggested scores per criterion.
   * Returns a proposal only; the user reviews it and applies it via saveDecision.
   */
  suggestOptions: async ({ userId, params, tools }) => {
    const owned = await loadOwned(tools, userId, params.id)
    if (!owned.ok) return owned.res
    const doc = owned.doc
    if (doc.question.trim().length < 5) return fail('Write your decision question first, for example "Which laptop should I buy?".', 'invalid')
    if (!rankDecision(doc).valid) return fail('Give at least one criterion a weight above zero first.', 'invalid')
    const limited = await checkRate(tools, userId, 'suggest')
    if (limited) return limited

    const query = buildSuggestQuery(doc)
    const search = await tools.integration<{ results?: Array<Record<string, unknown>> }>('exa/search', {
      query,
      numResults: SUGGEST_SEARCH_RESULTS,
      type: 'auto',
      contents: { highlights: { numSentences: 3, highlightsPerUrl: 2 } },
    })
    await logEvent(tools, userId, 'suggest', query)
    if (!search.success) {
      return fail(search.code === 'insufficient_credits' ? 'Search is unavailable: the app is out of credits.' : `Search failed: ${search.error}`, search.code)
    }
    const hits: SearchHit[] = (search.data.results ?? [])
      .map((r) => {
        const url = typeof r.url === 'string' ? r.url : ''
        const highlights = Array.isArray(r.highlights) ? r.highlights : []
        return {
          id: '',
          title: clip(r.title, LIMITS.evidenceTitle) || url,
          url,
          snippet: clip(plainSnippet(highlights.join(' ') || r.text || ''), LIMITS.evidenceSnippet),
        }
      })
      .filter((h) => h.url.length <= LIMITS.evidenceUrl && isSafeHttpUrl(h.url))
      .slice(0, SUGGEST_SEARCH_RESULTS)
      .map((h, i) => ({ ...h, id: `R${i + 1}` }))
    if (hits.length === 0) return fail('The web search found nothing for this question. Try rewording the question or constraints.', 'no_results')

    const res = await tools.integration<Record<string, unknown>>('anthropic/chat-completion', {
      model: BRIEF_MODEL,
      max_tokens: 6000,
      temperature: 0.2,
      system: SUGGEST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildSuggestUserMessage(doc, hits) }],
    })
    if (!res.success) {
      return fail(res.code === 'insufficient_credits' ? 'AI is unavailable: the app is out of credits.' : `AI request failed: ${res.error}`, res.code)
    }
    const body = res.data as { content?: Array<{ type?: string; text?: string }>; stop_reason?: string }
    const blocks = Array.isArray(body.content) ? body.content : []
    const text = blocks.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
    let suggestion = null
    try {
      suggestion = normalizeSuggestion(extractJsonObject(text), hits, query)
    } catch {
      suggestion = null
    }
    if (!suggestion) {
      console.warn(`[suggestOptions] unusable model output stop=${body.stop_reason} textLen=${text.length}`)
      return fail('The AI could not produce three usable options. Nothing was changed; try again or adjust your constraints.', 'bad_output')
    }
    return { success: true, data: { suggestion } }
  },

  /** Web search for evidence. Results are returned, not saved, the user picks. */
  searchEvidence: async ({ userId, params, tools }) => {
    const owned = await loadOwned(tools, userId, params.id)
    if (!owned.ok) return owned.res
    const query = clip(params.query, LIMITS.searchQuery + 1)
    if (query.length < 2) return fail('Enter a search query.', 'invalid')
    if (query.length > LIMITS.searchQuery) return fail(`Keep the query under ${LIMITS.searchQuery} characters.`, 'invalid')
    const limited = await checkRate(tools, userId, 'search')
    if (limited) return limited

    const res = await tools.integration<{ results?: Array<Record<string, unknown>> }>('exa/search', {
      query,
      numResults: LIMITS.searchResults,
      type: 'auto',
      contents: { highlights: { numSentences: 2, highlightsPerUrl: 1 } },
    })
    await logEvent(tools, userId, 'search', query)
    if (!res.success) {
      return fail(res.code === 'insufficient_credits' ? 'Search is unavailable: the app is out of credits.' : `Search failed: ${res.error}`, res.code)
    }
    const results = (res.data.results ?? [])
      .map((r) => {
        const url = typeof r.url === 'string' ? r.url : ''
        const highlights = Array.isArray(r.highlights) ? r.highlights : []
        const snippet = clip(plainSnippet(highlights[0] ?? r.text ?? ''), LIMITS.evidenceSnippet)
        return {
          title: clip(r.title, LIMITS.evidenceTitle) || url,
          url,
          snippet,
          publishedDate: typeof r.publishedDate === 'string' ? r.publishedDate.slice(0, 10) : null,
        }
      })
      .filter((r) => r.url.length <= LIMITS.evidenceUrl && isSafeHttpUrl(r.url))
      .slice(0, LIMITS.searchResults)
    return { success: true, data: { query, results } }
  },

  /**
   * Draft a brief from the SAVED decision (not client-sent data). Returns the
   * brief; the client stores it through saveDecision so concurrent edits are
   * never overwritten by a slow generation.
   */
  generateBrief: async ({ userId, params, tools }) => {
    const owned = await loadOwned(tools, userId, params.id)
    if (!owned.ok) return owned.res
    const doc = owned.doc
    if (!doc.question.trim()) return fail('Add a decision question before generating a brief.', 'invalid')
    if (!rankDecision(doc).valid) return fail('Give at least one criterion a weight above zero first.', 'invalid')
    const limited = await checkRate(tools, userId, 'brief')
    if (limited) return limited

    const res = await tools.integration<Record<string, unknown>>(
      'anthropic/chat-completion',
      {
        model: BRIEF_MODEL,
        max_tokens: 6000,
        temperature: 0.2,
        system: BRIEF_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildBriefUserMessage(doc) }],
      },
    )
    await logEvent(tools, userId, 'brief', owned.id)
    if (!res.success) {
      return fail(res.code === 'insufficient_credits' ? 'AI is unavailable: the app is out of credits.' : `AI generation failed: ${res.error}`, res.code)
    }
    const body = res.data as { content?: Array<{ type?: string; text?: string }>; stop_reason?: string }
    const blocks = Array.isArray(body.content) ? body.content : []
    const text = blocks.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
    let ai: AiBrief | null = null
    let stage = 'json'
    try {
      const json = extractJsonObject(text)
      stage = 'shape'
      ai = normalizeAiBrief(json)
    } catch {
      ai = null
    }
    if (!ai) {
      // Diagnostics only, never log the model text or user content.
      console.warn(
        `[generateBrief] unusable model output stage=${stage} stop=${body.stop_reason} ` +
          `blocks=${blocks.map((b) => b.type).join(',')} textLen=${text.length} keys=${Object.keys(res.data ?? {}).join(',')}`,
      )
      return fail(
        body.stop_reason === 'max_tokens'
          ? 'The AI response was cut off before it finished. Your existing brief was kept; try again.'
          : 'The AI response was not in the expected format. Your existing brief was kept; try again.',
        'bad_output',
      )
    }
    const { kept, dropped } = validateReferences(ai, doc.evidence)
    const brief: Brief = {
      text: composeBriefText(doc, ai, kept, dropped).slice(0, LIMITS.brief),
      inputsKey: inputsKey(doc),
      generatedAt: new Date().toISOString(),
      model: BRIEF_MODEL,
      referenceIds: [...new Set(kept.map((k) => k.sourceId.trim()))],
      edited: false,
    }
    return { success: true, data: { brief, droppedReferences: dropped, basedOnRevision: owned.data.revision } }
  },

  /**
   * Email the SAVED brief to the caller's own verified address. Duplicate
   * sends of identical content within 10 minutes need `allowRepeat`.
   * The email provider exposes no idempotency key here, so this is
   * best-effort duplicate protection, not exactly-once delivery.
   */
  emailBrief: async ({ userId, params, tools, callerJwt }) => {
    const owned = await loadOwned(tools, userId, params.id)
    if (!owned.ok) return owned.res
    const email = composeEmail(owned.doc)
    if (!email) return fail('There is no saved brief to send.', 'invalid')

    let to = ''
    const user = await tools.get<{ email?: string }>('users', userId)
    if (user.success && typeof user.data.record.data.email === 'string') to = user.data.record.data.email
    if (!to) {
      const claims = decodeJwtPayload(callerJwt) as { email?: unknown; email_verified?: unknown } | null
      if (claims && typeof claims.email === 'string') to = claims.email
    }
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) {
      return fail('Your account has no email address we can send to.', 'no_email')
    }
    if (typeof params.expectedHash === 'string' && params.expectedHash !== fingerprint(email.text)) {
      return fail('The brief changed after you opened the preview. Review it again before sending.', 'preview_mismatch')
    }

    const limited = await checkRate(tools, userId, 'email')
    if (limited) return limited
    const hash = fingerprint(email.subject + '\n' + email.text)
    const recent = await recentEvents(tools, userId, 'email', EMAIL_DUPLICATE_WINDOW_MS)
    if (recent?.some((e) => e.data.detail === `${owned.id}:${hash}`) && params.allowRepeat !== true) {
      return fail('You already sent this exact brief in the last 10 minutes.', 'duplicate')
    }
    // Log before sending: a crash after the provider accepts must still count.
    const logged = await logEvent(tools, userId, 'email', `${owned.id}:${hash}`)
    const sent = await tools.integration('email/send', { to, subject: email.subject, text: email.text, html: email.html })
    if (!sent.success) {
      // A rejected send should not use up the user's quota or block a retry.
      if (logged.success) await tools.remove('usage_events', logged.data.recordId)
      return fail(`Email was not sent: ${sent.error}`, sent.code)
    }
    return { success: true, data: { to, sentAt: new Date().toISOString() } }
  },
}
