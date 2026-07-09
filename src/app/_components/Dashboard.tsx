'use client'

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
import { formatCurrency, formatDateTime, formatNumber, formatPct } from '@/lib/format'
import { KpiStat, Panel, ProgressBar, SectionTitle } from './ui'
import { LogoutButton } from './LogoutButton'

function severityStyles(severity: 'critical' | 'warning' | 'info') {
  if (severity === 'critical') return 'border-danger/40 bg-danger/10 text-danger'
  if (severity === 'warning') return 'border-warning/40 bg-warning/10 text-warning'
  return 'border-info/40 bg-info/10 text-info'
}

function unitAccent(slug: string) {
  return slug === 'rom-brasil' ? 'text-brass' : 'text-teal'
}

function UnitCard({ unit }: { unit: UnitSnapshot }) {
  const occupancy = unit.today.appointments / Math.max(1, unit.today.capacity)
  const attendance = unit.today.attended / Math.max(1, unit.today.appointments)
  const goalProgress = unit.today.revenue / Math.max(1, unit.today.dailyGoal)
  const mtdProgress = unit.mtd.revenue / Math.max(1, unit.mtd.goal)
  const accentBar = unit.unit.slug === 'rom-brasil' ? 'brass' : 'teal'

  return (
    <Panel className="animate-fade-up-delay-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[0.65rem] uppercase tracking-[0.2em] ${unitAccent(unit.unit.slug)}`}>
            Unidade
          </p>
          <h3 className="mt-1 font-display text-2xl tracking-tight">{unit.unit.name}</h3>
        </div>
        <div
          className={`rounded-full border px-2.5 py-1 text-[0.65rem] uppercase tracking-wider ${
            unit.sync.status === 'ok'
              ? 'border-success/40 text-success'
              : unit.sync.status === 'stale'
                ? 'border-warning/40 text-warning'
                : 'border-danger/40 text-danger'
          }`}
        >
          {unit.sync.status === 'ok' ? 'Sync OK' : unit.sync.status === 'stale' ? 'Sync atrasado' : 'Erro'}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
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
        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">Top profissionais (MTD)</p>
        <ul className="mt-2 space-y-2">
          {unit.topProfessionals.map((p) => (
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
          ))}
        </ul>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
        <Clock3 size={12} />
        {unit.sync.label}
      </p>
    </Panel>
  )
}

export function Dashboard({ data }: { data: CerebroOverview }) {
  const c = data.consolidated
  const goalTone =
    c.todayGoalProgress >= 1 ? 'good' : c.todayGoalProgress >= 0.7 ? 'default' : 'warn'

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
                  : 'border-brass/25 bg-brass/10 text-brass'
              }`}
            >
              {data.mode === 'live' ? 'Live Neon' : 'Mock'}
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[1400px] px-5 py-6 sm:px-8 sm:py-8">
        <section className="animate-fade-up">
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-brass">Visão consolidada</p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl leading-tight tracking-tight sm:text-5xl">
            Duas unidades. Um comando. Números para decidir.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted sm:text-base">
            KPIs de receita, ocupação, comparecimento e risco — lado a lado — para conduzir o
            negócio com precisão.
          </p>
        </section>

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

        <section className="mt-8 grid gap-4 lg:grid-cols-5">
          <Panel className="animate-fade-up-delay-2 lg:col-span-3">
            <SectionTitle
              eyebrow="Tendência"
              title="Receita 30 dias"
              subtitle="Brasil vs Iguatemi — onde o consolidado está sendo construído."
            />
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
          </Panel>

          <Panel className="animate-fade-up-delay-3 lg:col-span-2">
            <SectionTitle
              eyebrow="Comparativo"
              title="Quem lidera"
              subtitle="Sinais rápidos para alocar atenção."
            />
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
                const name =
                  row.leader === 'rom-brasil' ? 'ROM Brasil' : 'ROM Iguatemi'
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
                {data.comparison.deltaRevenuePct >= 0 ? '+' : ''}
                {formatPct(Math.abs(data.comparison.deltaRevenuePct))}
              </span>
            </p>
          </Panel>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          {data.units.map((unit) => (
            <UnitCard key={unit.unit.slug} unit={unit} />
          ))}
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <Panel className="animate-fade-up-delay-2">
            <SectionTitle
              eyebrow="Alertas"
              title="O que exige ação agora"
              subtitle="Prioridade para não perder receita nem qualidade de dado."
            />
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
          </Panel>

          <Panel className="animate-fade-up-delay-3">
            <SectionTitle
              eyebrow="Direção"
              title="Leituras para decidir"
              subtitle="Insights gerados a partir dos KPIs — o que mover primeiro."
            />
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
          </Panel>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5 text-xs text-muted">
          <p>
            Atualizado {formatDateTime(data.generatedAt)} ·{' '}
            {data.mode === 'live'
              ? 'Lendo Neons Brasil + Iguatemi (read-only)'
              : 'Modo mock — configure NEON_*_DATABASE_URL'}
          </p>
          <p className="flex items-center gap-1.5">
            <RefreshCw size={12} />
            Cérebro v0.2 · {data.mode}
          </p>
        </footer>
      </main>
    </div>
  )
}
