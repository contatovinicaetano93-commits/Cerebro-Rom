'use client'

import { Brain, RefreshCw } from 'lucide-react'
import type { CerebroOverview } from '@/lib/types'
import { formatCurrency, formatDateTime, formatPct } from '@/lib/format'
import { KpiStat, Panel, ProgressBar } from './ui'
import { LogoutButton } from './LogoutButton'
import { GoalsEditor } from './GoalsEditor'
import { ReportsPanel } from './ReportsPanel'
import { NewsPanel } from './NewsPanel'

export function Dashboard({
  data,
  onRefresh,
}: {
  data: CerebroOverview
  onRefresh?: () => void
}) {
  const c = data.consolidated
  const goalProgressColor =
    !c.networkReadable || !c.goalsConfigured || !c.todayMoneyActive
      ? 'brass'
      : c.todayGoalProgress >= 1
        ? 'success'
        : 'brass'

  const modeLabel =
    data.mode === 'live' ? 'Live' : data.mode === 'degraded' ? 'Degradado' : 'Mock'

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(201,164,92,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(111,175,160,0.10),_transparent_50%)]"
      />

      <header className="relative border-b border-border/60 bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brass/30 bg-brass/10 text-brass">
              <Brain size={20} />
            </div>
            <div>
              <p className="font-display text-xl tracking-tight sm:text-2xl">Cérebro</p>
              <p className="text-xs text-muted">ROM Brasil + Iguatemi</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/comparativo"
              className="rounded-xl border border-teal/35 bg-teal/10 px-3 py-1.5 text-xs text-teal hover:border-teal/55"
            >
              Comparativo
            </a>
            <div
              className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wider ${
                data.mode === 'live'
                  ? 'animate-pulse-soft border-success/35 bg-success/10 text-success'
                  : 'border-brass/25 bg-brass/10 text-brass'
              }`}
            >
              {modeLabel}
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[1100px] px-5 py-6 sm:px-8 sm:py-8">
        <section>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-brass">Comando</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">O que mover agora</h1>
        </section>

        <section id="relatorios" className="mt-6 space-y-3">
          <GoalsEditor data={data} onSaved={() => onRefresh?.()} />
          <ReportsPanel />
          <NewsPanel />
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Panel>
            <KpiStat
              label="Faturamento hoje"
              value={c.networkReadable ? formatCurrency(c.todayRevenue) : '—'}
              hint={
                c.networkReadable && c.goalsConfigured && c.todayMoneyActive
                  ? `Meta ${formatCurrency(c.todayGoal)} · ${formatPct(c.todayGoalProgress)}`
                  : 'Sync / metas'
              }
              tone="default"
            />
            {c.networkReadable && c.goalsConfigured && c.todayMoneyActive ? (
              <div className="mt-3">
                <ProgressBar value={c.todayGoalProgress} color={goalProgressColor} />
              </div>
            ) : null}
          </Panel>
          <Panel>
            <KpiStat
              label="Lotação · Quem veio"
              value={
                c.occupancyConfigured
                  ? `${formatPct(c.occupancyRate)} · ${
                      c.attendanceConfigured ? formatPct(c.attendanceRate) : '—'
                    }`
                  : '— · —'
              }
            />
          </Panel>
          <Panel>
            <KpiStat
              label="Receita do mês"
              value={
                !c.networkReadable
                  ? '—'
                  : c.mtdRevenue == null
                    ? 'aguardando caixa'
                    : formatCurrency(c.mtdRevenue)
              }
            />
          </Panel>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5 text-xs text-muted">
          <p>
            Atualizado {formatDateTime(data.generatedAt)} · ROM News no painel
          </p>
          <p className="flex items-center gap-1.5">
            <RefreshCw size={12} />
            Cérebro · {data.mode}
          </p>
        </footer>
      </main>
    </div>
  )
}
