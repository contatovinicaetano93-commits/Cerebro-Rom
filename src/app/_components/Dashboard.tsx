'use client'

import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { CerebroOverview, UnitSlug } from '@/lib/types'
import { formatCurrency, formatDateTime, formatPct } from '@/lib/format'
import { KpiStat, Panel, ProgressBar } from './ui'
import { CollapsibleSection, SectionControls } from './CollapsibleSection'
import { LogoutButton } from './LogoutButton'

type SectionKey = 'hoje' | 'semana' | 'comercial' | 'comparativo' | 'trend'

const DEFAULT_OPEN: Record<SectionKey, boolean> = {
  hoje: true,
  semana: false,
  comercial: false,
  comparativo: false,
  trend: false,
}

function severityStyles(severity: 'critical' | 'warning' | 'info') {
  if (severity === 'critical') return 'border-danger/40 bg-danger/10 text-danger'
  if (severity === 'warning') return 'border-warning/40 bg-warning/10 text-warning'
  return 'border-info/40 bg-info/10 text-info'
}

function unitAccent(slug: string) {
  return slug === 'rom-brasil' ? 'text-brass' : 'text-teal'
}

function unitName(slug: UnitSlug) {
  return slug === 'rom-brasil' ? 'ROM Brasil' : 'ROM Iguatemi'
}

