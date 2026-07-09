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
  Clock3,
  Compass,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { CerebroOverview, UnitSnapshot } from '@/lib/types'
import { formatCurrency, formatDateTime, formatNumber, formatPct, formatSignedPct } from '@/lib/format'
import { KpiStat, Panel, ProgressBar } from './ui'
import { CollapsibleSection, SectionControls } from './CollapsibleSection'
import { LogoutButton } from './LogoutButton'

type SectionKey =
  | 'ops'
  | 'trend'
  | 'leaders'
  | 'brasil'
  | 'iguatemi'
  | 'alerts'
  | 'decisions'

const DEFAULT_OPEN: Record<SectionKey, boolean> = {
  ops: true,
  trend: false,
  leaders: false,
  brasil: false,
  iguatemi: false,
  alerts: true,
  decisions: false,
}

function severityStyles(severity: 'critical' | 'warning' | 'info') {
  if (severity === 'critical') return 'border-danger/40 bg-danger/10 text-danger'
  if (severity === 'warning') return 'border-warning/40 bg-warning/10 text-warning'
  return 'border-info/40 bg-info/10 text-info'
}

function unitAccent(slug: string) {
  return slug === 'rom-brasil' ? 'text-brass' : 'text-teal'
}

function UnitBody({ unit }: { unit: UnitSnapshot }) {
  const occupancy = unit.today.appointments / Math.max(1, unit.today.capacity)
  const attendance = unit.today.attended / Math.max(1, unit.today.appointments)
  const goalProgress = unit.today.revenue / Math.max(1, unit.today.dailyGoal)
  const mtdProgress = unit.mtd.revenue / Math.max(1, unit.mtd.goal)
  const accentBar = unit.unit.slug === 'rom-brasil' ? 'brass' : 'teal'

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <KpiStat
          label="Faturamento hoje"
          value={formatCurrency(unit.today.revenue)}
          hint={`Meta ${formatCurrency(unit.today.dailyGoal)}`}
        />
        <KpiStat
          label="Ticket médio"
          value={formatCurrency(unit.today.ticketAvg)}
          hint={`${formatNumber(unit.today.attended)} atendidos`}
        />
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Meta do dia</span>
            <span>{formatPct(goalProgress)}</span>
          </div>
          <ProgressBar value={goalProgress} color={accentBar} />
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Meta MTD</span>
            <span>{formatPct(mtdProgress)}</span>
          </div>
          <ProgressBar value={mtdProgress} color={accentBar} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border/70 pt-4 text-center">
        <div>
          <p className="text-[0.65rem] uppercase tracking-wider text-muted">Ocupação</p>
          <p className="mt-1 text-sm font-medium">{formatPct(occupancy)}</p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-wider text-muted">Comparecimento</p>
          <p className="mt-1 text-sm font-medium">{formatPct(attendance)}</p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-wider text-muted">No-shows</p>
          <p className={`mt-1 text-sm font-medium ${unit.today.noShows > 0 ? 'text-warning' : ''}`}>
            {unit.today.noShows}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
          Top profissionais (MTD)
        </p>
        <ul className="mt-2 space-y-2">
          {unit.topProfessionals.length === 0 ? (
            <li className="rounded-xl bg-panel-2/80 px-3 py-2 text-xs text-muted">
              Sem ranking ainda — aguardando métricas por profissional.
            </li>
          ) : (
            unit.topProfessionals.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-panel-2/80 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted">
                    {formatNumber(p.attended)} atend. · ocup. {formatPct(p.occupancy)}
                  </p>
                </div>
                <p className="shrink-0 text-sm text-brass-soft">{formatCurrency(p.revenue)}</p>
              </li>
            ))
          )}
        </ul>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
        <Clock3 size={12} />
        {unit.sync.label}
      </p>
    </>
  )
}

