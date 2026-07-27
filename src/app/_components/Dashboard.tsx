'use client'

import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, AlertTriangle, ArrowRight, Brain, RefreshCw } from 'lucide-react'
import type {
  AlertItem,
  CerebroOverview,
  ComparisonGroup,
  ComparisonRow,
  UnitSlug,
  UnitSnapshot,
} from '@/lib/types'
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPct,
  formatSignedPct,
} from '@/lib/format'
import { KpiStat, Panel, ProgressBar } from './ui'
import { CollapsibleSection, SectionControls } from './CollapsibleSection'
import { LogoutButton } from './LogoutButton'
import { GoalsEditor } from './GoalsEditor'
import { ReportsPanel } from './ReportsPanel'

type SectionKey = 'acoes' | 'hoje' | 'semana' | 'comercial' | 'comparativo' | 'trend'

const DEFAULT_OPEN: Record<SectionKey, boolean> = {
  acoes: true,
  hoje: true,
  semana: false,
  comercial: false,
  comparativo: true,
  trend: false,
}

const GROUP_LABEL: Record<ComparisonGroup, string> = {
  ops: 'Operação',
  comercial: 'Comercial',
  financeiro: 'Financeiro Avec',
  estoque: 'Estoque Avec',
}

/** Legendas curtas — hover no rótulo + linha discreta no KPI. */
const LEGEND = {
  faturamento:
    'Soma da receita Avec do dia nas unidades ao vivo.',
  ocupacao:
    'Ocupação = agenda ÷ capacidade (Metas). Comparecimento = atendidos ÷ agendados. Risco = no-shows × ticket.',
  mtd: 'Receita acumulada no mês (MTD). Ticket = receita ÷ atendidos.',
  cmv: 'Proxy: custo das saídas de estoque no mês (Avec 0044) — não é CMV fiscal.',
  estoqueValor: 'Valor da posição de estoque sincronizada da Avec.',
  estoqueAlertas: 'Produtos abaixo do mínimo (alertas ativos no ROM Estoque).',
  vagasHoje: 'Capacidade do dia (Metas) − agendamentos do dia.',
  vagas2h: 'Estimativa de encaixes nas próximas 2h: (capacidade ÷ 8) × 2 − agenda nesse intervalo.',
  cancelNoshow: 'Cancelamentos e faltas do dia (Avec).',
  novosRec: 'Clientes novos vs recorrentes no dia.',
  unitHoje: 'Faturamento Avec da unidade hoje.',
  unitVagas: 'Capacidade (Metas) − agendamentos do dia nesta unidade.',
  unit2h: 'Vagas livres estimadas nas próximas 2 horas nesta unidade.',
  unitCancel: 'Cancelamentos e no-shows do dia nesta unidade.',
  unitNovos: 'Clientes novos vs recorrentes no dia nesta unidade.',
} as const

const HOJE_UNIT_ORDER: UnitSlug[] = ['rom-brasil', 'rom-iguatemi']
const HOJE_UNIT_LABEL: Record<UnitSlug, string> = {
  'rom-brasil': 'Brasil',
  'rom-iguatemi': 'Iguatemi',
}

function unitForHoje(units: UnitSnapshot[], slug: UnitSlug): UnitSnapshot | null {
  return units.find((u) => u.unit.slug === slug) ?? null
}

/** Rótulo curto de fonte (Avec / proxy / incompleto / desatualizado). */
function sourceHint(
  ...parts: Array<'Avec' | 'proxy' | 'manual' | 'ROM' | 'incompleto' | 'desatualizado' | null | undefined>
): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    if (!p || seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out.join(' · ')
}

function syncSourceLabel(status: string | undefined): 'incompleto' | 'desatualizado' | null {
  if (status === 'error' || status === 'partial') return 'incompleto'
  if (status === 'stale') return 'desatualizado'
  return null
}

