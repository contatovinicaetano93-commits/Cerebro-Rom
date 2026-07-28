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
import {
  hasTrustedAgenda,
  isDayOperable,
  isMetricsHollow,
  isSalonActiveToday,
  isSyncHardFail,
  isUnitConnected,
  isUnitReadable,
} from '@/lib/salon-day'
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

function unreadableBlockCopy(
  u: UnitSnapshot,
  scope: 'semana' | 'comercial',
): string {
  const offline = Boolean(u.sync.offline)
  const hardFail = !offline && isSyncHardFail(u)
  if (scope === 'semana') {
    if (offline) return 'Unidade offline — sem ranking/retorno desta base.'
    if (/Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)) return u.sync.label
    if (hardFail) return 'Sync quebrado — sem ranking/retorno desta base.'
    return 'Dados indisponíveis desta base.'
  }
  if (offline) return 'Unidade offline — sem canais/pacotes desta base.'
  if (/Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)) return u.sync.label
  if (hardFail) return 'Sync quebrado — sem canais/pacotes desta base.'
  return 'Dados indisponíveis desta base.'
}

function layerEmptyCopy(scope: 'semana' | 'comercial', hollow: boolean): string {
  if (scope === 'semana') {
    return hollow
      ? 'Ranking/retorno ainda vazios nesta base (sync full + P1/P3).'
      : 'Sem ranking/retorno no último sync full Avec.'
  }
  return hollow
    ? 'Canais/pacotes ainda vazios nesta base (sync full + 0056/0061).'
    : 'Sem canais/pacotes no último sync full Avec (0056/0061).'
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
  lost_revenue:
    '(Cancelamentos + no-shows) × ticket do dia; se ainda sem atendimento, usa ticket MTD.',
  ticket: 'Receita ÷ atendidos (hoje).',
  return: 'Taxa de retorno (Avec / P3). — = P3 sem taxa nesta base (ex.: cutover).',
  packages: 'Receita de pacotes (Avec 0061).',
  mtd_revenue: 'Receita acumulada no mês.',
  mtd_ticket: 'Receita MTD ÷ atendidos MTD.',
  cmv: 'Proxy: custo das saídas de estoque no mês. — = sem saídas/0044 nesta base.',
  cmv_share: 'CMV proxy ÷ receita MTD.',
  payments_total: 'Soma das formas de pagamento (Avec 0081).',
  payment_gap:
    'Pagamentos 0081 − receita MTD (ideal ≈ 0). Δ% some se um lado ≈ 0 (evita % absurda).',
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
  if (row.deltaPct == null) {
    // Gap 0081: sem Δ% — tom pelo sinal do valor absoluto BR−IG.
    if (
      row.key === 'payment_gap' &&
      row.brasil != null &&
      row.iguatemi != null &&
      Number.isFinite(row.brasil) &&
      Number.isFinite(row.iguatemi)
    ) {
      const abs = row.brasil - row.iguatemi
      if (abs === 0) return 'text-muted'
      // higherIsBetter false: gap mais negativo (BR pior) → danger se BR < IG (mais negativo)
      return abs < 0 ? 'text-danger' : 'text-success'
    }
    return 'text-muted'
  }
  const good =
    (row.higherIsBetter && row.deltaPct > 0) || (!row.higherIsBetter && row.deltaPct < 0)
  const bad =
    (row.higherIsBetter && row.deltaPct < 0) || (!row.higherIsBetter && row.deltaPct > 0)
  if (good) return 'text-success'
  if (bad) return 'text-danger'
  return 'text-muted'
}

