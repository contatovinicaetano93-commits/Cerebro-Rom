'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, ArrowLeft, Brain, Download } from 'lucide-react'
import type {
  CerebroOverview,
  ComparisonGroup,
  ComparisonRow,
} from '@/lib/types'
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPct,
  formatShortDate,
  formatSignedPct,
} from '@/lib/format'
import { LogoutButton } from './LogoutButton'

const GROUP_LABEL: Record<ComparisonGroup, string> = {
  ops: 'Operação',
  comercial: 'Comercial',
  financeiro: 'Financeiro Avec',
  estoque: 'Estoque Avec',
}

const GROUP_ORDER: ComparisonGroup[] = ['ops', 'comercial', 'financeiro', 'estoque']

const BRASS = '#c9a45c'
const TEAL = '#6fafa0'

function formatRowValue(row: ComparisonRow, side: 'brasil' | 'iguatemi'): string {
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

function chartValue(row: ComparisonRow, side: 'brasil' | 'iguatemi'): number | null {
  if (row.format === 'text') return null
  const value = side === 'brasil' ? row.brasil : row.iguatemi
  if (value == null || !Number.isFinite(value)) return null
  return row.format === 'pct' ? value * 100 : value
}

function formatAxis(row: ComparisonRow, value: number): string {
  if (row.format === 'pct') return `${value.toFixed(0)}%`
  if (row.format === 'currency') {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`
    return formatCurrency(value)
  }
  return formatNumber(value)
}

function KpiBar({ row }: { row: ComparisonRow }) {
  const brasil = chartValue(row, 'brasil')
  const iguatemi = chartValue(row, 'iguatemi')
  if (brasil == null && iguatemi == null) {
    return (
      <div className="rounded-xl border border-border/60 bg-panel-2/50 px-3 py-3">
        <p className="text-sm text-muted">{row.label}</p>
        <p className="mt-2 text-xs text-muted">Sem dado numérico para gráfico</p>
        <p className="mt-1 text-xs">
          <span className="text-brass">BR {formatRowValue(row, 'brasil')}</span>
          {' · '}
          <span className="text-teal">IG {formatRowValue(row, 'iguatemi')}</span>
        </p>
      </div>
    )
  }

  // Sempre BR + IG no eixo — null vira 0 com barra mutada (pareamento visual).
  const data = [
    {
      unit: 'Brasil',
      value: brasil ?? 0,
      fill: BRASS,
      missing: brasil == null,
    },
    {
      unit: 'Iguatemi',
      value: iguatemi ?? 0,
      fill: TEAL,
      missing: iguatemi == null,
    },
  ]

  return (
    <div className="rounded-xl border border-border/60 bg-panel-2/50 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-foreground">{row.label}</p>
        <p
          className={`text-xs tabular-nums ${
            row.deltaPct == null
              ? 'text-muted'
              : (row.higherIsBetter && row.deltaPct > 0) ||
                  (!row.higherIsBetter && row.deltaPct < 0)
                ? 'text-success'
                : (row.higherIsBetter && row.deltaPct < 0) ||
                    (!row.higherIsBetter && row.deltaPct > 0)
                  ? 'text-danger'
                  : 'text-muted'
          }`}
        >
          {row.deltaPct == null
            ? '—'
            : row.format === 'pct'
              ? `${formatSignedPct(row.deltaPct)} p.p.`
              : formatSignedPct(row.deltaPct)}
        </p>
      </div>
      <div className="mt-1 flex gap-3 text-[0.65rem] text-muted">
        <span className="text-brass">BR {formatRowValue(row, 'brasil')}</span>
        <span className="text-teal">IG {formatRowValue(row, 'iguatemi')}</span>
      </div>
      <div className="mt-2 h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              type="number"
              tick={{ fill: '#9a9488', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatAxis(row, v)}
            />
            <YAxis
              type="category"
              dataKey="unit"
              width={64}
              tick={{ fill: '#9a9488', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{
                background: '#16191f',
                border: '1px solid #2a2f38',
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value, _name, item) => {
                const payload = item?.payload as { missing?: boolean } | undefined
                if (payload?.missing) return ['sem dado', '']
                const n = typeof value === 'number' ? value : Number(value)
                if (!Number.isFinite(n)) return ['—', '']
                if (row.format === 'pct') return [`${n.toFixed(1)}%`, '']
                if (row.format === 'currency') return [formatCurrency(n), '']
                return [formatNumber(n), '']
              }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
              {data.map((d) => (
                <Cell
                  key={d.unit}
                  fill={d.fill}
                  fillOpacity={d.missing ? 0.18 : 0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function ComparativoCharts({ data }: { data: CerebroOverview }) {
  const groups = useMemo(() => {
    const rows = data.comparison?.rows ?? []
    return GROUP_ORDER.map((group) => ({
      group,
      rows: rows.filter((r) => r.group === group),
    })).filter((g) => g.rows.length > 0)
  }, [data.comparison])

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
              <p className="text-xs text-muted">Comparativo Brasil × Iguatemi</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
            >
              <ArrowLeft size={12} />
              Voltar ao painel
            </Link>
            <p className="mt-3 text-[0.65rem] uppercase tracking-[0.25em] text-brass">
              Gráficos
            </p>
            <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
              KPIs comparativos
            </h1>
            <p className="mt-2 text-sm text-muted">
              {data.periodLabel}
              {data.comparison?.deltaRevenuePct != null
                ? ` · Δ receita MTD ${formatSignedPct(data.comparison.deltaRevenuePct)}`
                : ''}
              {' · '}
              atualizado {formatDateTime(data.generatedAt)}
            </p>
          </div>
          <Link
            href="/#relatorios"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-foreground hover:border-brass/40"
          >
            <Download size={12} />
            Exportar CSV / XLSX
          </Link>
        </div>

        {data.trend30.length > 0 ? (
          <section className="mt-8 animate-fade-up">
            <p className="text-[0.65rem] uppercase tracking-[0.18em] text-brass">
              Tendência
            </p>
            <h2 className="mt-1 font-display text-2xl tracking-tight">Receita 30 dias</h2>
            <p className="mt-1 text-xs text-muted">
              {(() => {
                const hasBr = data.trend30.some((d) => d.brasil != null)
                const hasIg = data.trend30.some((d) => d.iguatemi != null)
                if (hasBr && hasIg) return 'Brasil × Iguatemi'
                if (hasBr) return 'Só Brasil com série legível'
                if (hasIg) return 'Só Iguatemi com série legível'
                return 'Sem séries legíveis'
              })()}
            </p>
            <div className="mt-4 h-56 w-full rounded-2xl border border-border/60 bg-panel/60 p-3 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend30} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cmpGBrasil" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRASS} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={BRASS} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cmpGIgua" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TEAL} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#2a2f38" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={formatShortDate}
                    tick={{ fill: '#9a9488', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fill: '#9a9488', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) =>
                      Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                    }
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#16191f',
                      border: '1px solid #2a2f38',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelFormatter={(label) => formatShortDate(String(label))}
                    formatter={(value, name) => [
                      value == null ? '—' : formatCurrency(Number(value)),
                      name === 'brasil' ? 'Brasil' : 'Iguatemi',
                    ]}
                  />
                  <Legend
                    formatter={(v) => (v === 'brasil' ? 'Brasil' : 'Iguatemi')}
                    wrapperStyle={{ fontSize: 12, color: '#9a9488' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="brasil"
                    stroke={BRASS}
                    fill="url(#cmpGBrasil)"
                    strokeWidth={2}
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="iguatemi"
                    stroke={TEAL}
                    fill="url(#cmpGIgua)"
                    strokeWidth={2}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null}

        {!data.comparison ? (
          <p className="mt-8 text-sm text-warning">
            Comparativo indisponível — precisa das duas unidades no overview.
          </p>
        ) : (
          groups.map(({ group, rows }, idx) => (
            <section
              key={group}
              className="mt-8 animate-fade-up"
              style={{ animationDelay: `${Math.min(idx, 3) * 60}ms` }}
            >
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-brass">
                {GROUP_LABEL[group]}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {rows.map((row) => (
                  <KpiBar key={row.key} row={row} />
                ))}
              </div>
            </section>
          ))
        )}

        <p className="mt-8 flex items-center gap-1.5 text-xs text-muted">
          <Activity size={12} />
          Só KPIs Avec · despesas manuais ficam no ROM Financeiro · export em Relatórios
        </p>
      </main>
    </div>
  )
}
