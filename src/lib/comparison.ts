import { clamp01 } from './format'
import { hasTrustedAgenda, isSalonActiveToday } from './salon-day'
import type { ComparisonRow, UnitComparison, UnitSnapshot } from './types'

/** Compartilhado entre live (overview.ts) e mock (mock-overview.ts). */
export function rate(num: number, den: number): number {
  if (den <= 0) return 0
  return clamp01(num / den)
}

/** Δ relativo (moeda / contagens): (BR − IG) / |IG|. */
function deltaRelative(brasil: number | null, iguatemi: number | null): number | null {
  if (brasil == null || iguatemi == null) return null
  if (iguatemi === 0) return brasil === 0 ? 0 : null
  return (brasil - iguatemi) / Math.abs(iguatemi)
}

/** Δ absoluto em pontos (taxas 0–1): 25% vs 24% → +0.01 (= +1 p.p.). */
function deltaPoints(brasil: number | null, iguatemi: number | null): number | null {
  if (brasil == null || iguatemi == null) return null
  return brasil - iguatemi
}

function row(
  partial: Omit<ComparisonRow, 'deltaPct'> & { deltaPct?: number | null },
): ComparisonRow {
  return {
    ...partial,
    deltaPct:
      partial.deltaPct !== undefined
        ? partial.deltaPct
        : partial.format === 'pct'
          ? deltaPoints(partial.brasil, partial.iguatemi)
          : deltaRelative(partial.brasil, partial.iguatemi),
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

  /** Offline → null (não R$ 0 falso no scorecard). */
  const live = (u: UnitSnapshot, v: number | null | undefined): number | null => {
    if (u.sync.offline) return null
    if (v == null || !Number.isFinite(v)) return null
    return v
  }

  /** KPIs do dia: salão quieto → null (não “0% meta / 0% ocupação”). */
  const dayLive = (u: UnitSnapshot, v: number | null | undefined): number | null => {
    if (u.sync.offline || !isSalonActiveToday(u)) return null
    if (v == null || !Number.isFinite(v)) return null
    return v
  }

  const occ = (u: UnitSnapshot): number | null =>
    u.sync.offline || !isSalonActiveToday(u) || !hasTrustedAgenda(u) || !u.today.capacitySet
      ? null
      : rate(u.today.appointments, u.today.capacity)

  const goalPct = (u: UnitSnapshot): number | null =>
    u.sync.offline || !isSalonActiveToday(u) || !u.today.goalSet
      ? null
      : rate(u.today.revenue, u.today.dailyGoal)

  const noShow = (u: UnitSnapshot): number | null =>
    u.sync.offline || !isSalonActiveToday(u) || u.today.appointments <= 0
      ? null
      : rate(u.today.noShows, u.today.appointments)

  const lostRevenue = (u: UnitSnapshot): number | null =>
    u.sync.offline || !isSalonActiveToday(u)
      ? null
      : Math.round((u.today.noShows + u.today.cancelled) * u.today.ticketAvg)

  const paymentGap = (u: UnitSnapshot): number | null => {
    if (u.sync.offline || !u.opsFinance.paymentsKnown) return null
    if (u.opsFinance.paymentReconcile === 'unknown') return null
    if (u.opsFinance.paymentReconcile === 'missing_payments' && u.opsFinance.mtdRevenue <= 0) {
      return null
    }
    return Math.round((u.opsFinance.paymentsTotal - u.opsFinance.mtdRevenue) * 100) / 100
  }

  const reconcileLabel = (u: UnitSnapshot): string | null => {
    if (u.sync.offline || !u.opsFinance.paymentsKnown) return null
    switch (u.opsFinance.paymentReconcile) {
      case 'aligned':
        return 'Ok'
      case 'divergent':
        return 'Divergente'
      case 'missing_payments':
        return 'Sem 0081'
      case 'missing_revenue':
        return 'Sem receita'
      case 'unknown':
        return null
      default: {
        const _exhaustive: never = u.opsFinance.paymentReconcile
        return _exhaustive
      }
    }
  }

  const rows: ComparisonRow[] = [
    row({
      key: 'revenue_today',
      label: 'Receita hoje',
      group: 'ops',
      // Quiet → null; ativo com R$0 continua 0.
      brasil: dayLive(brasil, brasil.today.revenue),
      iguatemi: dayLive(iguatemi, iguatemi.today.revenue),
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
      key: 'lost_revenue',
      label: 'Receita perdida',
      group: 'ops',
      brasil: lostRevenue(brasil),
      iguatemi: lostRevenue(iguatemi),
      format: 'currency',
      higherIsBetter: false,
    }),
    row({
      key: 'ticket',
      label: 'Ticket médio',
      group: 'ops',
      brasil: dayLive(brasil, brasil.today.ticketAvg || null),
      iguatemi: dayLive(iguatemi, iguatemi.today.ticketAvg || null),
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'return',
      label: 'Taxa de retorno',
      group: 'comercial',
      brasil: live(brasil, brasil.opsWeek.returnRate || null),
      iguatemi: live(iguatemi, iguatemi.opsWeek.returnRate || null),
      format: 'pct',
      higherIsBetter: true,
    }),
    row({
      key: 'packages',
      label: 'Pacotes (receita)',
      group: 'comercial',
      brasil: live(brasil, brasil.opsCommerce.packagesRevenue),
      iguatemi: live(iguatemi, iguatemi.opsCommerce.packagesRevenue),
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'mtd_revenue',
      label: 'Receita MTD',
      group: 'financeiro',
      brasil: live(brasil, brasil.opsFinance.mtdRevenue),
      iguatemi: live(iguatemi, iguatemi.opsFinance.mtdRevenue),
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'mtd_ticket',
      label: 'Ticket MTD',
      group: 'financeiro',
      brasil: live(brasil, brasil.opsFinance.mtdTicketAvg || null),
      iguatemi: live(iguatemi, iguatemi.opsFinance.mtdTicketAvg || null),
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'cmv',
      label: 'CMV proxy (saídas)',
      group: 'financeiro',
      brasil: brasil.opsFinance.cmvKnown ? live(brasil, brasil.opsFinance.cmv) : null,
      iguatemi: iguatemi.opsFinance.cmvKnown ? live(iguatemi, iguatemi.opsFinance.cmv) : null,
      format: 'currency',
      higherIsBetter: false,
    }),
    row({
      key: 'cmv_share',
      label: 'CMV / receita',
      group: 'financeiro',
      brasil: live(brasil, brasil.opsFinance.cmvShare),
      iguatemi: live(iguatemi, iguatemi.opsFinance.cmvShare),
      format: 'pct',
      higherIsBetter: false,
    }),
    row({
      key: 'payments_total',
      label: 'Pagamentos 0081',
      group: 'financeiro',
      brasil: brasil.opsFinance.paymentsKnown
        ? live(brasil, brasil.opsFinance.paymentsTotal)
        : null,
      iguatemi: iguatemi.opsFinance.paymentsKnown
        ? live(iguatemi, iguatemi.opsFinance.paymentsTotal)
        : null,
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'payment_gap',
      label: 'Gap 0081 vs receita',
      group: 'financeiro',
      brasil: paymentGap(brasil),
      iguatemi: paymentGap(iguatemi),
      format: 'currency',
      higherIsBetter: false,
    }),
    row({
      key: 'payment_reconcile',
      label: 'Conciliação 0081',
      group: 'financeiro',
      brasil: null,
      iguatemi: null,
      brasilText: reconcileLabel(brasil),
      iguatemiText: reconcileLabel(iguatemi),
      format: 'text',
      higherIsBetter: true,
      deltaPct: null,
    }),
    row({
      key: 'top_payment',
      label: 'Forma #1',
      group: 'financeiro',
      brasil: null,
      iguatemi: null,
      brasilText: brasil.sync.offline ? null : brasil.opsFinance.topPaymentMethod,
      iguatemiText: iguatemi.sync.offline ? null : iguatemi.opsFinance.topPaymentMethod,
      format: 'text',
      higherIsBetter: true,
      deltaPct: null,
    }),
    row({
      key: 'stock_value',
      label: 'Valor em estoque',
      group: 'estoque',
      brasil:
        !brasil.sync.offline && brasil.opsStock.available ? brasil.opsStock.totalValue : null,
      iguatemi:
        !iguatemi.sync.offline && iguatemi.opsStock.available
          ? iguatemi.opsStock.totalValue
          : null,
      format: 'currency',
      higherIsBetter: true,
    }),
    row({
      key: 'stock_alerts',
      label: 'Alertas estoque',
      group: 'estoque',
      brasil:
        !brasil.sync.offline && brasil.opsStock.available ? brasil.opsStock.activeAlerts : null,
      iguatemi:
        !iguatemi.sync.offline && iguatemi.opsStock.available
          ? iguatemi.opsStock.activeAlerts
          : null,
      format: 'number',
      higherIsBetter: false,
    }),
    row({
      key: 'stock_zero',
      label: 'SKUs zerados',
      group: 'estoque',
      brasil:
        !brasil.sync.offline && brasil.opsStock.available ? brasil.opsStock.zeroProducts : null,
      iguatemi:
        !iguatemi.sync.offline && iguatemi.opsStock.available
          ? iguatemi.opsStock.zeroProducts
          : null,
      format: 'number',
      higherIsBetter: false,
    }),
  ]

  const deltaRevenuePct =
    brasil.sync.offline || iguatemi.sync.offline
      ? null
      : deltaRelative(brasil.mtd.revenue, iguatemi.mtd.revenue)

  return { rows, deltaRevenuePct }
}
