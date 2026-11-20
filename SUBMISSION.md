# DecisionRoom: submission note

- **Live app:** https://decision-room.app.space
- **Repository:** https://github.com/mariospapadhmhtriou-gif/decisionroom (branch `main`, the latest commit is the final one)

## What I built

DecisionRoom is a private workspace for making a decision on DeepSpace. A signed in user creates a decision and
types a question and any constraints, such as a budget. AI turns that into three criteria with weights from 0 to
10 and keeps them in step as the question changes, until the user edits them. From there the user has two ways to
fill in the options:

- **Ask AI to find them.** The server searches the web and AI proposes three real options, each with a score
  from 1 to 5 and a reason for every criterion, citing the search results. Nothing changes until the user
  reviews the proposal and accepts it.
- **Name them yourself.** Once all three options have names, AI estimates every score automatically and redoes
  them when the options, criteria or question change. As soon as the user changes a score by hand, the automatic
  scoring stops and a **Rescore with AI** button is offered instead.

Criteria, weights, options and scores all stay editable, and the app shows a weighted ranking that is plain
arithmetic, with ties shown as ties. Research is optional. The user can search the web, save the results they
trust to a specific option and add notes. AI can then draft an editable brief that only cites those saved
sources, and the user can email the final brief to their own address after previewing exactly what will be
sent. Everything is saved to a record only that user can see.

## DeepSpace integrations used (each one exercised on the live app)

1. **Exa web search** (`exa/search`) for the user's own research and for the option finder.
2. **Anthropic** (`anthropic/chat-completion` with `claude-haiku-5-5`) to suggest criteria and weights, find
   options, score options the user names, and draft the brief as structured JSON. The app itself calculates the
   ranking and checks every citation against the saved sources.
3. **Email** (`email/send`) to send the saved brief to the signed in user's own address.

I also used DeepSpace sign in, a record collection with `read: 'own'` permissions enforced on the server, live
updates through `useQuery`, server actions and `deepspace deploy`. I don't count these as integrations.

## Main tradeoff

I let AI do the legwork but not the deciding. AI suggests the criteria, finds options and fills in scores, but
every one of those stays editable, and AI never overwrites something the user changed by hand. The ranking is a
fixed formula the user can check, not an AI verdict. AI also explains the tradeoffs in the brief.

There is also a technical tradeoff. Each decision is one validated JSON record with a revision number. That keeps
server side validation and protection against stale saves simple, but it isn't built for several people editing
at once, so I left collaboration out.

## What the coding agent (Claude Code) did

It read the current DeepSpace docs and CLI help, created the project with `npm create deepspace@latest`, kept the
old static prototype in `prototype/`, registered and deployed the app, and wrote the data model, server actions,
screens, theme and tests. Instead of guessing how the integrations respond, it read the integration catalog and
made a few small paid test calls. It also found and fixed a real bug from the production logs: AI briefs were
failing because the model's thinking used up the token budget and cut off the JSON.

## Verification

**Automated checks, run by the agent and passing at the final commit:**

- Type check (`npm run type-check`): no errors.
- Lint (`npx eslint src`): no findings.
- Unit tests (`npx vitest run`), 51 tests covering scoring (a known average, weights changing the winner, all
  weights at 0, ties, left out criteria, inputs not modified), document validation, corrupted data, filtering of
  source ids, HTML escaping, email text, how untrusted text is framed for the AI, option finder clamping and
  source filtering, automatic criteria (when they regenerate and that user edits are kept), automatic scores
  (when scoring starts, what makes it rescore, that manual scores are kept, clamping) and dash removal.
- Production build (`npx vite build`): succeeds.
- DeepSpace smoke and API tests (`npx deepspace test run`): 8 of 8 pass on the local dev server.
- Isolation test against the **live app** with two DeepSpace test accounts. User B cannot see or open user A's
  decision. Calling `saveDecision`, `generateBrief`, `suggestOptions`, `suggestCriteria`, `suggestScores`,
  `searchEvidence`, `emailBrief` and `deleteDecision` on A's decision with B's token all return `not_found`.
  A missing or forged token gets a 401, a stale revision gets `conflict`, and a score of 9, a weight of 11 or a
  `javascript:` link gets `invalid`.

**Browser checks the agent ran on the live app, in the applicant's signed in Chrome:**

- Signed out visitors are sent to sign in. Creating and opening a decision works, a score edit autosaves and is
  still there after a reload, and the ranking matches a hand calculation.
- Search returned results, and evidence saved to two options kept stable ids and a note.
- An AI brief was generated with valid citations (after the token budget fix). It was marked out of date after an
  input changed and up to date again after the change was undone.
- The email preview showed the sign in address. One send was accepted by the email provider and a second
  identical send was refused as a duplicate.
- When AI failed, the page stayed usable and showed a clear message.
- At a narrow phone width (390 px) nothing overflowed sideways.
- The DecisionRoom logo returns to the main page.
- **Option finder:** for "Which noise cancelling headphones should I buy?" with a $200 budget it proposed three
  real models with reasons and sources. Accepting them filled in the comparison and evidence, and they were still
  there after a reload.
- **Automatic criteria:** "Which used car should I buy for my first car?" with a budget produced Affordability 9,
  Insurance cost 8 and City driving 6. Adding "safety and reliability" to the question regenerated them. After a
  manual weight edit, a later change to the question kept the user's criteria and offered "Update from question".
- **Automatic scores:** naming the options 2015 Toyota Corolla, 2014 Honda Civic and 2016 Mazda 3 filled in all
  nine scores and the ranking (Corolla 4.30, Civic 4.00, Mazda 3.33). After one score was changed by hand,
  renaming an option kept that score and offered "Rescore with AI".

**Applicant's own verification:** _not done yet. The applicant will do this before submitting._ Suggested checks:

- [ ] Confirm the test email actually reached your inbox. The agent only saw that it was accepted for delivery.
- [ ] On your phone, open a decision and edit scores, weights, evidence notes and the brief.
- [ ] Sign in with a second personal account and confirm you can't see the first account's decisions.
- [ ] Open the same decision in two tabs, edit both, and confirm you are asked which version to keep.
- [ ] Go through the comparison, evidence and email dialog with only the keyboard and check that focus stays visible.
- [ ] Read one AI brief carefully and open its sources.
- [ ] Type a new question and watch the criteria and weights fill in. Then edit one and confirm it is kept.
- [ ] Name three options yourself and watch the scores fill in. Then change one and confirm it is kept.
- [ ] Run the option finder on a decision of your own and check its scores against the sources.

## What is unfinished and what comes next

- There is no sharing or collaboration. I cut it on purpose, since it would need a different data layout and a
  collaborator permission rule.
- Duplicate email protection is best effort because the email service exposes no idempotency key. Rate limits
  could also be exceeded slightly if many requests arrive at the same moment.
- Evidence snippets saved before a late fix may still show markdown symbols.
- Automatic scores are estimates from general knowledge, with no web search, and the option finder works from short
  search snippets. Both can be wrong, and prices and availability change.
- Next I would let users add evidence by hand (a link and a note, without searching) and show which sentences in
  the brief cite which source.
