import { buildMockOverview } from '@/lib/mock-overview'
import { fetchLiveUnit } from '@/lib/live/fetch-unit'
import { getUnitConfigs, todayIsoSaoPaulo } from '@/lib/unit-config'
import { leaderBy, rate } from '@/lib/comparison'
import type { AlertItem, CerebroOverview, UnitSnapshot } from '@/lib/types'

/** Comparativo entre unidades — só existe com as duas presentes. */
export function buildComparison(units: UnitSnapshot[]): CerebroOverview['comparison'] {
  const brasil = units.find((u) => u.unit.slug === 'rom-brasil')
  const iguatemi = units.find((u) => u.unit.slug === 'rom-iguatemi')
  if (!brasil || !iguatemi) return undefined

  const deltaRevenuePct =
    iguatemi.mtd.revenue > 0
      ? (brasil.mtd.revenue - iguatemi.mtd.revenue) / iguatemi.mtd.revenue
      : brasil.mtd.revenue > 0
        ? null // Iguatemi zerado, Brasil não — % não representa isso direito
        : 0

  return {
    revenueLeader: leaderBy(units, (u) => u.mtd.revenue),
    occupancyLeader: leaderBy(units, (u) => rate(u.today.appointments, u.today.capacity)),
    attendanceLeader: leaderBy(units, (u) => rate(u.today.attended, u.today.appointments)),
    ticketLeader: leaderBy(units, (u) => u.today.ticketAvg),
    deltaRevenuePct,
  }
}

const SEV = { critical: 0, warning: 1, info: 2 }

/** Uma lista só: o que o Waltter deve fazer agora. */
function buildNextActions(
  units: UnitSnapshot[],
  todayGoal: number,
  todayRevenue: number,
): AlertItem[] {
  const actions: AlertItem[] = []

  for (const u of units) {
    if (u.sync.status === 'error') {
      actions.push({
        id: `sync-error-${u.unit.slug}`,
        severity: 'critical',
        unit: u.unit.slug,
        title: `Sync com erro — ${u.unit.short}`,
        detail: u.sync.label,
        action: 'Checar token Avec e rodar sync full',
      })
    } else if (u.sync.status === 'stale') {
      const awaiting = /Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)
      actions.push({
        id: `sync-stale-${u.unit.slug}`,
        severity: awaiting ? 'info' : 'warning',
        unit: u.unit.slug,
        title: awaiting
          ? `Aguardando token — ${u.unit.short}`
          : `Sync atrasado — ${u.unit.short}`,
        detail: u.sync.label,
        action: awaiting
          ? 'Colar AVEC_API_TOKEN na Vercel → sync full'
          : 'Rodar sync ou validar cron',
      })
    }

    if (u.today.noShows > 0) {
      actions.push({
        id: `noshow-${u.unit.slug}`,
        severity: u.today.noShows >= 3 ? 'critical' : 'warning',
        unit: u.unit.slug,
        title: `No-show — ${u.unit.short}`,
        detail: `${u.today.noShows} hoje · risco ~R$ ${Math.round(u.today.noShows * u.today.ticketAvg)}`,
        action: 'Remarcar + confirmação WhatsApp',
      })
    }

    if (u.today.cancelled > 0) {
      actions.push({
        id: `cancel-${u.unit.slug}`,
        severity: u.today.cancelled >= 3 ? 'warning' : 'info',
        unit: u.unit.slug,
        title: `Cancelamentos — ${u.unit.short}`,
        detail: `${u.today.cancelled} hoje`,
        action: 'Encaixe na lista de espera',
      })
    }

    if (u.opsToday.openSlotsNext2h >= 2) {
      actions.push({
        id: `slots-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Vagas nas 2h — ${u.unit.short}`,
        detail: `${u.opsToday.openSlotsNext2h} livres`,
        action: 'Campanha rápida de encaixe',
      })
    }

    if (u.opsWeek.reactivationCount >= 10) {
      actions.push({
        id: `react-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Reativar — ${u.unit.short}`,
        detail: `${u.opsWeek.reactivationCount} sem retorno`,
        action: 'Lista WhatsApp esta semana',
      })
    }

    if (u.opsWeek.returnRate > 0 && u.opsWeek.returnRate < 0.45) {
      actions.push({
        id: `return-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Retorno baixo — ${u.unit.short}`,
        detail: `${Math.round(u.opsWeek.returnRate * 100)}%`,
        action: 'Reforçar pós-atendimento',
      })
    }

    if (u.opsCommerce.ratingsCount > 0 && u.opsCommerce.ratingsAvg < 4.2) {
      actions.push({
        id: `rate-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Nota baixa — ${u.unit.short}`,
        detail: `${u.opsCommerce.ratingsAvg.toFixed(1)} (${u.opsCommerce.ratingsCount})`,
        action: 'Revisar experiência',
      })
    }

    if (u.opsCommerce.birthdayCount >= 5) {
      actions.push({
        id: `bday-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Aniversariantes — ${u.unit.short}`,
        detail: `${u.opsCommerce.birthdayCount} no período`,
        action: 'Campanha de convite',
      })
    }
  }

  const gap = Math.max(0, todayGoal - todayRevenue)
  if (gap > 500) {
    actions.push({
      id: 'goal-gap',
      severity: 'info',
      unit: 'both',
      title: 'Meta do dia em aberto',
      detail: `Faltam R$ ${Math.round(gap).toLocaleString('pt-BR')}`,
      action: 'Vagas + upsell nos restantes',
    })
  }

  return actions
    .sort((a, b) => SEV[a.severity] - SEV[b.severity])
    .slice(0, 8)
}