export function Dashboard({ data }: { data: CerebroOverview }) {
  const c = data.consolidated
  const goalTone =
    c.todayGoalProgress >= 1 ? 'good' : c.todayGoalProgress >= 0.7 ? 'default' : 'warn'

  const [openMap, setOpenMap] = useState(DEFAULT_OPEN)
  const allOpen = useMemo(
    () => (Object.keys(DEFAULT_OPEN) as SectionKey[]).every((k) => openMap[k]),
    [openMap],
  )
  const anyOpen = useMemo(
    () => (Object.keys(DEFAULT_OPEN) as SectionKey[]).some((k) => openMap[k]),
    [openMap],
  )

  function setSection(key: SectionKey, open: boolean) {
    setOpenMap((prev) => ({ ...prev, [key]: open }))
  }

  const modeLabel =
    data.mode === 'live'
      ? data.partial
        ? 'Live parcial'
        : 'Live'
      : data.mode === 'degraded'
        ? 'Degradado'
        : 'Mock'

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
            <div className="hidden text-right sm:block">
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">Fonte</p>
              <p className="text-sm text-brass-soft">{data.periodLabel}</p>
            </div>
            <div
              className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wider ${
                data.mode === 'live' && !data.partial
                  ? 'animate-pulse-soft border-success/35 bg-success/10 text-success'
                  : data.mode === 'degraded' || data.partial
                    ? 'border-warning/40 bg-warning/10 text-warning'
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
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-brass">Comando</p>
            <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
              {data.units.length >= 2
                ? 'O que mover agora'
                : data.units.length === 1
                  ? `${data.units[0]!.unit.short} · visão parcial`
                  : 'Painel offline'}
            </h1>
            {(data.partial || data.mode === 'degraded') && (
              <p className="mt-2 text-xs text-warning">
                {data.mode === 'degraded'
                  ? 'Live indisponível — sem números inventados.'
                  : 'Totais refletem só unidades ao vivo.'}
              </p>
            )}
          </div>
          <SectionControls
            allOpen={allOpen}
            anyOpen={anyOpen}
            onExpandAll={() =>
              setOpenMap({ hoje: true, semana: true, comercial: true, comparativo: true, trend: true })
            }
            onCollapseAll={() =>
              setOpenMap({ hoje: false, semana: false, comercial: false, comparativo: false, trend: false })
            }
          />
        </section>

        {/* Comando — meta do dia + o que fazer */}
        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Panel>
            <KpiStat
              label="Faturamento hoje"
              value={formatCurrency(c.todayRevenue)}
              hint={`Meta ${formatCurrency(c.todayGoal)} · ${formatPct(c.todayGoalProgress)}`}
              tone={goalTone}
            />
            <div className="mt-3">
              <ProgressBar
                value={c.todayGoalProgress}
                color={c.todayGoalProgress >= 1 ? 'success' : 'brass'}
              />
            </div>
          </Panel>
          <Panel>
            <KpiStat
              label="Ocupação · Comparec."
              value={`${formatPct(c.occupancyRate)} · ${formatPct(c.attendanceRate)}`}
              hint={`No-show ${formatPct(c.noShowRate)} · risco ${formatCurrency(c.revenueAtRisk)}`}
              tone={c.noShowRate > 0.08 ? 'warn' : 'default'}
            />
          </Panel>
          <Panel>
            <KpiStat
              label="MTD · Ticket"
              value={formatCurrency(c.mtdRevenue)}
              hint={`${formatPct(c.mtdGoalProgress)} da meta · ticket ${formatCurrency(c.ticketAvg)}`}
            />
            <div className="mt-3">
              <ProgressBar value={c.mtdGoalProgress} color="teal" />
            </div>
          </Panel>
        </section>

        {data.nextActions.length > 0 ? (
          <section className="mt-6">
            <p className="text-[0.65rem] uppercase tracking-[0.22em] text-brass">Próximas ações</p>
            <ul className="mt-3 space-y-2">
              {data.nextActions.map((a) => (
                <li
                  key={a.id}
                  className={`flex items-start gap-2 rounded-xl border px-4 py-3 ${severityStyles(a.severity)}`}
                >
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{a.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{a.detail}</p>
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-foreground/80">
                      <ArrowRight size={11} />
                      {a.action}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-6">
          <CollapsibleSection
            eyebrow="1 · Hoje"
            title="Ação do dia"
            summary={`${c.openSlotsToday} vagas · ${c.openSlotsNext2h} nas 2h · ${c.cancelledToday} cancel.`}
            open={openMap.hoje}
            onOpenChange={(v) => setSection('hoje', v)}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiStat
                label="Vagas hoje"
                value={String(c.openSlotsToday)}
                tone={c.openSlotsToday >= 4 ? 'warn' : 'default'}
              />
              <KpiStat
                label="Vagas 2h"
                value={String(c.openSlotsNext2h)}
                tone={c.openSlotsNext2h >= 2 ? 'warn' : 'good'}
              />
              <KpiStat
                label="Cancel. · No-show"
                value={`${c.cancelledToday} · ${c.noShowsToday}`}
                tone={c.cancelledToday + c.noShowsToday > 0 ? 'warn' : 'good'}
              />
              <KpiStat
                label="Novos · Recorrentes"
                value={`${c.newClients} · ${c.returningClients}`}
                hint={`Novos ${formatPct(c.newShare)}`}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.units.map((u) => (
                <div
                  key={u.unit.slug}
                  className="rounded-xl border border-border/50 bg-panel-2/50 px-3 py-3 text-center text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={`uppercase tracking-wider ${unitAccent(u.unit.slug)}`}>
                      {u.unit.short}
                    </p>
                    <p className="truncate text-[0.65rem] text-muted">{u.sync.label}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    <div>
                      <p className="text-muted">Hoje</p>
                      <p className="font-medium">{formatCurrency(u.today.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-muted">2h</p>
                      <p className="font-medium">{u.opsToday.openSlotsNext2h}</p>
                    </div>
                    <div>
                      <p className="text-muted">Cancel.</p>
                      <p className="font-medium">{u.today.cancelled}</p>
                    </div>
                    <div>
                      <p className="text-muted">Novos %</p>
                      <p className="font-medium">{formatPct(u.opsToday.newShare)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </section>

        <section className="mt-4">
          <CollapsibleSection
            eyebrow="2 · Semana"
            title="Equipe e retenção"
            summary={(() => {
              const r = data.units.reduce((a, u) => a + u.opsWeek.reactivationCount, 0)
              const n = data.units.reduce((a, u) => a + u.opsWeek.newClientsPeriod, 0)
              return `${r} reativar · ${n} novos 30d`
            })()}
            open={openMap.semana}
            onOpenChange={(v) => setSection('semana', v)}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {data.units.map((u) => {
                const w = u.opsWeek
                const empty =
                  w.professionals.length === 0 &&
                  w.services.length === 0 &&
                  w.reactivationCount === 0 &&
                  w.returnRate <= 0
                return (
                  <div
                    key={u.unit.slug}
                    className="rounded-xl border border-border/60 bg-panel-2/40 px-4 py-4"
                  >
                    <div className="flex justify-between gap-2 text-xs">
                      <p className={`uppercase tracking-wider ${unitAccent(u.unit.slug)}`}>
                        {u.unit.short}
                      </p>
                      <span className="text-muted">
                        Retorno{' '}
                        <span className="text-foreground">
                          {w.returnRate > 0 ? formatPct(w.returnRate) : '—'}
                        </span>
                        {' · '}
                        Reativar <span className="text-foreground">{w.reactivationCount}</span>
                      </span>
                    </div>
                    {empty ? (
                      <p className="mt-3 text-xs text-muted">
                        Sem dados — sync full + token Avec.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <ul className="space-y-1.5">
                          {w.professionals.slice(0, 3).map((p) => (
                            <li key={p.name} className="flex justify-between gap-2 text-sm">
                              <span className="truncate">{p.name}</span>
                              <span className="shrink-0 text-brass-soft">
                                {formatCurrency(p.revenue)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <ul className="space-y-1.5 border-t border-border/50 pt-3">
                          {w.services.slice(0, 3).map((s) => (
                            <li key={s.name} className="flex justify-between gap-2 text-sm">
                              <span className="truncate">
                                {s.name} <span className="text-xs text-muted">×{s.quantity}</span>
                              </span>
                              <span className="shrink-0 text-brass-soft">
                                {formatCurrency(s.revenue)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        </section>

        <section className="mt-4">
          <CollapsibleSection
            eyebrow="3 · Comercial"
            title="Canais e qualidade"
            summary={(() => {
              const p = data.units.reduce((a, u) => a + u.opsCommerce.packagesSold, 0)
              const b = data.units.reduce((a, u) => a + u.opsCommerce.birthdayCount, 0)
              return `${p} pacotes · ${b} anivers.`
            })()}
            open={openMap.comercial}
            onOpenChange={(v) => setSection('comercial', v)}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {data.units.map((u) => {
                const co = u.opsCommerce
                const empty =
                  co.bookingChannels.length === 0 &&
                  co.packages.length === 0 &&
                  co.ratingsCount === 0
                return (
                  <div
                    key={u.unit.slug}
                    className="rounded-xl border border-border/60 bg-panel-2/40 px-4 py-4"
                  >
                    <div className="flex justify-between gap-2 text-xs">
                      <p className={`uppercase tracking-wider ${unitAccent(u.unit.slug)}`}>
                        {u.unit.short}
                      </p>
                      <span className="text-muted">
                        Nota{' '}
                        <span className="text-foreground">
                          {co.ratingsCount ? co.ratingsAvg.toFixed(1) : '—'}
                        </span>
                      </span>
                    </div>
                    {empty ? (
                      <p className="mt-3 text-xs text-muted">Sem dados comerciais ainda.</p>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <ul className="space-y-1">
                          {co.bookingChannels.slice(0, 3).map((ch) => (
                            <li key={ch.channel} className="flex justify-between gap-2">
                              <span className="truncate text-muted">{ch.channel}</span>
                              <span>{ch.count}</span>
                            </li>
                          ))}
                        </ul>
                        <ul className="space-y-1">
                          {co.packages.slice(0, 3).map((p) => (
                            <li key={p.name} className="flex justify-between gap-2">
                              <span className="truncate text-muted">{p.name}</span>
                              <span>×{p.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        </section>

        {data.comparison ? (
          <section className="mt-4">
            <CollapsibleSection
              eyebrow="Comparativo"
              title="Quem lidera"
              summary={`Receita: ${unitName(data.comparison.revenueLeader)}`}
              open={openMap.comparativo}
              onOpenChange={(v) => setSection('comparativo', v)}
            >
              <ul className="space-y-3">
                {[
                  { label: 'Receita MTD', leader: data.comparison.revenueLeader, icon: TrendingUp },
                  { label: 'Ocupação hoje', leader: data.comparison.occupancyLeader, icon: Activity },
                  {
                    label: 'Comparecimento',
                    leader: data.comparison.attendanceLeader,
                    icon: CheckCircle2,
                  },
                  { label: 'Ticket médio', leader: data.comparison.ticketLeader, icon: Users },
                ].map((row) => {
                  const Icon = row.icon
                  return (
                    <li
                      key={row.label}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-panel-2/60 px-3 py-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={16} className="text-muted" />
                        <span className="text-sm text-muted">{row.label}</span>
                      </div>
                      <span className={`text-sm font-medium ${unitAccent(row.leader)}`}>
                        {unitName(row.leader)}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-4 text-xs text-muted">
                Delta Brasil vs Iguatemi (MTD):{' '}
                <span className="text-foreground">
                  {data.comparison.deltaRevenuePct == null ? (
                    'Iguatemi sem faturamento no período'
                  ) : (
                    <>
                      {data.comparison.deltaRevenuePct >= 0 ? '+' : ''}
                      {formatPct(Math.abs(data.comparison.deltaRevenuePct))}
                    </>
                  )}
                </span>
              </p>
            </CollapsibleSection>
          </section>
        ) : null}

        {data.trend30.length > 0 ? (
          <section className="mt-4">
            <CollapsibleSection
              eyebrow="Tendência"
              title="Receita 30 dias"
              summary="Brasil vs Iguatemi"
              open={openMap.trend}
              onOpenChange={(v) => setSection('trend', v)}
            >
              <div className="h-56 w-full sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend30} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gBrasil" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c9a45c" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#c9a45c" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gIgua" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6fafa0" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#6fafa0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(42,47,56,0.8)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: '#9a9488', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: '#9a9488', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#16191f',
                        border: '1px solid #2a2f38',
                        borderRadius: 12,
                        color: '#f2efe8',
                      }}
                      formatter={(value) => formatCurrency(Number(value ?? 0))}
                    />
                    <Area
                      type="monotone"
                      dataKey="brasil"
                      name="Brasil"
                      stroke="#c9a45c"
                      fill="url(#gBrasil)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="iguatemi"
                      name="Iguatemi"
                      stroke="#6fafa0"
                      fill="url(#gIgua)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CollapsibleSection>
          </section>
        ) : null}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5 text-xs text-muted">
          <p>
            Atualizado {formatDateTime(data.generatedAt)} ·{' '}
            {data.mode === 'live'
              ? 'Neons Brasil + Iguatemi (read-only)'
              : data.mode === 'degraded'
                ? 'Sem fallback fictício'
                : 'Mock'}
          </p>
          <p className="flex items-center gap-1.5">
            <RefreshCw size={12} />
            Cérebro v1 · {data.mode}
          </p>
        </footer>
      </main>
    </div>
  )
}
