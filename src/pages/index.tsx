/**
 * Landing page, STATIC (no auth fetch, no socket), prerendered at build.
 * Deliberately compact: it explains the workflow and gets out of the way.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const steps = [
  ['Describe what you need', 'Type your question and budget. AI picks the criteria and how much each one matters, and you can change them.'],
  ['Let AI find options', 'AI searches the web and suggests three options with sources, or scores the options you name yourself.'],
  ['See a ranking you can check', 'A plain weighted average of scores from 1 to 5. Ties stay ties, and you can change any score.'],
  ['Get an editable brief', 'AI drafts the reasoning from your saved inputs and cites only your sources. Email it to yourself.'],
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background">
        <header className="border-b border-border bg-[color:var(--color-shell)]">
          <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <span aria-hidden className="font-display grid size-6 place-items-center rounded-md bg-primary text-[13px] text-primary-foreground">D</span>
              DecisionRoom
            </Link>
            <Link to="/decisions" className="text-sm text-muted-foreground hover:text-foreground">Open app</Link>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Decision workspace</p>
          <h1 className="font-display mt-3 max-w-2xl text-3xl leading-tight text-foreground sm:text-4xl">
            Turn an uncertain choice into a brief you can explain.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Tell it your budget and what matters most. AI suggests criteria, finds options and fills in starting scores.
            You can change any of it, and the ranking is simple arithmetic you can check, not an AI verdict.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/decisions"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open your decisions
            </Link>
          </div>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {steps.map(([title, body], i) => (
              <li key={title} className="bg-card p-5">
                <p className="tabular text-xs text-primary">0{i + 1}</p>
                <p className="mt-1 font-medium text-foreground">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-muted-foreground">
            Decisions are private to your account. Search results and AI drafts can be wrong, so check the sources.
          </p>
        </main>
      </div>
    </>
  )
}