function formatDeltaCell(row: ComparisonRow): string {
  if (row.format === 'text') return '—'
  if (row.deltaPct != null) {
    return row.format === 'pct'
      ? `${formatSignedPct(row.deltaPct)} p.p.`
      : formatSignedPct(row.deltaPct)
  }
  // payment_gap sem Δ%: mostra diferença absoluta em R$ (legível).
  if (
    row.key === 'payment_gap' &&
    row.brasil != null &&
    row.iguatemi != null &&
    Number.isFinite(row.brasil) &&
    Number.isFinite(row.iguatemi)
  ) {
    const abs = row.brasil - row.iguatemi
    const sign = abs > 0 ? '+' : abs < 0 ? '−' : ''
    return `${sign}${formatCurrency(Math.abs(abs))}`
  }
  return '—'
}

export function Dashboard({
  data,
  onRefresh,
}: {
  data: CerebroOverview
  onRefresh?: () => void
}) {
  const c = data.consolidated
  const goalTone = !c.networkReadable
    ? 'warn'
    : !c.goalsConfigured
      ? 'warn'
      : !c.todayMoneyActive
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

  const actionsBoard = useMemo(() => {
    const all = data.nextActions
    const score = (a: AlertItem): number => {
      const sev = a.severity === 'critical' ? 0 : a.severity === 'warning' ? 1 : 2
      const family = a.id.replace(/-(rom-brasil|rom-iguatemi|both)$/i, '')
      const familyRank: Record<string, number> = {
        'sync-error': 0,
        'sync-partial': 1,
        'sync-stale': 2,
        noshow: 3,
        cancel: 4,
        pay: 5,
        'return-missing': 6,
        return: 7,
        'stock-alerts-missing': 8,
        'goal-gap': 9,
        slots: 10,
        'stock-alert': 11,
        'react-cap': 12,
        react: 13,
      }
      return sev * 100 + (familyRank[family] ?? 50)
    }
    const ranked = [...all].sort((a, b) => score(a) - score(b))
    // Top 3: só critical/warning — o que Waltter resolve agora.
    const topNow = ranked
      .filter((a) => a.severity === 'critical' || a.severity === 'warning')
      .slice(0, 3)
    const topIds = new Set(topNow.map((a) => a.id))
    const rest = ranked.filter((a) => !topIds.has(a.id))
    return {
      topNow,
      brasil: rest.filter((a) => a.unit === 'rom-brasil'),
      iguatemi: rest.filter((a) => a.unit === 'rom-iguatemi'),
      rede: rest.filter((a) => a.unit === 'both'),
    }
  }, [data.nextActions])

  const actionsSummary = useMemo(() => {
    const n = data.nextActions.length
    if (n === 0) return ''
    const top = actionsBoard.topNow.length
    const critical = data.nextActions.filter((a) => a.severity === 'critical').length
    if (critical > 0) return `${n} · ${critical} crítico${critical === 1 ? '' : 's'}`
    if (top > 0) return `${n} · ${top} agora`
    return `${n} item${n === 1 ? '' : 's'}`
  }, [data.nextActions, actionsBoard])

  const networkSyncSource = useMemo(() => {
    const statuses = data.units.map((u) => u.sync.status)
    const hollowOnly =
      data.partial &&
      data.units.some((u) => isMetricsHollow(u)) &&
      !statuses.some((s) => s === 'error' || s === 'partial') &&
      !data.units.some((u) => u.sync.offline)
    if (hollowOnly) return 'incompleto' as const
    // Prioridade: error/partial (incompleto) > stale (desatualizado) — não suavizar token morto.
    if (statuses.some((s) => s === 'error' || s === 'partial') || data.partial) {
      return 'incompleto' as const
    }
    if (statuses.some((s) => s === 'stale')) return 'desatualizado' as const
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
            <a
              href="/comparativo"
              className="rounded-xl border border-teal/35 bg-teal/10 px-3 py-1.5 text-xs text-teal hover:border-teal/55"
            >
              Comparativo
            </a>
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
                  : data.units.some((u) => u.sync.offline)
                    ? 'Totais refletem só unidades ao vivo.'
                    : data.units.some((u) => u.sync.status === 'error')
                      ? 'Sync com erro em alguma unidade — KPIs do dia podem estar incompletos.'
                      : data.units.some((u) => isMetricsHollow(u)) &&
                          !data.units.some(
                            (u) =>
                              !u.sync.offline &&
                              (u.sync.status === 'partial' || u.sync.status === 'error'),
                          )
                        ? 'Alguma unidade sem histórico de métricas — totais não misturam R$0 fantasma.'
                        : 'Sync incompleto em alguma unidade — agenda/vagas só com sync ok.'}
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

        <section id="relatorios" className="mt-6 space-y-3">
          <GoalsEditor data={data} onSaved={() => onRefresh?.()} />
          <ReportsPanel />
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Panel>
            <KpiStat
              label="Faturamento hoje"
              value={c.networkReadable ? formatCurrency(c.todayRevenue) : '—'}
              hint={
                !c.networkReadable
                  ? 'Nenhuma unidade com sync legível'
                  : !c.goalsConfigured
                    ? 'Defina meta e capacidade de cada unidade'
                    : !c.todayOpsActive
                      ? 'Sem unidades em operação hoje'
                      : !c.todayMoneyActive
                        ? 'Agenda ativa · aguardando faturamento/atendidos'
                        : `Meta ${formatCurrency(c.todayGoal)} · ${formatPct(c.todayGoalProgress)}`
              }
              source={sourceHint('Avec', networkSyncSource)}
              legend={LEGEND.faturamento}
              tone={goalTone}
            />
            {c.networkReadable && c.goalsConfigured && c.todayMoneyActive ? (
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
                c.occupancyConfigured && c.attendanceConfigured
                  ? `${formatPct(c.occupancyRate)} · ${formatPct(c.attendanceRate)}`
                  : c.occupancyConfigured
                    ? `${formatPct(c.occupancyRate)} · —`
                    : c.attendanceConfigured
                      ? `— · ${formatPct(c.attendanceRate)}`
                      : '— · —'
              }
              hint={
                c.attendanceConfigured
                  ? `No-show ${formatPct(c.noShowRate)} · risco ${
                      c.revenueAtRisk != null ? formatCurrency(c.revenueAtRisk) : '—'
                    }`
                  : 'Agenda do dia ainda não confiável / sem operação'
              }
              source={sourceHint('Avec', networkSyncSource)}
              legend={LEGEND.ocupacao}
              tone={c.attendanceConfigured && c.noShowRate > 0.08 ? 'warn' : 'default'}
            />
          </Panel>
          <Panel>
            <KpiStat
              label="MTD · Ticket"
              value={c.networkReadable ? formatCurrency(c.mtdRevenue) : '—'}
              hint={
                !c.networkReadable
                  ? 'Nenhuma unidade com sync legível'
                  : c.goalsConfigured
                    ? `${formatPct(c.mtdGoalProgress)} da meta · ticket ${
                        c.mtdTicketAvg != null ? formatCurrency(c.mtdTicketAvg) : '—'
                      }`
                    : `Ticket ${
                        c.mtdTicketAvg != null ? formatCurrency(c.mtdTicketAvg) : '—'
                      }${c.cmvKnown ? ` · CMV ${formatCurrency(c.cmv)}` : ''}`
              }
              source={sourceHint('Avec', networkSyncSource)}
              legend={LEGEND.mtd}
            />
            {c.networkReadable && c.goalsConfigured ? (
              <div className="mt-3">
                <ProgressBar value={c.mtdGoalProgress} color="teal" />
              </div>
            ) : null}
          </Panel>
        </section>

        {(c.cmvKnown || c.stockKnown) && (
          <section className="mt-3 grid gap-3 sm:grid-cols-3">
            <Panel>
              <KpiStat
                label="CMV rede (MTD)"
                value={c.cmvKnown ? formatCurrency(c.cmv) : '—'}
                hint={c.cmvShare != null ? `${formatPct(c.cmvShare)} da receita` : undefined}
                source={sourceHint('proxy', 'Avec', networkSyncSource)}
                legend={LEGEND.cmv}
              />
            </Panel>
            <Panel>
              <KpiStat
                label="Estoque (valor)"
                value={c.stockValueKnown ? formatCurrency(c.stockValue) : '—'}
                source={sourceHint('Avec', networkSyncSource)}
                legend={LEGEND.estoqueValor}
              />
            </Panel>
            <Panel>
              <KpiStat
                label="Alertas estoque"
                value={c.stockKnown ? formatNumber(c.stockAlerts) : '—'}
                tone={
                  !c.stockKnown
                    ? 'default'
                    : c.stockAlerts >= 200
                      ? 'default'
                      : c.stockAlerts >= 3
                        ? 'warn'
                        : 'default'
                }
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
              {/* Modelo: Top 3 numerados → BR | IG → Rede */}
              {actionsBoard.topNow.length > 0 ? (
                <div className="mb-5">
                  <p className="mb-2 text-[0.65rem] uppercase tracking-[0.18em] text-brass">
                    Fazer agora
                  </p>
                  <ol className="space-y-2">
                    {actionsBoard.topNow.map((a, idx) => (
                      <li
                        key={a.id}
                        className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${severityStyles(a.severity)}`}
                      >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-current/25 bg-surface/40 font-display text-sm tabular-nums">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{a.title}</p>
                            {unitChip(a.unit)}
                          </div>
                          <p className="mt-0.5 text-xs text-muted">{a.detail}</p>
                          <p className="mt-1.5 flex items-center gap-1 text-xs text-foreground/85">
                            <ArrowRight size={11} />
                            {a.action}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    {
                      key: 'brasil' as const,
                      label: 'Brasil',
                      accent: 'text-brass border-brass/30',
                      items: actionsBoard.brasil,
                    },
                    {
                      key: 'iguatemi' as const,
                      label: 'Iguatemi',
                      accent: 'text-teal border-teal/30',
                      items: actionsBoard.iguatemi,
                    },
                  ] as const
                ).map((col) => (
                  <div
                    key={col.key}
                    className={`rounded-xl border ${col.accent} bg-panel-2/30 p-3`}
                  >
                    <p
                      className={`text-[0.65rem] uppercase tracking-[0.16em] ${
                        col.key === 'brasil' ? 'text-brass' : 'text-teal'
                      }`}
                    >
                      {col.label}
                      <span className="ml-2 text-muted">{col.items.length}</span>
                    </p>
                    {col.items.length === 0 ? (
                      <p className="mt-3 text-xs text-muted">Nada pendente nesta coluna.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-border/40">
                        {col.items.map((a) => (
                          <li key={a.id} className="py-2.5 first:pt-1 last:pb-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-foreground">{a.title.replace(/ — (Brasil|Iguatemi)$/, '')}</p>
                              <span
                                className={`shrink-0 text-[0.6rem] uppercase tracking-wide ${
                                  a.severity === 'critical'
                                    ? 'text-danger'
                                    : a.severity === 'warning'
                                      ? 'text-warning'
                                      : 'text-muted'
                                }`}
                              >
                                {a.severity === 'critical'
                                  ? 'crítico'
                                  : a.severity === 'warning'
                                    ? 'atenção'
                                    : 'info'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted">{a.detail}</p>
                            <p className="mt-1 text-[0.7rem] text-foreground/70">→ {a.action}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {actionsBoard.rede.length > 0 ? (
                <div className="mt-4 rounded-xl border border-border/50 bg-panel/40 px-3 py-3">
                  <p className="mb-2 text-[0.65rem] uppercase tracking-[0.16em] text-muted">
                    Rede
                  </p>
                  <ul className="space-y-2">
                    {actionsBoard.rede.map((a) => (
                      <li key={a.id} className="flex items-start gap-2">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-info" />
                        <div className="min-w-0">
                          <p className="text-sm text-foreground">{a.title}</p>
                          <p className="text-xs text-muted">
                            {a.detail} · → {a.action}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
                const syncHard = Boolean(u && !offline && isSyncHardFail(u))
                const syncSoft = Boolean(
                  u &&
                    !offline &&
                    !syncHard &&
                    (u.sync.status === 'partial' || u.sync.status === 'stale'),
                )
                const src = !u || offline
                  ? 'offline'
                  : sourceHint('Avec', 'ROM', syncSourceLabel(u.sync.status))
                const dash = '—'
                const readable = u != null && isUnitReadable(u)
                const active = Boolean(u && readable && isSalonActiveToday(u))
                const operable = Boolean(u && readable && isDayOperable(u))
                const trustedAgenda = Boolean(u && readable && hasTrustedAgenda(u))
                const hollow = Boolean(u && isMetricsHollow(u))
                // Quieto mesmo com sync parcial — não confundir dia sem agenda com falha.
                const quiet = readable && !syncHard && !hollow && !active
                // Never-sync / token morto: todos os KPIs do chip → — (não misturar ops com fat —).
                const revenue = !u || !readable ? dash : formatCurrency(u.today.revenue)
                const vagasHoje =
                  !u || !readable || !u.today.capacitySet
                    ? dash
                    : !trustedAgenda
                      ? active
                        ? dash
                        : 'Sem agenda'
                      : String(u.opsToday.openSlotsToday)
                const vagas2h =
                  !u || !readable || !u.opsToday.slotsNext2hKnown || !trustedAgenda
                    ? dash
                    : String(u.opsToday.openSlotsNext2h)
                const cancelNoshow =
                  !u || !readable || !operable
                    ? dash
                    : `${u.today.cancelled} · ${u.today.noShows}`
                const novosRec =
                  !u || !readable || !active || (u.today.attended <= 0 && u.today.revenue <= 0)
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
                            : hollow
                              ? 'Sem histórico de métricas · sync/schema'
                              : syncHard
                                ? (u?.sync.label ?? 'Sync')
                                : quiet
                                  ? syncSoft
                                    ? `Sem movimento hoje · ${u?.sync.label ?? 'sync parcial'}`
                                    : 'Sem movimento hoje · salão quieto/fechado'
                                  : (u?.sync.label ?? '')}
                        </p>
                      </div>
                      {offline ? (
                        <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-warning">
                          Offline
                        </span>
                      ) : syncHard ? (
                        <span className="rounded-md border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-danger">
                          Sync
                        </span>
                      ) : hollow ? (
                        <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-warning">
                          Vazio
                        </span>
                      ) : quiet ? (
                        <span className="rounded-md border border-border/60 bg-panel px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-muted">
                          Quieto
                        </span>
                      ) : u?.sync.status === 'partial' ? (
                        <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-warning">
                          Parcial
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
                            !offline &&
                            trustedAgenda &&
                            (u?.opsToday.openSlotsToday ?? 0) >= 4
                              ? 'text-warning'
                              : !trustedAgenda
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
                            operable &&
                            u != null &&
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
                const hardFail = isSyncHardFail(u)
                const hollow = isMetricsHollow(u)
                // Semana/comercial: conectado basta — hollow não esconde P1/P3 se existirem.
                const blocked = !isUnitConnected(u)
                const empty =
                  !blocked &&
                  w.professionals.length === 0 &&
                  w.services.length === 0 &&
                  (w.returnRate == null || w.returnRate === 0) &&
                  (w.reactivationCount == null || w.reactivationCount === 0)
                // Avec 0107 pagina até ~5000 linhas — 5000 é teto, não o total real.
                const semRetornoLabel =
                  w.reactivationCount == null
                    ? '—'
                    : w.reactivationCount >= 5000
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
                      ) : hardFail ? (
                        <span className="rounded-md border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-danger">
                          Sync
                        </span>
                      ) : hollow ? (
                        <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-warning">
                          Vazio
                        </span>
                      ) : null}
                    </div>
                    {blocked ? (
                      <p className="mt-3 text-sm text-muted">{unreadableBlockCopy(u, 'semana')}</p>
                    ) : empty ? (
                      <p className="mt-3 text-sm text-muted">{layerEmptyCopy('semana', hollow)}</p>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm">
                        {w.asOfDay || w.returnAsOfDay ? (
                          <p className="text-[0.65rem] text-muted">
                            {w.asOfDay ? `Ranking de ${w.asOfDay.slice(5).replace('-', '/')}` : null}
                            {w.asOfDay && w.returnAsOfDay ? ' · ' : null}
                            {w.returnAsOfDay
                              ? `retorno de ${w.returnAsOfDay.slice(5).replace('-', '/')}`
                              : w.returnRate == null
                                ? 'retorno —'
                                : null}
                          </p>
                        ) : null}
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
                          novos{' '}
                          {w.newClientsPeriod == null ? '—' : formatNumber(w.newClientsPeriod)}
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
                const hardFail = isSyncHardFail(u)
                const hollow = isMetricsHollow(u)
                const blocked = !isUnitConnected(u)
                const empty =
                  !blocked &&
                  co.bookingChannels.length === 0 &&
                  co.packages.length === 0 &&
                  co.ratingsCount === 0 &&
                  !co.packagesKnown
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
                      ) : hardFail ? (
                        <span className="rounded-md border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-danger">
                          Sync
                        </span>
                      ) : hollow ? (
                        <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-warning">
                          Vazio
                        </span>
                      ) : null}
                    </div>
                    {blocked ? (
                      <p className="mt-3 text-sm text-muted">{unreadableBlockCopy(u, 'comercial')}</p>
                    ) : empty ? (
                      <p className="mt-3 text-sm text-muted">{layerEmptyCopy('comercial', hollow)}</p>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm">
                        {co.asOfDay ? (
                          <p className="text-[0.65rem] text-muted">
                            Snapshot de {co.asOfDay.slice(5).replace('-', '/')}
                          </p>
                        ) : null}
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
                              <li className="text-xs text-muted">
                                {co.packagesKnown ? 'Sem pacotes' : 'Pacotes indisponíveis'}
                              </li>
                            ) : null}
                          </ul>
                        </div>
                        <p className="text-xs text-muted">
                          Pacotes{' '}
                          {co.packagesKnown ? formatCurrency(co.packagesRevenue) : '—'} ·{' '}
                          {co.packagesKnown ? formatNumber(co.packagesSold) : '—'} vendidos
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
              <p className="mb-3 text-xs text-muted">
                Scorecard tabular ·{' '}
                <a href="/comparativo" className="text-teal underline decoration-dotted underline-offset-2 hover:text-teal-soft">
                  ver em gráficos
                </a>
                {' · '}
                export Comparativo em Relatórios
              </p>
              <p className="mb-3 text-xs text-muted">
                Em Operação, <span className="tabular-nums">—</span> no dia = salão quieto (sem
                movimento), não falha de sync. CMV/retorno <span className="tabular-nums">—</span>{' '}
                = dado ausente naquela base (saídas/P3).
              </p>
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
                                : row.key === 'payment_gap' && row.deltaPct == null
                                  ? 'Diferença absoluta BR − IG (Δ% omitida quando explode)'
                                  : undefined
                            }
                          >
                            {formatDeltaCell(row)}
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
              summary={(() => {
                const hasBr = data.trend30.some((d) => d.brasil != null)
                const hasIg = data.trend30.some((d) => d.iguatemi != null)
                if (hasBr && hasIg) return 'Brasil vs Iguatemi'
                if (hasBr) return 'só Brasil (Iguatemi sem série)'
                if (hasIg) return 'só Iguatemi (Brasil sem série)'
                return 'sem séries'
              })()}
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
              ? 'Brasil + Iguatemi (Supabase) · KPIs Avec'
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
