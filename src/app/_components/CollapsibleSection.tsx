'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function CollapsibleSection({
  id,
  eyebrow,
  title,
  subtitle,
  summary,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
  className = '',
}: {
  id?: string
  eyebrow?: string
  title: string
  subtitle?: string
  /** Linha curta visível quando fechado */
  summary?: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  className?: string
}) {
  const autoId = useId()
  const panelId = id ?? autoId
  const uncontrolled = open === undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = uncontrolled ? internalOpen : open

  function toggle() {
    const next = !isOpen
    if (uncontrolled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  return (
    <section
      className={`rounded-2xl border border-border/80 bg-panel/90 p-4 sm:p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="min-w-0 flex-1 text-left"
        >
          {eyebrow ? (
            <p className="text-[0.65rem] uppercase tracking-[0.22em] text-brass">{eyebrow}</p>
          ) : null}
          <h2 className="mt-1 font-display text-2xl tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          {!isOpen && summary ? (
            <p className="mt-1 truncate text-sm text-muted">{summary}</p>
          ) : subtitle ? (
            <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>
          ) : null}
        </button>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={isOpen ? `Fechar ${title}` : `Abrir ${title}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[0.65rem] uppercase tracking-wider text-muted transition hover:border-brass/40 hover:text-brass"
        >
          {isOpen ? (
            <>
              Fechar
              <ChevronUp size={14} />
            </>
          ) : (
            <>
              Abrir
              <ChevronDown size={14} />
            </>
          )}
        </button>
      </div>

      {isOpen ? (
        <div id={panelId} className="mt-4 animate-fade-up">
          {children}
        </div>
      ) : null}
    </section>
  )
}

export function SectionControls({
  allOpen,
  anyOpen,
  onExpandAll,
  onCollapseAll,
}: {
  allOpen: boolean
  anyOpen: boolean
  onExpandAll: () => void
  onCollapseAll: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onExpandAll}
        disabled={allOpen}
        className="rounded-full border border-border/70 px-3 py-1.5 text-[0.65rem] uppercase tracking-wider text-muted transition hover:border-brass/40 hover:text-brass disabled:opacity-40"
      >
        Abrir tudo
      </button>
      <button
        type="button"
        onClick={onCollapseAll}
        disabled={!anyOpen}
        className="rounded-full border border-border/70 px-3 py-1.5 text-[0.65rem] uppercase tracking-wider text-muted transition hover:border-brass/40 hover:text-brass disabled:opacity-40"
      >
        Fechar secundário
      </button>
    </div>
  )
}