const COMPARISON_LEGEND: Partial<Record<string, string>> = {
  revenue_today: 'Receita Avec do dia.',
  goal_pct: 'Receita do dia ÷ meta diária (Metas).',
  occupancy: 'Agendamentos ÷ capacidade (Metas).',
  noshow: 'No-shows ÷ agendamentos do dia.',
  lost_revenue: '(Cancelamentos + no-shows) × ticket médio do dia.',
  ticket: 'Receita ÷ atendidos (hoje).',
  return: 'Taxa de retorno (Avec / P3).',
  packages: 'Receita de pacotes (Avec 0061).',
  mtd_revenue: 'Receita acumulada no mês.',
  mtd_ticket: 'Receita MTD ÷ atendidos MTD.',
  cmv: 'Proxy: custo das saídas de estoque no mês (0044).',
  cmv_share: 'CMV proxy ÷ receita MTD.',
  payments_total: 'Soma das formas de pagamento (Avec 0081).',
  payment_gap: 'Pagamentos 0081 − receita MTD (ideal ≈ 0).',
  payment_reconcile: 'Status da conciliação 0081 vs receita.',
  top_payment: 'Forma de pagamento com maior volume no período.',
  stock_value: 'Valor em estoque (posição Avec).',
  stock_alerts: 'Alertas ativos de estoque baixo.',
  stock_zero: 'SKUs com saldo zero.',
}

function severityStyles(severity: 'critical' | 'warning' | 'info') {
  if (severity === 'critical') return 'border-danger/40 bg-danger/10 text-danger'
  if (severity === 'warning') return 'border-warning/40 bg-warning/10 text-warning'
  return 'border-info/40 bg-info/10 text-info'
}

function unitAccent(slug: string) {
  return slug === 'rom-brasil' ? 'text-brass' : 'text-teal'
}

