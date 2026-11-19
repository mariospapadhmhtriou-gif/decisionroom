/** Small shared controls and layout pieces for the decision workspace. */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  const headingId = id ? `${id}-heading` : undefined
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('rounded-xl border border-border bg-card', className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[15px] font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

export const fieldClass =
  'w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 hover:border-muted-foreground/50 transition-colors disabled:opacity-60'

export function ScoreSelect({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (n: number) => void
  label: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="tabular h-9 w-full min-w-[3.75rem] cursor-pointer rounded-md border border-input bg-background/60 px-2 text-center text-sm text-foreground hover:border-muted-foreground/50"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}

export function WeightControl({
  value,
  share,
  onChange,
  label,
  id,
}: {
  value: number
  share: number
  onChange: (n: number) => void
  label: string
  id: string
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        aria-label={label}
        aria-valuetext={`${value} out of 10`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer"
      />
      <span className="tabular w-[4.5rem] shrink-0 text-right text-xs text-muted-foreground">
        <span className="text-sm font-medium text-foreground">{value}</span>/10
        <span className="block text-[11px]">{value === 0 ? 'excluded' : `${Math.round(share * 100)}% of total`}</span>
      </span>
    </div>
  )
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'warn' | 'bad' | 'good' }) {
  const tones = {
    neutral: 'border-border text-muted-foreground',
    gold: 'border-primary/40 text-primary',
    warn: 'border-amber-400/40 text-amber-300',
    bad: 'border-destructive/50 text-destructive',
    good: 'border-emerald-400/30 text-emerald-300',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', tones[tone])}>
      {children}
    </span>
  )
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
