import { rate } from '@/lib/comparison'
import { dayOfMonth } from '@/lib/unit-config'
import type { CerebroOverview, UnitSnapshot } from '@/lib/types'

/** KPIs acumulados do mês (1º → dia do relatório) derivados do snapshot. */
export type UnitMtdKpis = {
  day: string
  daysInPeriod: number
  revenue: number
  appointments: number
  attended: number
  noShows: number
  cancelled: number
  newClients: number
  returningClients: number
  leads: number
  converted: number
  ticketAvg: number
  goal: number
  goalSet: boolean
  goalProgress: number | null
  attendanceRate: number | null
  noShowRate: number | null
  occupancyRate: number | null
  capacitySet: boolean
  capacityDays: number
  openSlots: number
  revenueAtRisk: number
  lostRevenue: number
  newShare: number
  conversionRate: number | null
  cmv: number
  cmvShare: number | null
  paymentsTotal: number
  paymentReconcile: string
  topPaymentMethod: string | null
  packagesRevenue: number
  packagesSold: number
  returnRate: number
  reactivationCount: number
  stockValue: number
  stockAlerts: number
  zeroProducts: number
  syncLabel: string
}

export function unitMtdKpis(u: UnitSnapshot): UnitMtdKpis {
  const day = u.today.day
  const daysInPeriod = dayOfMonth(day)
  const m = u.mtd
  // Snapshots antigos podem não ter ticketAvg/leads/openSlots no mtd.
  const ticketAvg =
    (m.ticketAvg ?? 0) > 0
      ? m.ticketAvg
      : m.attended > 0
        ? Math.round(m.revenue / m.attended)
        : u.opsFinance.mtdTicketAvg || 0
  const capacityDays = u.today.capacitySet ? u.today.capacity * daysInPeriod : 0
  const openSlots =
    typeof m.openSlots === 'number'
      ? m.openSlots
      : u.today.capacitySet
        ? Math.max(0, capacityDays - m.appointments)
        : 0
  const leads = m.leads ?? 0
  const converted = m.converted ?? 0
  const mixBase = m.newClients + m.returningClients

  return {
    day,
    daysInPeriod,
    revenue: m.revenue,
    appointments: m.appointments,
    attended: m.attended,
    noShows: m.noShows,
    cancelled: m.cancelled,
    newClients: m.newClients,
    returningClients: m.returningClients,
    leads,
    converted,
    ticketAvg,
    goal: m.goal,
    goalSet: m.goalSet,
    goalProgress: m.goalSet && m.goal > 0 ? rate(m.revenue, m.goal) : null,
    attendanceRate: m.appointments > 0 ? rate(m.attended, m.appointments) : null,
    noShowRate: m.appointments > 0 ? rate(m.noShows, m.appointments) : null,
    occupancyRate: u.today.capacitySet && capacityDays > 0 ? rate(m.appointments, capacityDays) : null,
    capacitySet: u.today.capacitySet,
    capacityDays,
    openSlots,
    revenueAtRisk: Math.round(m.noShows * ticketAvg),
    lostRevenue: Math.round((m.noShows + m.cancelled) * ticketAvg),
    newShare: mixBase > 0 ? m.newClients / mixBase : 0,
    conversionRate: leads > 0 ? rate(converted, leads) : null,
    cmv: u.opsFinance.cmv,
    cmvShare: u.opsFinance.cmvShare,
    paymentsTotal: u.opsFinance.paymentsTotal,
    paymentReconcile: u.opsFinance.paymentReconcile,
    topPaymentMethod: u.opsFinance.topPaymentMethod,
    packagesRevenue: u.opsCommerce.packagesRevenue,
    packagesSold: u.opsCommerce.packagesSold,
    returnRate: u.opsWeek.returnRate,
    reactivationCount: u.opsWeek.reactivationCount,
    stockValue: u.opsStock.available ? u.opsStock.totalValue : 0,
    stockAlerts: u.opsStock.available ? u.opsStock.activeAlerts : 0,
    zeroProducts: u.opsStock.available ? u.opsStock.zeroProducts : 0,
    syncLabel: u.sync.label || u.sync.status,
  }
}

export function redeMtdKpis(o: CerebroOverview) {
  const units = o.units.map(unitMtdKpis)
  const sum = (fn: (u: UnitMtdKpis) => number) => units.reduce((a, u) => a + fn(u), 0)
  const revenue = sum((u) => u.revenue)
  const appointments = sum((u) => u.appointments)
  const attended = sum((u) => u.attended)
  const noShows = sum((u) => u.noShows)
  const cancelled = sum((u) => u.cancelled)
  const goal = sum((u) => (u.goalSet ? u.goal : 0))
  const goalsConfigured = units.length > 0 && units.every((u) => u.goalSet)
  const capacityDays = sum((u) => (u.capacitySet ? u.capacityDays : 0))
  const occupancyConfigured = units.length > 0 && units.every((u) => u.capacitySet)
  const newClients = sum((u) => u.newClients)
  const returningClients = sum((u) => u.returningClients)
  const leads = sum((u) => u.leads)
  const converted = sum((u) => u.converted)
  const mixBase = newClients + returningClients
  const cmv = sum((u) => u.cmv)
  const ticketAvg = attended > 0 ? Math.round(revenue / attended) : 0

  return {
    asOfDay: units[0]?.day ?? o.periodLabel,
    daysInPeriod: units[0]?.daysInPeriod ?? 0,
    revenue,
    appointments,
    attended,
    noShows,
    cancelled,
    ticketAvg,
    goal,
    goalsConfigured,
    goalProgress: goalsConfigured && goal > 0 ? rate(revenue, goal) : null,
    attendanceRate: appointments > 0 ? rate(attended, appointments) : null,
    noShowRate: appointments > 0 ? rate(noShows, appointments) : null,
    occupancyRate: occupancyConfigured && capacityDays > 0 ? rate(appointments, capacityDays) : null,
    occupancyConfigured,
    openSlots: sum((u) => u.openSlots),
    revenueAtRisk: sum((u) => u.revenueAtRisk),
    lostRevenue: sum((u) => u.lostRevenue),
    newClients,
    returningClients,
    newShare: mixBase > 0 ? newClients / mixBase : 0,
    conversionRate: leads > 0 ? rate(converted, leads) : null,
    leads,
    converted,
    cmv,
    cmvShare: revenue > 0 ? cmv / revenue : null,
    paymentsTotal: sum((u) => u.paymentsTotal),
    packagesRevenue: sum((u) => u.packagesRevenue),
    packagesSold: sum((u) => u.packagesSold),
    reactivationCount: sum((u) => u.reactivationCount),
    stockValue: sum((u) => u.stockValue),
    stockAlerts: sum((u) => u.stockAlerts),
    zeroProducts: sum((u) => u.zeroProducts),
  }
}
