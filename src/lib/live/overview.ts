import { buildMockOverview } from '@/lib/mock-overview'
import { fetchLiveUnit } from '@/lib/live/fetch-unit'
import { getUnitConfigs, todayIsoSaoPaulo } from '@/lib/unit-config'
import { clamp01 } from '@/lib/format'
import type {
  AlertItem,
  CerebroOverview,
  DecisionInsight,
  UnitSlug,
  UnitSnapshot,
} from '@/lib/types'

function rate(num: number, den: number): number {
  if (den <= 0) return 0
  return clamp01(num / den)
}

function buildAlerts(units: UnitSnapshot[], todayGoal: number, todayRevenue: number): AlertItem[] {
  const alerts: AlertItem[] = []

  for (const u of units) {
    if (u.sync.status === 'error') {
      alerts.push({
        id: `sync-error-${u.unit.slug}`,
        severity: 'critical',
        unit: u.unit.slug,
        title: `Sync Avec com erro — ${u.unit.short}`,
        detail: u.sync.label,
        action: 'Checar cron, token Avec e tabelas delta (snapshots) no Neon',
      })
    } else if (u.sync.status === 'stale') {
      const awaitingToken = /Aguardando AVEC_API_TOKEN|Sem registro de sync/i.test(u.sync.label)
      alerts.push({
        id: `sync-stale-${u.unit.slug}`,
        severity: awaitingToken ? 'info' : 'warning',
        unit: u.unit.slug,
        title: awaitingToken
          ? `Aguardando token Avec — ${u.unit.short}`
          : `Sync Avec atrasado — ${u.unit.short}`,
        detail: u.sync.label,
        action: awaitingToken
          ? 'Quando o token chegar: colar AVEC_API_TOKEN na Vercel → redeploy → Admin → Rodar sync'
          : 'Rodar sync manual ou validar cron-job.org',
      })
    }

    if (u.today.noShows > 0) {
      const risk = u.today.noShows * (u.today.ticketAvg || 0)
      alerts.push({
        id: `noshow-${u.unit.slug}`,
        severity: u.today.noShows >= 3 ? 'critical' : 'warning',
        unit: u.unit.slug,
        title: `No-show em ${u.unit.short}`,
        detail: `${u.today.noShows} no-show(s) hoje${risk > 0 ? ` · risco ~R$ ${Math.round(risk)}` : ''}.`,
        action: 'Remarcar e reforçar confirmação WhatsApp',
      })
    }

    if (u.opsP0.cancelledToday > 0) {
      alerts.push({
        id: `cancel-${u.unit.slug}`,
        severity: u.opsP0.cancelledToday >= 3 ? 'warning' : 'info',
        unit: u.unit.slug,
        title: `Cancelamentos em ${u.unit.short}`,
        detail: `${u.opsP0.cancelledToday} cancelamento(s) hoje (Avec 0052).`,
        action: 'Oferecer encaixe na lista de espera / WhatsApp',
      })
    }

    if (u.opsP0.openSlotsNext2h >= 2) {
      alerts.push({
        id: `slots-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Vagas nas próximas 2h — ${u.unit.short}`,
        detail: `${u.opsP0.openSlotsNext2h} horário(s) livres estimados · ${u.opsP0.appointmentsNext2h} já agendados.`,
        action: 'Campanha rápida de encaixe',
      })
    }

    const sparse =
      u.today.revenue === 0 &&
      u.mtd.revenue === 0 &&
      u.today.attended === 0 &&
      u.mtd.attended === 0
    if (sparse) {
      alerts.push({
        id: `sparse-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Dados financeiros ainda fracos — ${u.unit.short}`,
        detail:
          'Há conexão live, mas faturamento/atendidos no Neon estão zerados ou quase. O sync Avec precisa popular revenue/attended.',
        action: 'Priorizar AVEC_API_TOKEN + sync full diário',
      })
    }
  }

  const gap = Math.max(0, todayGoal - todayRevenue)
  if (gap > 0) {
    alerts.push({
      id: 'goal-gap',
      severity: 'info',
      unit: 'both',
      title: 'Meta consolidada do dia em aberto',
      detail: `Faltam R$ ${Math.round(gap).toLocaleString('pt-BR')} para a meta das duas unidades.`,
      action: 'Olhar horários vagos e upsell nos atendimentos restantes',
    })
  }

  return alerts.slice(0, 8)
}