function consolidate(units: UnitSnapshot[]): CerebroOverview['consolidated'] {
  const todayRevenue = units.reduce((a, u) => a + u.today.revenue, 0)
  const todayGoal = units.reduce((a, u) => a + u.today.dailyGoal, 0)
  const mtdRevenue = units.reduce((a, u) => a + u.mtd.revenue, 0)
  const mtdGoal = units.reduce((a, u) => a + u.mtd.goal, 0)
  const attended = units.reduce((a, u) => a + u.today.attended, 0)
  const appointments = units.reduce((a, u) => a + u.today.appointments, 0)
  const noShows = units.reduce((a, u) => a + u.today.noShows, 0)
  const capacity = units.reduce((a, u) => a + u.today.capacity, 0)
  const newClients = units.reduce((a, u) => a + u.today.newClients, 0)
  const returningClients = units.reduce((a, u) => a + u.today.returningClients, 0)
  const leads = units.reduce((a, u) => a + u.today.leads, 0)
  const converted = units.reduce((a, u) => a + u.today.converted, 0)
  const mixBase = newClients + returningClients

  return {
    todayRevenue,
    todayGoal,
    todayGoalProgress: rate(todayRevenue, todayGoal),
    mtdRevenue,
    mtdGoal,
    mtdGoalProgress: rate(mtdRevenue, mtdGoal),
    attendanceRate: rate(attended, appointments),
    noShowRate: rate(noShows, appointments),
    occupancyRate: rate(appointments, capacity),
    ticketAvg: attended > 0 ? Math.round(todayRevenue / attended) : 0,
    revenueAtRisk: units.reduce((a, u) => a + u.today.noShows * u.today.ticketAvg, 0),
    newClients,
    returningClients,
    conversionRate: rate(converted, leads),
    openSlotsToday: units.reduce((a, u) => a + u.opsToday.openSlotsToday, 0),
    openSlotsNext2h: units.reduce((a, u) => a + u.opsToday.openSlotsNext2h, 0),
    cancelledToday: units.reduce((a, u) => a + u.today.cancelled, 0),
    noShowsToday: noShows,
    newShare: mixBase > 0 ? newClients / mixBase : 0,
  }
}

