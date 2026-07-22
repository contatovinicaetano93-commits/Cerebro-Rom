import { clamp01 } from './format'
import type { ComparisonRow, UnitComparison, UnitSnapshot } from './types'

/** Compartilhado entre live (overview.ts) e mock (mock-overview.ts). */
export function rate(num: number, den: number): number {
  if (den <= 0) return 0
  return clamp01(num / den)
}

function deltaPct(brasil: number | null, iguatemi: number | null): number | null {
  if (brasil == null || iguatemi == null) return null
  if (iguatemi === 0) return brasil === 0 ? 0 : null
  return (brasil - iguatemi) / Math.abs(iguatemi)
}

function row(
  partial: Omit<ComparisonRow, 'deltaPct'> & { deltaPct?: number | null },
): ComparisonRow {
  return {
    ...partial,
    deltaPct:
      partial.deltaPct !== undefined
        ? partial.deltaPct
        : deltaPct(partial.brasil, partial.iguatemi),
  }
}

/**
 * Scorecard Brasil × Iguatemi — só KPIs Avec (ops / comercial / financeiro / estoque).
 * Sem despesas manuais. Valores null quando a unidade não tem o dado configurado.
 */
export function buildComparison(units: UnitSnapshot[]): UnitComparison | undefined {
  const brasil = units.find((u) => u.unit.slug === 'rom-brasil')
  const iguatemi = units.find((u) => u.unit.slug === 'rom-iguatemi')
  if (!brasil || !iguatemi) return undefined

  const occ = (u: UnitSnapshot): number | null =>
    u.today.capacitySet ? rate(u.today.appointments, u.today.capacity) : null

  const goalPct = (u: UnitSnapshot): number | null =>
    u.today.goalSet ? rate(u.today.revenue, u.today.dailyGoal) : null

  const noShow = (u: UnitSnapshot): number | null =>
    u.today.appointments > 0 ? rate(u.today.noShows, u.today.appointments) : null

  const rows: ComparisonRow[] = [
    row({
      key: 'revenue_today',
      label: 'Receita hoje',
      group: 'ops',
      brasil: brasil.today.revenue,
      iguatemi: iguatemi.today.revenue,
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'goal_pct',
      label: '% meta hoje',
      group: 'ops',
      brasil: goalPct(brasil),
      iguatemi: goalPct(iguatemi),
      format: 'pct',
      higherIsBetter: true,
    }),
    row({
      key: 'occupancy',
      label: 'Ocupação',
      group: 'ops',
      brasil: occ(brasil),
      iguatemi: occ(iguatemi),
      format: 'pct',
      higherIsBetter: true,
    }),
    row({
      key: 'noshow',
      label: 'No-show',
      group: 'ops',
      brasil: noShow(brasil),
      iguatemi: noShow(iguatemi),
      format: 'pct',
      higherIsBetter: false,
    }),
    row({
      key: 'ticket',
      label: 'Ticket médio',
      group: 'ops',
      brasil: brasil.today.ticketAvg || null,
      iguatemi: iguatemi.today.ticketAvg || null,
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'return',
      label: 'Taxa de retorno',
      group: 'comercial',
      brasil: brasil.opsWeek.returnRate || null,
      iguatemi: iguatemi.opsWeek.returnRate || null,
      format: 'pct',
      higherIsBetter: true,
    }),
    row({
      key: 'packages',
      label: 'Pacotes (receita)',
      group: 'comercial',
      brasil: brasil.opsCommerce.packagesRevenue,
      iguatemi: iguatemi.opsCommerce.packagesRevenue,
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'mtd_revenue',
      label: 'Receita MTD',
      group: 'financeiro',
      brasil: brasil.opsFinance.mtdRevenue,
      iguatemi: iguatemi.opsFinance.mtdRevenue,
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'mtd_ticket',
      label: 'Ticket MTD',
      group: 'financeiro',
      brasil: brasil.opsFinance.mtdTicketAvg || null,
      iguatemi: iguatemi.opsFinance.mtdTicketAvg || null,
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'cmv',
      label: 'CMV (saídas)',
      group: 'financeiro',
      brasil: brasil.opsFinance.available ? brasil.opsFinance.cmv : null,
      iguatemi: iguatemi.opsFinance.available ? iguatemi.opsFinance.cmv : null,
      format: 'currency',
      higherIsBetter: false,
    }),
    row({
      key: 'cmv_share',
      label: 'CMV / receita',
      group: 'financeiro',
      brasil: brasil.opsFinance.cmvShare,
      iguatemi: iguatemi.opsFinance.cmvShare,
      format: 'pct',
      higherIsBetter: false,
    }),
    row({
      key: 'stock_value',
      label: 'Valor em estoque',
      group: 'estoque',
      brasil: brasil.opsStock.available ? brasil.opsStock.totalValue : null,
      iguatemi: iguatemi.opsStock.available ? iguatemi.opsStock.totalValue : null,
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'stock_alerts',
      label: 'Alertas estoque',
      group: 'estoque',
      brasil: brasil.opsStock.available ? brasil.opsStock.activeAlerts : null,
      iguatemi: iguatemi.opsStock.available ? iguatemi.opsStock.activeAlerts : null,
      format: 'number',
      higherIsBetter: false,
    }),
    row({
      key: 'stock_zero',
      label: 'SKUs zerados',
      group: 'estoque',
      brasil: brasil.opsStock.available ? brasil.opsStock.zeroProducts : null,
      iguatemi: iguatemi.opsStock.available ? iguatemi.opsStock.zeroProducts : null,
      format: 'number',
      higherIsBetter: false,
    }),
  ]

  const deltaRevenuePct = deltaPct(brasil.mtd.revenue, iguatemi.mtd.revenue)

  return { rows, deltaRevenuePct }
}