function unitChip(unit: AlertItem['unit']) {
  if (unit === 'both') {
    return (
      <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-muted">
        Rede
      </span>
    )
  }
  const label = unit === 'rom-brasil' ? 'Brasil' : 'Iguatemi'
  const cls =
    unit === 'rom-brasil'
      ? 'border-brass/40 bg-brass/10 text-brass'
      : 'border-teal/40 bg-teal/10 text-teal'
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

function formatRowValue(
  row: ComparisonRow,
  side: 'brasil' | 'iguatemi',
): string {
  if (row.format === 'text') {
    const text = side === 'brasil' ? row.brasilText : row.iguatemiText
    return text?.trim() ? text : '—'
  }
  const value = side === 'brasil' ? row.brasil : row.iguatemi
  if (value == null || !Number.isFinite(value)) return '—'
  switch (row.format) {
    case 'currency':
      return formatCurrency(value)
    case 'pct':
      return formatPct(value)
    case 'number':
      return formatNumber(value)
    default: {
      const _exhaustive: never = row.format
      return String(_exhaustive)
    }
  }
}

function deltaTone(row: ComparisonRow): string {
  if (row.deltaPct == null) return 'text-muted'
  const good =
    (row.higherIsBetter && row.deltaPct > 0) || (!row.higherIsBetter && row.deltaPct < 0)
  const bad =
    (row.higherIsBetter && row.deltaPct < 0) || (!row.higherIsBetter && row.deltaPct > 0)
  if (good) return 'text-success'
  if (bad) return 'text-danger'
  return 'text-muted'
}

export function Dashboard({
  data,
  onRefresh,
}: {
  data: CerebroOverview
  onRefresh?: () => void
}) {
  const c = data.consolidated
  const goalTone = !c.goalsConfigured
    ? 'warn'
    : !c.todayOpsActive
      ? 'default'
      : c.todayGoalProgress >= 1
        ? 'good'
        : c.todayGoalProgress >= 0.7
          ? 'default'
          : 'warn'

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

  const comparisonGroups = useMemo(() => {
    const rows = data.comparison?.rows ?? []
    const order: ComparisonGroup[] = ['ops', 'comercial', 'financeiro', 'estoque']
    return order
      .map((group) => ({ group, rows: rows.filter((r) => r.group === group) }))
      .filter((g) => g.rows.length > 0)
  }, [data.comparison])

  const actionsSummary = useMemo(() => {
    const n = data.nextActions.length
    if (n === 0) return ''
    const critical = data.nextActions.filter((a) => a.severity === 'critical').length
    const base = `${n} item${n === 1 ? '' : 's'}`
    if (critical === 0) return base
    return `${base} · ${critical} crítico${critical === 1 ? '' : 's'}`
  }, [data.nextActions])

  const networkSyncSource = useMemo(() => {
    const statuses = data.units.map((u) => u.sync.status)
    if (statuses.some((s) => s === 'stale')) return 'desatualizado' as const
    if (statuses.some((s) => s === 'error' || s === 'partial') || data.partial) {
      return 'incompleto' as const
    }
    return null
  }, [data.units, data.partial])

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
              {data.partial
                ? 'Visão parcial — o que mover agora'
                : data.units.some((u) => !u.sync.offline)
                  ? 'O que mover agora'
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
              setOpenMap({
                acoes: true,
                hoje: true,
                semana: true,
                comercial: true,
                comparativo: true,
                trend: true,
              })
            }
            onCollapseAll={() =>
              setOpenMap({
                acoes: false,
                hoje: false,
                semana: false,
                comercial: false,
                comparativo: false,
                trend: false,
              })
            }
          />
        </section>

        <section className="mt-6 space-y-3">
          <GoalsEditor data={data} onSaved={() => onRefresh?.()} />
          <ReportsPanel />
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Panel>
            <KpiStat
              label="Faturamento hoje"
              value={formatCurrency(c.todayRevenue)}
              hint={
                !c.goalsConfigured
                  ? 'Defina as metas para acompanhar progresso'
                  : !c.todayOpsActive
                    ? 'Sem unidades em operação hoje'
                    : `Meta ${formatCurrency(c.todayGoal)} · ${formatPct(c.todayGoalProgress)}`
              }
              source={sourceHint('Avec', networkSyncSource)}
              legend={LEGEND.faturamento}
              tone={goalTone}
            />
            {c.goalsConfigured && c.todayOpsActive ? (
              <div className="mt-3">
                <ProgressBar
                  value={c.todayGoalProgress}
                  color={c.todayGoalProgress >= 1 ? 'success' : 'brass'}
                />
              </div>
            ) : null}
          </Panel>
          <Panel>
            <KpiStat
              label="Ocupação · Comparec."
              value={
                c.occupancyConfigured
                  ? `${formatPct(c.occupancyRate)} · ${formatPct(c.attendanceRate)}`
                  : '— · —'
              }
              hint={
                c.occupancyConfigured
                  ? `No-show ${formatPct(c.noShowRate)} · risco ${formatCurrency(c.revenueAtRisk)}`
                  : 'Agenda do dia ainda não confiável / sem operação'
              }
              source={sourceHint('Avec', networkSyncSource)}
              legend={LEGEND.ocupacao}
              tone={c.occupancyConfigured && c.noShowRate > 0.08 ? 'warn' : 'default'}
            />
          </Panel>
          <Panel>
            <KpiStat
              label="MTD · Ticket"
              value={formatCurrency(c.mtdRevenue)}
              hint={
                c.goalsConfigured
                  ? `${formatPct(c.mtdGoalProgress)} da meta · ticket ${formatCurrency(c.mtdTicketAvg)}`
                  : `Ticket ${formatCurrency(c.mtdTicketAvg)} · CMV ${formatCurrency(c.cmv)}`
              }
              source={sourceHint('Avec', networkSyncSource)}
              legend={LEGEND.mtd}
            />
            {c.goalsConfigured ? (
              <div className="mt-3">
                <ProgressBar value={c.mtdGoalProgress} color="teal" />
              </div>
            ) : null}
          </Panel>
        </section>

        {(c.cmv > 0 || c.stockValue > 0 || c.stockAlerts > 0) && (
          <section className="mt-3 grid gap-3 sm:grid-cols-3">
            <Panel>
              <KpiStat
                label="CMV rede (MTD)"
                value={formatCurrency(c.cmv)}
                hint={c.cmvShare != null ? `${formatPct(c.cmvShare)} da receita` : undefined}
                source={sourceHint('proxy', 'Avec', networkSyncSource)}
                legend={LEGEND.cmv}
              />
            </Panel>
            <Panel>
              <KpiStat
                label="Estoque (valor)"
                value={formatCurrency(c.stockValue)}
                source={sourceHint('Avec', networkSyncSource)}
                legend={LEGEND.estoqueValor}
              />
            </Panel>
            <Panel>
              <KpiStat
                label="Alertas estoque"
                value={formatNumber(c.stockAlerts)}
                tone={c.stockAlerts >= 200 ? 'default' : c.stockAlerts >= 3 ? 'warn' : 'default'}
                source={sourceHint('Avec')}
                legend={LEGEND.estoqueAlertas}
              />
            </Panel>
          </section>
        )}

        {data.nextActions.length > 0 ? (
          <section className="mt-6">
            <CollapsibleSection
              eyebrow="Prioridade"
              title="Próximas ações"
              summary={actionsSummary}
              open={openMap.acoes}
              onOpenChange={(v) => setSection('acoes', v)}
            >
              <ul className="space-y-2">
                {data.nextActions.map((a) => (
                  <li
                    key={a.id}
                    className={`flex items-start gap-2 rounded-xl border px-4 py-3 ${severityStyles(a.severity)}`}
                  >
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{a.title}</p>
                        {unitChip(a.unit)}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{a.detail}</p>
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-foreground/80">
                        <ArrowRight size={11} />
                        {a.action}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          </section>
        ) : null}

        <section className="mt-6">
          <CollapsibleSection
            eyebrow="1 · Hoje"
            title="Ação do dia"
            summary="Brasil e Iguatemi — mesmos indicadores"
            open={openMap.hoje}
            onOpenChange={(v) => setSection('hoje', v)}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {HOJE_UNIT_ORDER.map((slug) => {
                const u = unitForHoje(data.units, slug)
                const label = u?.unit.short ?? HOJE_UNIT_LABEL[slug]
                const offline = !u || Boolean(u.sync.offline)
                const syncBad =
                  !offline &&
                  (u.sync.status === 'error' ||
                    u.sync.status === 'partial' ||
                    u.sync.status === 'stale')
                const src = offline
                  ? 'offline'
                  : sourceHint('Avec', 'ROM', syncSourceLabel(u.sync.status))
                const dash = '—'
                const noDayMovement =
                  !offline &&
                  u.today.revenue === 0 &&
                  u.today.attended === 0 &&
                  u.today.appointments < 3
                const quiet = !offline && !syncBad && noDayMovement
                const agendaUnknown =
                  !offline &&
                  u.today.appointments < 3 &&
                  u.today.attended === 0 &&
                  u.sync.status !== 'ok'
                const revenue = offline ? dash : formatCurrency(u.today.revenue)
                const vagasHoje =
                  offline || !u.today.capacitySet
                    ? dash
                    : agendaUnknown
                      ? dash
                      : noDayMovement
                        ? 'Sem agenda'
                        : String(u.opsToday.openSlotsToday)
                const vagas2h =
                  offline || !u.today.capacitySet
                    ? dash
                    : agendaUnknown || noDayMovement
                      ? dash
                      : String(u.opsToday.openSlotsNext2h)
                const cancelNoshow = offline
                  ? dash
                  : noDayMovement
                    ? dash
                    : `${u.today.cancelled} · ${u.today.noShows}`
                const novosRec = offline || noDayMovement
                  ? dash
                  : `${u.today.newClients} · ${u.today.returningClients}`
                const borderAccent =
                  slug === 'rom-brasil' ? 'border-brass/35' : 'border-teal/35'

                return (
                  <div
                    key={slug}
                    className={`rounded-xl border ${borderAccent} bg-panel-2/50 px-4 py-4`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={`text-sm font-medium uppercase tracking-[0.18em] ${unitAccent(slug)}`}
                        >
                          {label}
                        </p>
                        <p className="mt-0.5 text-[0.65rem] text-muted">
                          {offline
                            ? 'Sem dados ao vivo'
                            : syncBad
                              ? u.sync.label
                              : quiet
                                ? 'Sem movimento hoje · salão quieto/fechado'
                                : u.sync.label}
                        </p>
                      </div>
                      {offline ? (
                        <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-warning">
                          Offline
                        </span>
                      ) : u.sync.status === 'error' ? (
                        <span className="rounded-md border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-danger">
                          Sync
                        </span>
                      ) : u.sync.status === 'partial' ? (
                        <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-warning">
                          Parcial
                        </span>
                      ) : quiet ? (
                        <span className="rounded-md border border-border/60 bg-panel px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-muted">
                          Quieto
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
                      <div>
                        <p
                          className="cursor-help text-[0.65rem] uppercase tracking-[0.14em] text-muted underline decoration-dotted decoration-muted/40 underline-offset-2"
                          title={LEGEND.unitHoje}
                        >
                          Faturamento
                        </p>
                        <p className="mt-1 font-display text-xl tracking-tight text-foreground sm:text-2xl">
                          {revenue}
                        </p>
                        <p className="mt-0.5 text-[0.55rem] uppercase tracking-wide text-muted/70">
                          {src}
                        </p>
                      </div>
                      <div>
                        <p
                          className="cursor-help text-[0.65rem] uppercase tracking-[0.14em] text-muted underline decoration-dotted decoration-muted/40 underline-offset-2"
                          title={LEGEND.unitVagas}
                        >
                          Vagas hoje
                        </p>
                        <p
                          className={`mt-1 font-display text-xl tracking-tight sm:text-2xl ${
                            !offline && !noDayMovement && u.opsToday.openSlotsToday >= 4
                              ? 'text-warning'
                              : noDayMovement
                                ? 'text-muted'
                                : 'text-foreground'
                          }`}
                        >
                          {vagasHoje}
                        </p>
                      </div>
                      <div>
                        <p
                          className="cursor-help text-[0.65rem] uppercase tracking-[0.14em] text-muted underline decoration-dotted decoration-muted/40 underline-offset-2"
                          title={LEGEND.unit2h}
                        >
                          Vagas 2h
                        </p>
                        <p className="mt-1 font-display text-xl tracking-tight text-foreground sm:text-2xl">
                          {vagas2h}
                        </p>
                      </div>
                      <div>
                        <p
                          className="cursor-help text-[0.65rem] uppercase tracking-[0.14em] text-muted underline decoration-dotted decoration-muted/40 underline-offset-2"
                          title={LEGEND.unitCancel}
                        >
                          Cancel. · No-show
                        </p>
                        <p
                          className={`mt-1 font-display text-xl tracking-tight sm:text-2xl ${
                            !offline &&
                            !noDayMovement &&
                            u.today.cancelled + u.today.noShows > 0
                              ? 'text-warning'
                              : 'text-foreground'
                          }`}
                        >
                          {cancelNoshow}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p
                          className="cursor-help text-[0.65rem] uppercase tracking-[0.14em] text-muted underline decoration-dotted decoration-muted/40 underline-offset-2"
                          title={LEGEND.unitNovos}
                        >
                          Novos · Recorrentes
                        </p>
                        <p className="mt-1 font-display text-xl tracking-tight text-foreground sm:text-2xl">
                          {novosRec}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        </section>

        <section className="mt-4">
          <CollapsibleSection
            eyebrow="2 · Semana"
            title="Equipe e retenção"
            summary="Top 10 pros · retorno · sem retorno (90d)"
            open={openMap.semana}
            onOpenChange={(v) => setSection('semana', v)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {data.units.map((u) => {
                const w = u.opsWeek
                const offline = Boolean(u.sync.offline)
                const empty =
                  !offline &&
                  w.professionals.length === 0 &&
                  w.services.length === 0 &&
                  (w.returnRate == null || w.returnRate === 0) &&
                  w.reactivationCount === 0
                // Avec 0107 pagina até ~5000 linhas — 5000 é teto, não o total real.
                const semRetornoLabel =
                  w.reactivationCount >= 5000
                    ? '5.000+'
                    : formatNumber(w.reactivationCount)
                return (
                  <div
                    key={u.unit.slug}
                    className="rounded-xl border border-border/50 bg-panel-2/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs uppercase tracking-wider ${unitAccent(u.unit.slug)}`}>
                        {u.unit.short}
                      </p>
                      {offline ? (
                        <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-warning">
                          Offline
                        </span>
                      ) : null}
                    </div>
                    {offline ? (
                      <p className="mt-3 text-sm text-muted">
                        Unidade offline — sem ranking/retorno desta base.
                      </p>
                    ) : empty ? (
                      <p className="mt-3 text-sm text-muted">Sem dados — sync full + token Avec.</p>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm">
                        <ul className="space-y-1">
                          {w.professionals.slice(0, 10).map((p, i) => (
                            <li key={p.name} className="flex justify-between gap-2">
                              <span className="truncate text-muted">
                                <span className="mr-1.5 tabular-nums text-muted/70">{i + 1}.</span>
                                {p.name}
                              </span>
                              <span className="shrink-0 tabular-nums">{formatCurrency(p.revenue)}</span>
                            </li>
                          ))}
                        </ul>
                        <p
                          className="text-xs text-muted"
                          title="Sem retorno = clientes sem visita na janela Avec 0107 (90 dias). 5.000+ = lista truncada pela paginação."
                        >
                          Retorno {formatPct(w.returnRate)} · sem retorno (90d) {semRetornoLabel} ·
                          novos {formatNumber(w.newClientsPeriod)}
                        </p>
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
            summary="Booking · pacotes · notas"
            open={openMap.comercial}
            onOpenChange={(v) => setSection('comercial', v)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {data.units.map((u) => {
                const co = u.opsCommerce
                const offline = Boolean(u.sync.offline)
                const empty =
                  !offline &&
                  co.bookingChannels.length === 0 &&
                  co.packages.length === 0 &&
                  co.ratingsCount === 0
                return (
                  <div
                    key={u.unit.slug}
                    className="rounded-xl border border-border/50 bg-panel-2/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs uppercase tracking-wider ${unitAccent(u.unit.slug)}`}>
                        {u.unit.short}
                      </p>
                      {offline ? (
                        <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-warning">
                          Offline
                        </span>
                      ) : null}
                    </div>
                    {offline ? (
                      <p className="mt-3 text-sm text-muted">
                        Unidade offline — sem canais/pacotes desta base.
                      </p>
                    ) : empty ? (
                      <p className="mt-3 text-sm text-muted">
                        Sem canais/pacotes no último sync full Avec (0056/0061).
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                          <ul className="space-y-1">
                            {co.bookingChannels.slice(0, 3).map((ch) => (
                              <li key={ch.channel} className="flex justify-between gap-2">
                                <span className="truncate text-muted">{ch.channel}</span>
                                <span>{formatNumber(ch.count)}</span>
                              </li>
                            ))}
                            {co.bookingChannels.length === 0 ? (
                              <li className="text-xs text-muted">Sem canais</li>
                            ) : null}
                          </ul>
                          <ul className="space-y-1">
                            {co.packages.slice(0, 3).map((p) => (
                              <li key={p.name} className="flex justify-between gap-2">
                                <span className="truncate text-muted">{p.name}</span>
                                <span>×{p.quantity}</span>
                              </li>
                            ))}
                            {co.packages.length === 0 ? (
                              <li className="text-xs text-muted">Sem pacotes</li>
                            ) : null}
                          </ul>
                        </div>
                        <p className="text-xs text-muted">
                          Pacotes {formatCurrency(co.packagesRevenue)} · {formatNumber(co.packagesSold)}{' '}
                          vendidos
                          {co.ratingsCount > 0
                            ? ` · nota ${co.ratingsAvg.toFixed(1)} (${formatNumber(co.ratingsCount)})`
                            : ''}
                        </p>
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
              title="Brasil × Iguatemi"
              summary={
                data.comparison.deltaRevenuePct == null
                  ? 'Scorecard Avec'
                  : `Δ receita MTD ${formatSignedPct(data.comparison.deltaRevenuePct)}`
              }
              open={openMap.comparativo}
              onOpenChange={(v) => setSection('comparativo', v)}
            >
              <div className="sticky top-0 z-10 mb-3 hidden grid-cols-[1.2fr_1fr_1fr_0.8fr] gap-2 border-b border-border/50 bg-surface/95 px-1 py-2 text-[0.65rem] uppercase tracking-[0.14em] text-muted backdrop-blur sm:grid">
                <span>KPI</span>
                <span className="text-brass">Brasil</span>
                <span className="text-teal">Iguatemi</span>
                <span className="text-right" title="Moeda/contagem: Δ relativa %. Taxas: pontos percentuais.">
                  Δ
                </span>
              </div>
              <div className="space-y-5">
                {comparisonGroups.map(({ group, rows }) => (
                  <div key={group}>
                    <p className="mb-2 text-[0.65rem] uppercase tracking-[0.18em] text-brass">
                      {GROUP_LABEL[group]}
                    </p>
                    <ul className="space-y-2">
                      {rows.map((row) => (
                        <li
                          key={row.key}
                          className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-panel-2/60 px-3 py-3 sm:grid-cols-[1.2fr_1fr_1fr_0.8fr] sm:items-center"
                        >
                          <span
                            className={`col-span-2 text-sm text-muted sm:col-span-1 ${
                              COMPARISON_LEGEND[row.key]
                                ? 'cursor-help underline decoration-dotted decoration-muted/40 underline-offset-2'
                                : ''
                            }`}
                            title={COMPARISON_LEGEND[row.key]}
                          >
                            {row.label}
                          </span>
                          <span className="text-sm text-brass">
                            <span className="mr-1 text-[0.65rem] uppercase text-muted sm:hidden">
                              BR
                            </span>
                            {formatRowValue(row, 'brasil')}
                          </span>
                          <span className="text-sm text-teal">
                            <span className="mr-1 text-[0.65rem] uppercase text-muted sm:hidden">
                              IG
                            </span>
                            {formatRowValue(row, 'iguatemi')}
                          </span>
                          <span
                            className={`text-right text-sm tabular-nums ${
                              row.format === 'text' ? 'text-muted' : deltaTone(row)
                            }`}
                            title={
                              row.format === 'pct'
                                ? 'Diferença em pontos percentuais (não Δ relativa)'
                                : undefined
                            }
                          >
                            {row.format === 'text'
                              ? '—'
                              : row.deltaPct == null
                                ? '—'
                                : row.format === 'pct'
                                  ? `${formatSignedPct(row.deltaPct)} p.p.`
                                  : formatSignedPct(row.deltaPct)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                <Activity size={12} />
                Só KPIs Avec · despesas manuais ficam no ROM Financeiro
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
                      formatter={(value) =>
                        value == null || !Number.isFinite(Number(value))
                          ? '—'
                          : formatCurrency(Number(value))
                      }
                    />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      wrapperStyle={{ fontSize: 12, color: '#9a9488' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="brasil"
                      name="Brasil"
                      stroke="#c9a45c"
                      fill="url(#gBrasil)"
                      strokeWidth={2}
                      connectNulls={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="iguatemi"
                      name="Iguatemi"
                      stroke="#6fafa0"
                      fill="url(#gIgua)"
                      strokeWidth={2}
                      connectNulls={false}
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
              ? 'Brasil (Supabase) + Iguatemi (Neon) · KPIs Avec'
              : data.mode === 'degraded'
                ? 'Sem fallback fictício'
                : 'Mock'}
          </p>
          <p className="flex items-center gap-1.5">
            <RefreshCw size={12} />
            Cérebro v1.1 · {data.mode}
          </p>
        </footer>
      </main>
    </div>
  )
}