export async function buildLiveOverview(): Promise<CerebroOverview> {
  const configs = getUnitConfigs()
  const configured = configs.filter((c) => c.databaseUrl)
  if (configured.length === 0) {
    throw new Error('Nenhuma NEON_*_DATABASE_URL configurada')
  }

  const settled = await Promise.allSettled(configured.map((c) => fetchLiveUnit(c)))
  const units: UnitSnapshot[] = []
  const fetchErrors: AlertItem[] = []

  settled.forEach((result, idx) => {
    const cfg = configured[idx]!
    if (result.status === 'fulfilled') {
      units.push(result.value)
    } else {
      fetchErrors.push({
        id: `fetch-${cfg.meta.slug}`,
        severity: 'critical',
        unit: cfg.meta.slug,
        title: `Neon offline — ${cfg.meta.name}`,
        detail: String(result.reason?.message ?? result.reason),
        action: 'Validar connection string',
      })
    }
  })

  if (units.length === 0) {
    throw new Error('Nenhuma unidade live respondeu')
  }

  units.sort((a, b) => a.unit.slug.localeCompare(b.unit.slug))

  const consolidated = consolidate(units)
  const brasil = units.find((u) => u.unit.slug === 'rom-brasil')
  const iguatemi = units.find((u) => u.unit.slug === 'rom-iguatemi')
  const days = brasil?.last30 ?? iguatemi?.last30 ?? []
  const trend30 = days.map((row, idx) => ({
    day: row.day.slice(5),
    brasil: brasil?.last30[idx]?.revenue ?? 0,
    iguatemi: iguatemi?.last30[idx]?.revenue ?? 0,
  }))

  const nextActions = [
    ...fetchErrors,
    ...buildNextActions(units, consolidated.todayGoal, consolidated.todayRevenue),
  ]
  if (units.length < 2) {
    nextActions.unshift({
      id: 'partial-units',
      severity: 'warning',
      unit: 'both',
      title: 'Consolidado parcial',
      detail: `Só ${units[0]?.unit.short ?? 'uma unidade'} no painel`,
      action: 'Completar NEON_*_DATABASE_URL',
    })
  }

  const partial = units.length < configs.length || fetchErrors.length > 0

  return {
    generatedAt: new Date().toISOString(),
    mode: 'live',
    partial,
    periodLabel: partial
      ? `Live parcial · ${todayIsoSaoPaulo()}`
      : `Live · ${todayIsoSaoPaulo()}`,
    consolidated,
    units,
    trend30,
    nextActions: nextActions
      .sort((a, b) => SEV[a.severity] - SEV[b.severity])
      .slice(0, 8),
    comparison: buildComparison(units),
  }
}

export async function buildOverview(): Promise<CerebroOverview> {
  const hasDb = getUnitConfigs().some((c) => c.databaseUrl)
  const forceMock = process.env.CEREBRO_FORCE_MOCK === '1'
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  if (forceMock && !isProd) {
    return buildMockOverview()
  }

  if (!hasDb) {
    if (isProd) {
      return {
        generatedAt: new Date().toISOString(),
        mode: 'degraded',
        partial: true,
        periodLabel: `Degradado · ${todayIsoSaoPaulo()}`,
        consolidated: {
          todayRevenue: 0,
          todayGoal: 0,
          todayGoalProgress: 0,
          mtdRevenue: 0,
          mtdGoal: 0,
          mtdGoalProgress: 0,
          attendanceRate: 0,
          noShowRate: 0,
          occupancyRate: 0,
          ticketAvg: 0,
          revenueAtRisk: 0,
          newClients: 0,
          returningClients: 0,
          conversionRate: 0,
          openSlotsToday: 0,
          openSlotsNext2h: 0,
          cancelledToday: 0,
          noShowsToday: 0,
          newShare: 0,
        },
        units: [],
        trend30: [],
        nextActions: [
          {
            id: 'no-neon',
            severity: 'critical',
            unit: 'both',
            title: 'Neons não configurados',
            detail: 'NEON_*_DATABASE_URL ausente em produção',
            action: 'Configurar connection strings na Vercel',
          },
        ],
      }
    }
    return buildMockOverview()
  }

  try {
    return await buildLiveOverview()
  } catch (err) {
    return {
      generatedAt: new Date().toISOString(),
      mode: 'degraded',
      partial: true,
      periodLabel: `Degradado · ${todayIsoSaoPaulo()}`,
      consolidated: {
        todayRevenue: 0,
        todayGoal: 0,
        todayGoalProgress: 0,
        mtdRevenue: 0,
        mtdGoal: 0,
        mtdGoalProgress: 0,
        attendanceRate: 0,
        noShowRate: 0,
        occupancyRate: 0,
        ticketAvg: 0,
        revenueAtRisk: 0,
        newClients: 0,
        returningClients: 0,
        conversionRate: 0,
        openSlotsToday: 0,
        openSlotsNext2h: 0,
        cancelledToday: 0,
        noShowsToday: 0,
        newShare: 0,
      },
      units: [],
      trend30: [],
      nextActions: [
        {
          id: 'live-degraded',
          severity: 'critical',
          unit: 'both',
          title: 'Live indisponível',
          detail: String(err instanceof Error ? err.message : err),
          action: 'Checar Neons e reiniciar',
        },
      ],
    }
  }
}