export function Dashboard({ data }: { data: CerebroOverview }) {
  const c = data.consolidated
  const goalTone =
    c.todayGoalProgress >= 1 ? 'good' : c.todayGoalProgress >= 0.7 ? 'default' : 'warn'

  const [openMap, setOpenMap] = useState<Record<SectionKey, boolean>>(DEFAULT_OPEN)

  const allOpen = useMemo(
    () => (Object.keys(DEFAULT_OPEN) as SectionKey[]).every((k) => openMap[k]),
    [openMap],
  )
  const anySecondaryOpen = useMemo(
    () => (Object.keys(DEFAULT_OPEN) as SectionKey[]).some((k) => openMap[k]),
    [openMap],
  )

  function setSection(key: SectionKey, open: boolean) {
    setOpenMap((prev) => ({ ...prev, [key]: open }))
  }

  function expandAll() {
    setOpenMap({
      ops: true,
      trend: true,
      leaders: true,
      brasil: true,
      iguatemi: true,
      alerts: true,
      decisions: true,
    })
  }

  function collapseSecondary() {
    setOpenMap((prev) => ({
      ...prev,
      trend: false,
      leaders: false,
      brasil: false,
      iguatemi: false,
      decisions: false,
    }))
  }

  const brasil = data.units.find((u) => u.unit.slug === 'rom-brasil')
  const iguatemi = data.units.find((u) => u.unit.slug === 'rom-iguatemi')
  const criticalAlerts = data.alerts.filter((a) => a.severity === 'critical').length

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(201,164,92,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(111,175,160,0.10),_transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23f2efe8\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      />

      <header className="relative border-b border-border/60 bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brass/30 bg-brass/10 text-brass">
              <Brain size={20} />
            </div>
            <div>
              <p className="font-display text-xl tracking-tight sm:text-2xl">Cérebro</p>
              <p className="text-xs text-muted">Painel Waltter · ROM Brasil + Iguatemi</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div className="hidden sm:block">
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">Fonte</p>
              <p className="text-sm text-brass-soft">{data.periodLabel}</p>
            </div>
            <div
              className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wider ${
                data.mode === 'live'
                  ? 'animate-pulse-soft border-success/35 bg-success/10 text-success'
                  : data.mode === 'fallback'
                    ? 'border-danger/35 bg-danger/10 text-danger'
                    : 'border-brass/25 bg-brass/10 text-brass'
              }`}
            >
              {data.mode === 'live' ? 'Live Neon' : data.mode === 'fallback' ? 'Fallback' : 'Mock'}
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[1400px] px-5 py-6 sm:px-8 sm:py-8">
        {data.mode === 'fallback' ? (
          <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            <strong>Live indisponível.</strong> Os KPIs abaixo são dados mock — não use para
            decisão operacional até o Neon responder.
          </div>
        ) : null}
        <section className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-brass">
              Visão consolidada
            </p>
            <h1 className="mt-2 max-w-3xl font-display text-3xl leading-tight tracking-tight sm:text-5xl">
              Duas unidades. Um comando.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted sm:text-base">
              Resumo sempre aberto. Detalhes em abas — abra só o que precisa.
            </p>
          </div>
          <SectionControls
            allOpen={allOpen}
            anyOpen={anySecondaryOpen}
            onExpandAll={expandAll}
            onCollapseAll={collapseSecondary}
          />
        </section>

        {/* Sempre visível — comando do dia */}
        <section className="animate-fade-up-delay-1 mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              label="Receita MTD"
              value={formatCurrency(c.mtdRevenue)}
              hint={`Meta ${formatCurrency(c.mtdGoal)} · ${formatPct(c.mtdGoalProgress)}`}
            />
            <div className="mt-3">
              <ProgressBar value={c.mtdGoalProgress} color="teal" />
            </div>
          </Panel>
          <Panel>
            <KpiStat
              label="Ocupação / Comparecimento"
              value={`${formatPct(c.occupancyRate)} · ${formatPct(c.attendanceRate)}`}
              hint={`No-show ${formatPct(c.noShowRate)}`}
              tone={c.noShowRate > 0.08 ? 'warn' : 'default'}
            />
          </Panel>
          <Panel>
            <KpiStat
              label="Ticket · Risco · Novos"
              value={formatCurrency(c.ticketAvg)}
              hint={`Risco ${formatCurrency(c.revenueAtRisk)} · ${c.newClients} novos · conv. ${formatPct(c.conversionRate)}`}
            />
          </Panel>
        </section>

        {!anySecondaryOpen ? (
          <p className="mt-4 text-xs text-muted">
            Painel limpo — use <span className="text-brass">Abrir</span> nas abas abaixo ou{' '}
            <span className="text-brass">Abrir tudo</span>.
          </p>
        ) : null}

        <section className="mt-6">
          <CollapsibleSection
            eyebrow="P0 · Operação"
            title="Ação do dia"
            subtitle="Vagas, cancelamentos e mix novos/recorrentes — Avec 0051 / 0052 / 0002."
            summary={`${c.openSlotsToday} vagas hoje · ${c.openSlotsNext2h} nas 2h · ${c.cancelledToday} cancel. · novos ${formatPct(c.newShare)}`}
            open={openMap.ops}
            onOpenChange={(v) => setSection('ops', v)}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-panel-2/60 px-3 py-3">
                <KpiStat
                  label="Vagas hoje"
                  value={String(c.openSlotsToday)}
                  hint="Capacidade − agendados (0051)"
                  tone={c.openSlotsToday >= 4 ? 'warn' : 'default'}
                />
              </div>
              <div className="rounded-xl border border-border/60 bg-panel-2/60 px-3 py-3">
                <KpiStat
                  label="Vagas nas próximas 2h"
                  value={String(c.openSlotsNext2h)}
                  hint="Encaixe imediato"
                  tone={c.openSlotsNext2h >= 2 ? 'warn' : 'good'}
                />
              </div>
              <div className="rounded-xl border border-border/60 bg-panel-2/60 px-3 py-3">
                <KpiStat
                  label="Cancel. · No-show"
                  value={`${c.cancelledToday} · ${c.noShowsToday}`}
                  hint="Avec 0052 + métricas do dia"
                  tone={c.cancelledToday + c.noShowsToday > 0 ? 'warn' : 'good'}
                />
              </div>
              <div className="rounded-xl border border-border/60 bg-panel-2/60 px-3 py-3">
                <KpiStat
                  label="Novos vs recorrentes"
                  value={`${c.newClients} · ${c.returningClients}`}
                  hint={`Share novos ${formatPct(c.newShare)}`}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {data.units.map((u) => (
                <div
                  key={u.unit.slug}
                  className="rounded-xl border border-border/60 bg-panel-2/40 px-4 py-3"
                >
                  <p className={`text-[0.65rem] uppercase tracking-[0.18em] ${unitAccent(u.unit.slug)}`}>
                    {u.unit.short}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="text-muted">Vagas 2h</p>
                      <p className="mt-0.5 text-sm font-medium">{u.opsP0.openSlotsNext2h}</p>
                    </div>
                    <div>
                      <p className="text-muted">Cancel.</p>
                      <p className="mt-0.5 text-sm font-medium">{u.opsP0.cancelledToday}</p>
                    </div>
                    <div>
                      <p className="text-muted">Novos %</p>
                      <p className="mt-0.5 text-sm font-medium">{formatPct(u.opsP0.newShare)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-5">
          <CollapsibleSection
            className="lg:col-span-3"
            eyebrow="Tendência"
            title="Receita 30 dias"
            subtitle="Brasil vs Iguatemi — onde o consolidado está sendo construído."
            summary="Gráfico consolidado · abrir para detalhar"
            open={openMap.trend}
            onOpenChange={(v) => setSection('trend', v)}
          >
            <div className="h-64 w-full sm:h-72">
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

          <CollapsibleSection
            className="lg:col-span-2"
            eyebrow="Comparativo"
            title="Quem lidera"
            subtitle="Sinais rápidos para alocar atenção."
            summary={`Receita: ${data.comparison.revenueLeader === 'rom-brasil' ? 'Brasil' : 'Iguatemi'}`}
            open={openMap.leaders}
            onOpenChange={(v) => setSection('leaders', v)}
          >
            <ul className="space-y-3">
              {[
                {
                  label: 'Receita MTD',
                  leader: data.comparison.revenueLeader,
                  icon: TrendingUp,
                },
                {
                  label: 'Ocupação hoje',
                  leader: data.comparison.occupancyLeader,
                  icon: Activity,
                },
                {
                  label: 'Comparecimento',
                  leader: data.comparison.attendanceLeader,
                  icon: CheckCircle2,
                },
                {
                  label: 'Ticket médio',
                  leader: data.comparison.ticketLeader,
                  icon: Users,
                },
              ].map((row) => {
                const Icon = row.icon
                const name = row.leader === 'rom-brasil' ? 'ROM Brasil' : 'ROM Iguatemi'
                return (
                  <li
                    key={row.label}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-panel-2/60 px-3 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={16} className="text-muted" />
                      <span className="text-sm text-muted">{row.label}</span>
                    </div>
                    <span className={`text-sm font-medium ${unitAccent(row.leader)}`}>{name}</span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Delta Brasil vs Iguatemi (MTD):{' '}
              <span className="text-foreground">
                {formatSignedPct(data.comparison.deltaRevenuePct)}
              </span>
            </p>
          </CollapsibleSection>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          {brasil ? (
            <CollapsibleSection
              eyebrow="Unidade"
              title={brasil.unit.name}
              subtitle={brasil.sync.label}
              summary={`${formatCurrency(brasil.today.revenue)} hoje · ${brasil.today.appointments} agend. · sync ${brasil.sync.status}`}
              open={openMap.brasil}
              onOpenChange={(v) => setSection('brasil', v)}
            >
              <UnitBody unit={brasil} />
            </CollapsibleSection>
          ) : null}
          {iguatemi ? (
            <CollapsibleSection
              eyebrow="Unidade"
              title={iguatemi.unit.name}
              subtitle={iguatemi.sync.label}
              summary={`${formatCurrency(iguatemi.today.revenue)} hoje · ${iguatemi.today.appointments} agend. · sync ${iguatemi.sync.status}`}
              open={openMap.iguatemi}
              onOpenChange={(v) => setSection('iguatemi', v)}
            >
              <UnitBody unit={iguatemi} />
            </CollapsibleSection>
          ) : null}
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <CollapsibleSection
            eyebrow="Alertas"
            title="O que exige ação agora"
            subtitle="Prioridade para não perder receita nem qualidade de dado."
            summary={
              data.alerts.length === 0
                ? 'Nenhum alerta'
                : `${data.alerts.length} alerta(s)${criticalAlerts ? ` · ${criticalAlerts} crítico(s)` : ''}`
            }
            open={openMap.alerts}
            onOpenChange={(v) => setSection('alerts', v)}
          >
            <ul className="space-y-3">
              {data.alerts.map((alert) => (
                <li
                  key={alert.id}
                  className={`rounded-xl border px-4 py-3 ${severityStyles(alert.severity)}`}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{alert.title}</p>
                      <p className="mt-1 text-xs text-muted">{alert.detail}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs text-foreground/80">
                        <ArrowRight size={12} />
                        {alert.action}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection
            eyebrow="Direção"
            title="Leituras para decidir"
            subtitle="Insights gerados a partir dos KPIs — o que mover primeiro."
            summary={`${data.decisions.length} leitura(s) de decisão`}
            open={openMap.decisions}
            onOpenChange={(v) => setSection('decisions', v)}
          >
            <ul className="space-y-3">
              {data.decisions.map((d) => (
                <li
                  key={d.id}
                  className="rounded-xl border border-border/70 bg-panel-2/50 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Compass size={15} className="text-brass" />
                    <p className="text-sm font-medium">{d.title}</p>
                    <span className="ml-auto text-[0.65rem] uppercase tracking-wider text-muted">
                      {d.impact}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{d.detail}</p>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5 text-xs text-muted">
          <p>
            Atualizado {formatDateTime(data.generatedAt)} ·{' '}
            {data.mode === 'live'
              ? 'Lendo Neons Brasil + Iguatemi (read-only)'
              : data.mode === 'fallback'
                ? 'Fallback mock — live falhou'
                : 'Modo mock — configure NEON_*_DATABASE_URL'}
          </p>
          <p className="flex items-center gap-1.5">
            <RefreshCw size={12} />
            Cérebro v0.3 · {data.mode}
          </p>
        </footer>
      </main>
    </div>
  )
}
