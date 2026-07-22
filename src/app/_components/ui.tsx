'use client'

import type { ReactNode } from 'react'

export function KpiStat({
  label,
  value,
  hint,
  legend,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  /** Definição curta — aparece no hover do rótulo e em linha discreta abaixo. */
  legend?: string
  tone?: 'default' | 'good' | 'bad' | 'warn'
}) {
  const toneClass =
    tone === 'good'
      ? 'text-success'
      : tone === 'bad'
        ? 'text-danger'
        : tone === 'warn'
          ? 'text-warning'
          : 'text-foreground'

  return (
    <div className="min-w-0">
      <p
        className={`text-[0.65rem] uppercase tracking-[0.18em] text-muted ${
          legend ? 'cursor-help underline decoration-dotted decoration-muted/40 underline-offset-2' : ''
        }`}
        title={legend}
      >
        {label}
      </p>
      <p className={`mt-1 truncate font-display text-2xl tracking-tight sm:text-3xl ${toneClass}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {legend ? (
        <p className="mt-1 text-[0.65rem] leading-snug text-muted/70">{legend}</p>
      ) : null}
    </div>
  )
}

export function ProgressBar({
  value,
  color = 'brass',
}: {
  value: number
  color?: 'brass' | 'teal' | 'success' | 'warning' | 'danger'
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  const colorMap = {
    brass: 'bg-brass',
    teal: 'bg-teal',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/70">
      <div
        className={`progress-fill h-full rounded-full ${colorMap[color]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-4">
      {eyebrow ? (
        <p className="text-[0.65rem] uppercase tracking-[0.22em] text-brass">{eyebrow}</p>
      ) : null}
      <h2 className="mt-1 font-display text-2xl tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
    </div>
  )
}

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-2xl border border-border/80 bg-panel/90 p-4 sm:p-5 ${className}`}
    >
      {children}
    </section>
  )
}
