# DecisionRoom

DecisionRoom helps you make a choice you can explain. You type your question and budget, and AI suggests the
criteria that matter, finds three real options or scores the ones you name, and fills in the comparison. You can
change anything it suggests. The ranking is a plain weighted average you can check by hand, and at the end you get
an editable brief that cites its sources, which you can email to yourself.

**Live:** https://decision-room.app.space (built on [DeepSpace](https://docs.deep.space/), SDK 0.44.2)

## How it works

1. Sign in with DeepSpace (GitHub or Google).
2. Create a decision. You can start blank or open the sample, which uses **fictional** watches and **made up** scores.
3. Write your question and any constraints, such as a budget. After a short pause AI picks three criteria and
   gives each a weight from 0 to 10. If you change the question, they update to match. Once you edit a criterion
   or weight yourself, the automatic updates stop and an **Update from question** button appears, so your own
   choices are never overwritten.
4. If you want ideas, press **Find options with AI.** The server searches the web using your saved question and
   constraints, and AI proposes three real options with a score from 1 to 5 and a short reason for each
   criterion, along with the sources it used. You see how they would rank before deciding, then pick
   **Use these options** or **Discard**.
5. If you already know your options, just type their names. Once all three are named, AI fills in every score.
   These scores are estimates from general knowledge, not live research. When you rename an option or change the
   criteria or question, the scores are redone after a pause. Changing a weight does not trigger this, because a
   weight changes the ranking, not how good an option is. If you change a score yourself, automatic scoring
   stops and a **Rescore with AI** button appears instead. You can always type every score by hand.
6. The ranking updates instantly. Ties are shown as ties, and if every weight is 0 there is no ranking.
7. Research is optional. You can search the web yourself, pick the results you trust, save them to an option
   and add notes.
8. Ask AI to draft a brief from the **saved** decision. It can only cite sources you saved (S1, S2 and so on).
   You can edit it freely, and it is marked out of date if the decision changes afterwards.
9. Preview the exact email, then send it to the address you signed in with.
10. Everything saves automatically to your private account, so you can close the tab and come back later.

## Scoring

```
weighted score = Σ(score × weight) / Σ(weight)       score: whole number 1 to 5, weight: whole number 0 to 10
```

A higher score is always better. A weight of 0 leaves that criterion out. Equal totals are reported as a tie
with no hidden tie breaker. The result is a 1 to 5 *preference* score, not a probability or an objective
rating. The code is in [`src/lib/scoring.ts`](src/lib/scoring.ts).

AI can suggest the criteria, weights and scores, but it never calculates the ranking. The app does that itself,
and the ranking block in the brief is written by the app, not by AI.

## How it is built

| Piece | Where |
|-|-|
| Scoring (tested) | `src/lib/scoring.ts` |
| Decision model, validation, brief and email text | `src/lib/decision.ts` |
| AI prompts, which treat user text as untrusted data | `src/lib/brief-prompt.ts`, `src/lib/suggest.ts`, `src/lib/criteria.ts`, `src/lib/autoscore.ts` |
| AI option finder (tested) | `src/lib/suggest.ts`, `src/components/decision/OptionFinder.tsx` |
| Automatic criteria and weights (tested) | `src/lib/criteria.ts`, `src/components/decision/AutoCriteria.tsx` |
| Automatic scores (tested) | `src/lib/autoscore.ts`, `src/components/decision/AutoScores.tsx` |
| Server actions, the only way data is written | `src/actions/index.ts` |
| Collections and permissions | `src/schemas/decisions-schema.ts` |
| Loading and autosave | `src/lib/useDecision.ts` |
| Screens | `src/pages/(app)/(protected)/decisions/`, `src/components/decision/` |
| The original static prototype, kept for reference | `prototype/` |

**DeepSpace features used:** sign in (`AuthGate`, `useUser`, and the verified user id inside server actions), a
record collection whose permissions are enforced on the server (`read: 'own'`), live updates with `useQuery`,
server actions, the integrations proxy, and `deepspace deploy`.

### Data and permissions

- Each decision is one record in the `decisions` collection. It holds the whole decision as a validated JSON
  document plus a revision number. Users can only read their own records and cannot write to them directly.
- Every change goes through a server action. The action takes the user id from the verified sign in token,
  loads the record and checks that the user owns it, then validates the whole document again (score and weight
  ranges, text length, web addresses limited to http and https, unique ids). Someone else's decision and a
  decision that does not exist both return the same `not_found` answer.
- If two tabs edit the same decision, the older save is refused with `conflict` and the app asks which version
  to keep. Nothing is overwritten silently.
- A server only `usage_events` collection keeps per user limits: 30 searches, 10 option searches, 40 criteria
  suggestions, 40 automatic scorings and 10 briefs per hour, and 5 emails per day. It also blocks accidental
  duplicate emails.

### Integrations (all called from the server, sign in required)

| Integration | Endpoint | What it does here |
|-|-|-|
| Exa web search | `exa/search` | Your own research (6 results) and the option finder (8 results) |
| Anthropic | `anthropic/chat-completion` (`claude-haiku-5-5`) | Suggests criteria and weights, finds options, scores options you name, and drafts the brief |
| Email (Resend through DeepSpace) | `email/send` | Sends the saved brief to your own address |

**AI safety.** The model has no tools. Your text and any search snippets are sent inside a JSON block that the
instructions mark as untrusted data. Everything the model returns is checked and clamped to valid ranges, and
brief citations are filtered to sources you actually saved. A valid source id does **not** prove the source
supports the claim, and the brief says so. If AI fails, nothing you already have is changed.

**Email.** The recipient comes from your account on the server, never from the browser. The email body is
escaped. The browser sends a fingerprint of the text you previewed, and the server refuses to send if the saved
brief no longer matches. Sending the same brief again within 10 minutes needs an extra confirmation. The email
service offers no way to guarantee a single delivery, so this protection is best effort.

## Running it yourself

You need Node 22.15 or newer and npm 11.6 or newer.

```bash
npm install
npm run login                    # sign in to DeepSpace
npm run dev                      # http://localhost:5173
npm run type-check
npm run test:unit                # scoring, validation, AI output handling, escaping
npm test                         # smoke and API tests against the local server
npx playwright test -c tests/playwright.live.config.ts   # two user isolation test against the live app
npm run deploy                   # commit first
```

The live isolation test needs two DeepSpace test accounts, which you can create with
`npx deepspace test accounts create`. No secrets are stored in this repository, and integration costs are billed
to the DeepSpace account that owns the app.

## Known limitations

- Every decision has exactly three options and three criteria. This keeps the screen simple.
- Each decision is a single record. That protects against stale saves, but two people cannot edit at once, and
  there is no sharing yet.
- Automatic scores come from the model's general knowledge and the option finder works from short search
  snippets. Both can be wrong, and prices and availability change.
- The app never opens the web pages it finds. Citations are checked to exist, not checked for accuracy.
- Rate limits are counted from a server log and could be exceeded slightly if many requests arrive at once.