function buildDecisions(units: UnitSnapshot[], deltaRevenuePct: number): DecisionInsight[] {
  const brasil = units.find((u) => u.unit.slug === 'rom-brasil')
  const iguatemi = units.find((u) => u.unit.slug === 'rom-iguatemi')
  const decisions: DecisionInsight[] = []

  if (brasil && iguatemi) {
    if (brasil.mtd.revenue !== iguatemi.mtd.revenue) {
      const leader = brasil.mtd.revenue >= iguatemi.mtd.revenue ? brasil : iguatemi
      const trailer = leader === brasil ? iguatemi : brasil
      decisions.push({
        id: 'd-revenue',
        title: `${leader.unit.short} puxa o consolidado`,
        detail: `MTD ${leader.unit.short} à frente de ${trailer.unit.short} (${(Math.abs(deltaRevenuePct) * 100).toFixed(0)}% de diferença relativa). Replicar grade/mix da unidade líder.`,
        impact: 'Receita MTD',
      })
    }

    for (const u of units) {
      const occ = rate(u.today.appointments, u.today.capacity)
      if (occ < 0.7) {
        decisions.push({
          id: `d-occ-${u.unit.slug}`,
          title: `Ocupação com folga — ${u.unit.short}`,
          detail: `${u.today.appointments}/${u.today.capacity} horários. Campanha rápida de encaixe (lista de espera / WhatsApp).`,
          impact: 'Ocupação',
        })
      }
    }
  }

  decisions.push({
    id: 'd-data',
    title: 'Qualidade do dado é o próximo alavanca',
    detail:
      'Com Avec populando revenue/attended de verdade, estes KPIs passam de “comando” para precisão diária. Enquanto isso, use agenda + sync status como norte.',
    impact: 'Confiabilidade',
  })

  return decisions.slice(0, 5)
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
  const ticketAvg = attended > 0 ? Math.round(todayRevenue / attended) : 0
  const revenueAtRisk = units.reduce((a, u) => a + u.today.noShows * u.today.ticketAvg, 0)
  const openSlotsToday = units.reduce((a, u) => a + u.opsP0.openSlotsToday, 0)
  const openSlotsNext2h = units.reduce((a, u) => a + u.opsP0.openSlotsNext2h, 0)
  const cancelledToday = units.reduce((a, u) => a + u.opsP0.cancelledToday, 0)
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
    ticketAvg,
    revenueAtRisk,
    newClients,
    conversionRate: rate(converted, leads),
    openSlotsToday,
    openSlotsNext2h,
    cancelledToday,
    noShowsToday: noShows,
    returningClients,
    newShare: mixBase > 0 ? newClients / mixBase : 0,
  }
}

function leaderBy(
  units: UnitSnapshot[],
  score: (u: UnitSnapshot) => number,
): UnitSlug {
  const sorted = [...units].sort((a, b) => score(b) - score(a))
  return sorted[0]?.unit.slug ?? 'rom-brasil'
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
        title: `Falha ao ler Neon — ${cfg.meta.name}`,
        detail: String(result.reason?.message ?? result.reason),
        action: 'Validar connection string e firewall Neon',
      })
    }
  })

  if (units.length === 0) {
    throw new Error('Nenhuma unidade live respondeu')
  }

  // Garante ordem Brasil → Iguatemi quando ambas existem
  units.sort((a, b) => a.unit.slug.localeCompare(b.unit.slug))

  const consolidated = consolidate(units)
  const brasil = units.find((u) => u.unit.slug === 'rom-brasil')
  const iguatemi = units.find((u) => u.unit.slug === 'rom-iguatemi')

  const deltaRevenuePct =
    brasil && iguatemi && iguatemi.mtd.revenue > 0
      ? (brasil.mtd.revenue - iguatemi.mtd.revenue) / iguatemi.mtd.revenue
      : brasil && iguatemi && brasil.mtd.revenue > 0
        ? 1
        : 0

  const brasilByDay = new Map(brasil?.last30.map((d) => [d.day, d.revenue]) ?? [])
  const iguatemiByDay = new Map(iguatemi?.last30.map((d) => [d.day, d.revenue]) ?? [])
  const allDays = [
    ...new Set([...brasilByDay.keys(), ...iguatemiByDay.keys()]),
  ].sort()
  const trend30 = allDays.map((day) => {
    const b = brasilByDay.get(day) ?? 0
    const i = iguatemiByDay.get(day) ?? 0
    return {
      day: day.slice(5),
      brasil: b,
      iguatemi: i,
      total: b + i,
    }
  })

  const alerts = [...fetchErrors, ...buildAlerts(units, consolidated.todayGoal, consolidated.todayRevenue)]
  if (units.length < 2) {
    alerts.unshift({
      id: 'partial-units',
      severity: 'warning',
      unit: 'both',
      title: 'Só uma unidade live no painel',
      detail: 'Configure as duas NEON_*_DATABASE_URL para consolidar Brasil + Iguatemi.',
      action: 'Completar .env.local do Cérebro',
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'live',
    periodLabel: `Live Neon · ${todayIsoSaoPaulo()} (America/Sao_Paulo)`,
    consolidated,
    units,
    comparison: {
      revenueLeader: leaderBy(units, (u) => u.mtd.revenue),
      occupancyLeader: leaderBy(units, (u) => rate(u.today.appointments, u.today.capacity)),
      attendanceLeader: leaderBy(units, (u) => rate(u.today.attended, u.today.appointments)),
      ticketLeader: leaderBy(units, (u) => u.today.ticketAvg),
      deltaRevenuePct,
    },
    trend30,
    alerts,
    decisions: buildDecisions(units, deltaRevenuePct),
  }
}

export async function buildOverview(): Promise<CerebroOverview> {
  const forceMock = process.env.CEREBRO_FORCE_MOCK === '1'
  const hasAnyUrl = getUnitConfigs().some((c) => c.databaseUrl)

  if (forceMock || !hasAnyUrl) {
    return buildMockOverview()
  }

  try {
    return await buildLiveOverview()
  } catch (err) {
    const mock = buildMockOverview()
    mock.mode = 'fallback'
    mock.alerts = [
      {
        id: 'live-fallback',
        severity: 'critical',
        unit: 'both',
        title: 'Live falhou — dados abaixo são mock (não use para decisão)',
        detail: String(err instanceof Error ? err.message : err),
        action: 'Checar NEON_*_DATABASE_URL e conectividade antes de agir',
      },
      ...mock.alerts,
    ]
    mock.periodLabel = `Fallback mock (live error) · ${todayIsoSaoPaulo()}`
    return mock
  }
}
