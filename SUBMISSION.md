# DecisionRoom, submission note

- **Live URL:** https://decision-room.app.space
- **Repository:** https://github.com/mariospapadhmhtriou-gif/decisionroom (branch `main`; final commit: see `git log -1`)

## What was built

A private decision workspace on DeepSpace. A signed-in user creates a decision (question + constraints), edits
three options, three weighted criteria (0-10) and scores (1-5), and sees a deterministic weighted ranking with
explicit ties. They search the web, choose which results to save as evidence on a specific option (with notes),
ask AI to draft an editable brief that cites only those saved sources, and email the final brief to their own
address after previewing exactly what will be sent. Everything persists to an owner-private record.

## DeepSpace integrations actually used (each exercised on the live app)

1. **Exa web search** (`exa/search`), evidence search on explicit user action.
2. **Anthropic** (`anthropic/chat-completion`, `claude-haiku-5-5`), drafts the brief's prose as structured JSON;
   the app inserts the ranking itself and filters citations to saved source IDs.
3. **Email** (`email/send`), sends the saved brief to the signed-in user's own address.

Platform primitives (not counted as integrations): DeepSpace auth, a native record collection with
server-enforced `read: 'own'` permissions, realtime `useQuery`, server actions, and `deepspace deploy`.

## Main tradeoff

I prioritized a complete, inspectable decision workflow over autonomous research. Users control the evidence,
scores, and priorities; the app calculates the ranking and uses AI to explain the tradeoffs.

A second, technical tradeoff: each decision is one validated JSON record with a revision number. That makes
server-side validation and stale-write protection simple, but it is not designed for live multi-user editing,
so collaboration was cut.

## What the agent (Claude Code) did

Read the current DeepSpace docs and CLI help, scaffolded with `npm create deepspace@latest`, preserved the old
static prototype in `prototype/`, registered and deployed the app, and implemented the data model, server
actions, UI, theme, and tests. It probed the integration catalog (`deepspace integrations info`) and made small
billed CLI calls to confirm response shapes instead of guessing. It found and fixed a real bug from production
logs: AI briefs failed because the model's thinking used up the token budget and truncated the JSON.

## Verification

**Automated (run by the agent, all passing at the final commit):**
- `npx tsc --noEmit`, no errors.
- `npx eslint src`, no findings.
- `npx vitest run`, 28 tests: scoring (known average, priorities changing the winner, all-zero weights, ties,
  excluded criteria, no input mutation), document validation, corrupted data, reference-ID filtering, HTML
  escaping, email composition, prompt framing of untrusted source text.
- `npx vite build`, succeeds.
- `npx deepspace test run`, scaffold smoke + API suites, 8/8 (local dev server).
- `npx playwright test -c tests/playwright.live.config.ts`, **against the live app** with two DeepSpace test
  accounts: user B cannot see or open user A's decision; `saveDecision`, `generateBrief`, `searchEvidence`,
  `emailBrief`, `deleteDecision` on A's id with B's token all return `not_found`; no token / forged token → 401;
  stale revision → `conflict`; score 9, weight 11 and a `javascript:` evidence URL → `invalid`.

**Agent-driven browser checks on the live app (in the applicant's signed-in Chrome):**
signed-out gate; create and open a decision; score edit → autosave → reload persists; ranking matches hand
calculation; search returned results; saved evidence to two options with stable IDs and a note; AI brief
generated with valid citations (after the token-budget fix); brief marked out of date after an input change and
up to date again after reverting; email preview showed the sign-in address; one send was accepted by the provider;
a second identical send was refused as a duplicate; AI failure kept the page usable and showed a clear error;
narrow-screen (390 px) layout reviewed with no horizontal overflow.

**Applicant's own verification:** _not yet done, to be completed by the applicant before submitting._
Suggested checks:
- [ ] Confirm the test email actually arrived in your inbox (the agent only saw "accepted for delivery").
- [ ] On your phone, open a decision and edit scores, weights, evidence notes and the brief.
- [ ] Sign in with a second personal account and confirm you cannot see the first account's decisions.
- [ ] Open the same decision in two tabs, edit both, and confirm the conflict prompt appears.
- [ ] Keyboard-only pass: Tab through the comparison, evidence and email dialog; focus stays visible.
- [ ] Read one AI brief critically and click its sources.

## Unfinished work and next steps

- No sharing/collaboration (deliberately cut; would need per-field records or Yjs plus a `collaborator` rule).
- Email duplicate protection is best-effort (no provider idempotency key exposed); rate limits can be exceeded
  slightly under concurrent requests.
- Evidence snippets saved before a late fix may still show markdown markers.
- Next step: let users add evidence manually (a URL and notes without searching), and show which brief sentences
  cite which source inline.
