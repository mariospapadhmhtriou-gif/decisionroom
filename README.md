# DecisionRoom

A focused decision workspace: describe your question, budget and priorities, let AI find three candidate options
on the web with starting scores, check the ranking, keep the evidence, and get an editable, source-cited decision
brief you can email to yourself.

**Live:** https://decision-room.app.space · built on [DeepSpace](https://docs.deep.space/) (SDK 0.44.2)

Uncertain choice → explicit priorities → evidence-backed comparison → inspectable brief.

## The workflow

1. Sign in (DeepSpace auth: GitHub or Google).
2. Create a decision (blank, or the sample with **fictional** watches and **made-up** scores).
3. Write the question and constraints (for example a budget), name three criteria and set their weights (0-10).
4. Optional: **Find options with AI.** The server searches the web from the saved question and constraints, and
   AI proposes three real options with a 1-5 score and a reason per criterion, citing search results. You see
   how they would rank under your weights, then choose **Use these options** or **Discard**. Accepting replaces
   the options, scores and evidence; question, constraints and weights stay. Scores remain editable.
5. Or enter options and scores yourself. The ranking updates instantly: deterministic arithmetic, explicit ties,
   and no ranking when all weights are 0.
6. Search the web (Exa), pick the results you trust, save them to an option, add notes, remove them.
7. Draft a brief with AI from the **saved** decision. It cites only saved source IDs (S1, S2…). Edit it freely;
   it is marked out of date when inputs change.
8. Preview the exact email, then explicitly send it to your own sign-in address.
9. Everything autosaves to your private record; reload or come back later.

## Scoring

```
weighted score = Σ(score × weight) / Σ(weight)       score: integer 1-5, weight: integer 0-10
```

Higher scores are always better; a weight of 0 excludes that criterion; all-zero weights produce no ranking;
equal totals are reported as a tie (no hidden tie-breaker). The result is a 1-5 *preference* score, not a
probability, confidence level or objective rating. Code: [`src/lib/scoring.ts`](src/lib/scoring.ts).
AI can *suggest* starting scores when you ask (and only after you accept them), but it never computes the ranking
or changes scores on its own; the brief's ranking block is inserted by the app.

## How it is built

| Piece | Where |
|---|---|
| Pure scoring (tested) | `src/lib/scoring.ts` |
| Domain model, validation schema, brief/email composition | `src/lib/decision.ts` |
| AI prompts (untrusted-data framing) | `src/lib/brief-prompt.ts`, `src/lib/suggest.ts` |
| AI option finder: query, output clamping, apply (tested) | `src/lib/suggest.ts` |
| Server actions (the only write path) | `src/actions/index.ts` |
| Collection schemas + permissions | `src/schemas/decisions-schema.ts` |
| Load/save hook (debounced autosave, optimistic concurrency) | `src/lib/useDecision.ts` |
| UI | `src/pages/(app)/(protected)/decisions/`, `src/components/decision/` |
| Original static prototype (kept for reference) | `prototype/` |

**DeepSpace primitives used:** auth (`AuthGate`, `useUser`, verified JWT in actions), a native record
collection with server-enforced RBAC (`read: 'own'`), realtime `useQuery` subscription, server actions
(`/api/actions/*`) with action tools, the integrations proxy (billed to the app owner), and `deepspace deploy`.

### Data and authorization

- `decisions` collection: one record per decision; the whole decision is a validated JSON document plus a
  `revision` number. Client roles may only **read their own** records; they cannot create/update/delete directly.
- Every write is a server action that (1) gets the verified caller from the JWT, (2) loads the record and checks
  `ownerId` and `createdBy` equal the caller (missing and foreign ids get the same `not_found`), and
  (3) re-validates the entire document with zod (score/weight ranges, text limits, http(s)-only URLs, unique IDs).
- Saves use optimistic concurrency: a save with a stale `baseRevision` is refused with `conflict` and the UI
  asks which version to keep. Nothing is silently overwritten.
- `usage_events` (server-only) backs per-user limits: 30 searches/hour, 10 option searches/hour, 10 briefs/hour, 5 emails/day, and
  duplicate-email protection.

### Integrations (all called server-side, sign-in required)

| Integration | Endpoint | Used for |
|---|---|---|
| Exa web search | `exa/search` | Evidence search (6 results) and the option finder (8 results); query ≤ 200 chars |
| Anthropic | `anthropic/chat-completion` (`claude-haiku-5-5`) | Suggesting options and scores; drafting the brief's prose as JSON |
| Email (Resend via DeepSpace) | `email/send` | Sending the saved brief to the caller's own address |

AI safety: the model has no tools; user text and snippets are passed inside a JSON data block that the system
prompt marks as untrusted; output is parsed, clamped, and citations are filtered to saved source IDs. ID
validation is **not** proof that a source supports a claim, and the brief says so. Failures keep the existing brief.

Email: recipient comes from the server-side user record (not the client); the HTML body is escaped; the
client sends a hash of the previewed text and the server refuses if the saved brief differs; identical content
within 10 minutes needs an explicit "send again". The provider endpoint exposes no idempotency key here, so this
is best-effort duplicate protection, **not** exactly-once delivery.

## Develop, test, deploy

Requires Node 22.15+/24/26 and npm 11.6+.

```bash
npm install
npx deepspace auth login
npx deepspace dev start          # http://localhost:5173
npm run type-check
npx vitest run                   # unit tests: scoring, validation, references, escaping, prompt
npx deepspace test run           # scaffold smoke + API suites (local dev server)
npx playwright test -c tests/playwright.live.config.ts   # two-user isolation against the live app
npx deepspace deploy             # commit first
```

The live isolation spec needs two DeepSpace test accounts (`npx deepspace test accounts create --email
<name>@deepspace.test --password-stdin`). No secrets are stored in this repository; integration billing goes
through the DeepSpace platform account.

## Known limitations

- Fixed at three options and three criteria (deliberate scope).
- One JSON record per decision: safe against stale overwrites, but not built for simultaneous multi-user
  editing. No sharing or collaboration.
- Search returns snippets, not verified full sources; the app never fetches arbitrary URLs.
- AI output quality is not guaranteed; citations are checked for existence, not entailment.
- Rate limits are counted from a server-side log and could be exceeded slightly under concurrent requests.
